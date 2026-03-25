import { db, ref, onValue, get, push, update, set } from "./firebase-config.js";

export const DEFAULT_SETTINGS = {
  perOrderMinutes: 15,
  decayLagMinutes: 5,
  decayStepMinutes: 5,
  isOpen: true,
  pinCode: "1234"
};

const AUTO_CLOSE_HOUR = 19;

export function subscribeAll(callback) {
  const rootRef = ref(db, "/");
  return onValue(rootRef, async (snapshot) => {
    const data = snapshot.val() || {};
    const normalized = {
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      orders: data.orders || {},
      logs: data.logs || {}
    };

    await enforceAutoCloseIfNeeded(normalized.settings);
    callback(normalized);
  });
}

export async function ensureInitialData() {
  const snapshot = await get(ref(db, "/settings"));
  if (!snapshot.exists()) {
    await set(ref(db, "/settings"), DEFAULT_SETTINGS);
  }
}

async function enforceAutoCloseIfNeeded(settings) {
  const now = new Date();
  if (now.getHours() >= AUTO_CLOSE_HOUR && settings.isOpen) {
    await update(ref(db, "/settings"), { isOpen: false });
    await writeLog("close_reception", null, Date.now());
  }
}

export function calculateOrderRemainingMinutes(order, settings, now = Date.now()) {
  if (!order || order.status !== "active") {
    return 0;
  }

  const perOrderMinutes = Number(settings.perOrderMinutes) || DEFAULT_SETTINGS.perOrderMinutes;
  const decayLagMinutes = Number(settings.decayLagMinutes ?? DEFAULT_SETTINGS.decayLagMinutes);
  const decayStepMinutes = Number(settings.decayStepMinutes) || DEFAULT_SETTINGS.decayStepMinutes;

  const elapsedMs = Math.max(0, now - Number(order.createdAt || 0));
  const lagMs = decayLagMinutes * 60 * 1000;
  const stepMs = decayStepMinutes * 60 * 1000;

  let decreaseSteps = 0;

  if (elapsedMs >= lagMs) {
    const afterLagMs = elapsedMs - lagMs;
    decreaseSteps = Math.floor(afterLagMs / stepMs) + 1;
  }

  const remaining = perOrderMinutes - decreaseSteps * decayStepMinutes;
  return Math.max(0, remaining);
}

export function calculateCurrentWaitMinutes(orders, settings, now = Date.now()) {
  return Object.values(orders || {}).reduce((sum, order) => {
    return sum + calculateOrderRemainingMinutes(order, settings, now);
  }, 0);
}

export function getActiveOrders(orders = {}) {
  return Object.entries(orders)
    .filter(([, order]) => order.status === "active")
    .sort((a, b) => Number(a[1].createdAt) - Number(b[1].createdAt));
}

export function getTodayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function getTodayLogs(logs = {}, now = new Date()) {
  const { startMs, endMs } = getTodayRange(now);
  return Object.entries(logs)
    .map(([id, log]) => ({ id, ...log }))
    .filter((log) => Number(log.timestamp) >= startMs && Number(log.timestamp) < endMs)
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
}

export function getTodayTotalOrders(orders = {}, now = new Date()) {
  const { startMs, endMs } = getTodayRange(now);
  return Object.values(orders).filter((order) => {
    const createdAt = Number(order.createdAt || 0);
    return createdAt >= startMs && createdAt < endMs;
  }).length;
}

export function formatMinutesLabel(minutes) {
  if (minutes <= 0) {
    return "0分";
  }
  return `約 ${minutes} 分`;
}

export function formatDateTime(timestamp) {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function formatTime(timestamp) {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function findNextDecayTime(orders = {}, settings = {}, now = Date.now()) {
  const activeOrders = getActiveOrders(orders);
  const futureCandidates = activeOrders
    .flatMap(([, order]) => buildDecayTimes(order, settings))
    .filter((timestamp) => timestamp > now)
    .sort((a, b) => a - b);

  return futureCandidates[0] || null;
}

function buildDecayTimes(order, settings) {
  const createdAt = Number(order.createdAt || 0);
  const perOrderMinutes = Number(settings.perOrderMinutes) || DEFAULT_SETTINGS.perOrderMinutes;
  const decayLagMinutes = Number(settings.decayLagMinutes ?? DEFAULT_SETTINGS.decayLagMinutes);
  const decayStepMinutes = Number(settings.decayStepMinutes) || DEFAULT_SETTINGS.decayStepMinutes;

  const steps = Math.ceil(perOrderMinutes / decayStepMinutes);

  return Array.from({ length: steps }, (_, index) => {
    const minutesFromStart = decayLagMinutes + index * decayStepMinutes;
    return createdAt + minutesFromStart * 60 * 1000;
  });
}

export async function addOrder(settings = DEFAULT_SETTINGS) {
  if (!settings.isOpen) {
    throw new Error("受付を開始してください。");
  }

  const orderRef = push(ref(db, "/orders"));
  const timestamp = Date.now();
  const orderId = orderRef.key;

  await set(orderRef, {
    createdAt: timestamp,
    status: "active"
  });

  await writeLog("add_order", orderId, timestamp);
  return orderId;
}

export async function cancelLatestActiveOrder(orders, settings) {
  const now = Date.now();
  const activeOrders = getActiveOrders(orders).filter(([, order]) => {
    return calculateOrderRemainingMinutes(order, settings, now) > 0;
  });

  if (!activeOrders.length) {
    throw new Error("取消可能な注文がありません。");
  }

  const [orderId] = activeOrders[activeOrders.length - 1];
  await update(ref(db, `/orders/${orderId}`), { status: "cancelled" });
  await writeLog("cancel_order", orderId, now);
  return orderId;
}

export async function completeOldestActiveOrder(orders) {
  const activeOrders = getActiveOrders(orders);
  if (!activeOrders.length) {
    throw new Error("完了扱いにできる有効注文がありません。");
  }

  const [orderId] = activeOrders[0];
  const timestamp = Date.now();
  await update(ref(db, `/orders/${orderId}`), { status: "completed" });
  await writeLog("complete_order", orderId, timestamp);
  return orderId;
}

export async function setReceptionOpen(isOpen) {
  const now = new Date();
  const timestamp = now.getTime();

  if (isOpen && now.getHours() >= AUTO_CLOSE_HOUR) {
    throw new Error("19時以降は受付開始できません。");
  }

  await update(ref(db, "/settings"), { isOpen });
  await writeLog(isOpen ? "open_reception" : "close_reception", null, timestamp);
}

export async function saveSettings(arg1, arg2) {
  let currentSettings;
  let nextSettings;

  if (arg2 === undefined) {
    currentSettings = { ...DEFAULT_SETTINGS };
    nextSettings = arg1 || {};
  } else {
    currentSettings = { ...DEFAULT_SETTINGS, ...(arg1 || {}) };
    nextSettings = arg2 || {};
  }

  const perOrderMinutes =
    nextSettings.perOrderMinutes === "" || nextSettings.perOrderMinutes == null
      ? Number(currentSettings.perOrderMinutes)
      : Number(nextSettings.perOrderMinutes);

  const decayLagMinutes =
    nextSettings.decayLagMinutes === "" || nextSettings.decayLagMinutes == null
      ? Number(currentSettings.decayLagMinutes)
      : Number(nextSettings.decayLagMinutes);

  const decayStepMinutes =
    nextSettings.decayStepMinutes === "" || nextSettings.decayStepMinutes == null
      ? Number(currentSettings.decayStepMinutes)
      : Number(nextSettings.decayStepMinutes);

  await update(ref(db, "/settings"), {
    perOrderMinutes,
    decayLagMinutes,
    decayStepMinutes
  });
}

async function writeLog(type, targetOrderId = null, timestamp = Date.now()) {
  const logRef = push(ref(db, "/logs"));
  await set(logRef, {
    type,
    targetOrderId,
    timestamp
  });
}

export function getLogTypeLabel(type) {
  const labels = {
    add_order: "注文追加",
    cancel_order: "取消",
    complete_order: "1件戻す",
    open_reception: "受付開始",
    close_reception: "受付終了"
  };

  return labels[type] || type;
}