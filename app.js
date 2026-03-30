import { db, ref, onValue, get, push, update, set } from "./firebase-config.js";

export const DEFAULT_SETTINGS = {
  perOrderMinutes: 15,
  decayLagMinutes: 5,
  decayStepMinutes: 5,
  isOpen: true,
  pinCode: "1234",
  manualAdjustMinutes: 0
};

export const DEFAULT_PUBLIC_STATUS = {
  isOpen: true,
  displayWaitMinutes: 0,
  updatedAt: 0,
  futureEvents: [],
  finishEstimateMinutes: 15
};

const AUTO_CLOSE_HOUR = 19;

export function subscribeAll(callback) {
  const state = {
    settings: { ...DEFAULT_SETTINGS },
    orders: {},
    logs: {}
  };

  const emit = () => {
    callback({
      settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) },
      orders: state.orders || {},
      logs: state.logs || {}
    });
  };

  const unsubSettings = onValue(ref(db, "/settings"), async (snapshot) => {
    state.settings = { ...DEFAULT_SETTINGS, ...(snapshot.val() || {}) };
    await enforceAutoCloseIfNeeded(state.settings);
    emit();
  });

  const unsubOrders = onValue(ref(db, "/orders"), (snapshot) => {
    state.orders = snapshot.val() || {};
    emit();
  });

  const unsubLogs = onValue(ref(db, "/logs"), (snapshot) => {
    state.logs = snapshot.val() || {};
    emit();
  });

  return () => {
    unsubSettings();
    unsubOrders();
    unsubLogs();
  };
}

export function subscribePublicStatus(callback) {
  return onValue(ref(db, "/publicStatus"), (snapshot) => {
    const value = snapshot.val() || {};
    callback({
      ...DEFAULT_PUBLIC_STATUS,
      ...value,
      futureEvents: normalizeFutureEvents(value.futureEvents)
    });
  });
}

export async function ensureInitialData() {
  const settingsSnapshot = await get(ref(db, "/settings"));
  if (!settingsSnapshot.exists()) {
    await set(ref(db, "/settings"), DEFAULT_SETTINGS);
  }

  const publicStatusSnapshot = await get(ref(db, "/publicStatus"));
  if (!publicStatusSnapshot.exists()) {
    await refreshPublicStatus();
  }
}

async function enforceAutoCloseIfNeeded(settings) {
  const now = new Date();
  if (now.getHours() >= AUTO_CLOSE_HOUR && settings.isOpen) {
    await update(ref(db, "/settings"), { isOpen: false });
    await writeLog("close_reception", null, Date.now());
    await refreshPublicStatus();
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
  const orderMinutes = Object.values(orders || {}).reduce((sum, order) => {
    return sum + calculateOrderRemainingMinutes(order, settings, now);
  }, 0);

  const manualAdjust = Number(settings.manualAdjustMinutes || 0);
  return Math.max(0, orderMinutes + manualAdjust);
}

export function calculateDisplayedWaitFromPublicStatus(publicStatus, now = Date.now()) {
  if (!publicStatus) {
    return 0;
  }

  let current = Number(publicStatus.displayWaitMinutes || 0);
  const events = normalizeFutureEvents(publicStatus.futureEvents);

  for (const event of events) {
    if (now >= Number(event.timestamp)) {
      current = Number(event.waitMinutes || 0);
    } else {
      break;
    }
  }

  return Math.max(0, current);
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

function normalizeFutureEvents(futureEvents) {
  if (!futureEvents) {
    return [];
  }

  if (Array.isArray(futureEvents)) {
    return futureEvents
      .filter(Boolean)
      .map((event) => ({
        timestamp: Number(event.timestamp),
        waitMinutes: Number(event.waitMinutes)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  return Object.values(futureEvents)
    .filter(Boolean)
    .map((event) => ({
      timestamp: Number(event.timestamp),
      waitMinutes: Number(event.waitMinutes)
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function buildFutureEvents(orders, settings, now = Date.now()) {
  const activeOrders = getActiveOrders(orders);

  const candidates = activeOrders
    .flatMap(([, order]) => buildDecayTimes(order, settings))
    .filter((timestamp) => timestamp > now);

  const uniqueSortedTimestamps = [...new Set(candidates)].sort((a, b) => a - b);

  return uniqueSortedTimestamps.map((timestamp) => ({
    timestamp,
    waitMinutes: calculateCurrentWaitMinutes(orders, settings, timestamp)
  }));
}

export async function refreshPublicStatus() {
  const [settingsSnapshot, ordersSnapshot] = await Promise.all([
    get(ref(db, "/settings")),
    get(ref(db, "/orders"))
  ]);

  const settings = { ...DEFAULT_SETTINGS, ...(settingsSnapshot.val() || {}) };
  const orders = ordersSnapshot.val() || {};
  const now = Date.now();

  const publicStatus = {
    isOpen: Boolean(settings.isOpen),
    displayWaitMinutes: calculateCurrentWaitMinutes(orders, settings, now),
    updatedAt: now,
    futureEvents: buildFutureEvents(orders, settings, now),
    finishEstimateMinutes: 15
  };

  await set(ref(db, "/publicStatus"), publicStatus);
  return publicStatus;
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
  await refreshPublicStatus();
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
  await refreshPublicStatus();
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
  await refreshPublicStatus();
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

  await refreshPublicStatus();
}

export async function adjustManualWaitMinutes(delta, settings = DEFAULT_SETTINGS) {
  const current = Number(settings.manualAdjustMinutes || 0);
  const next = Math.max(0, current + delta);

  await update(ref(db, "/settings"), {
    manualAdjustMinutes: next
  });

  await writeLog(delta > 0 ? "manual_adjust_plus" : "manual_adjust_minus", null, Date.now());
  await refreshPublicStatus();
  return next;
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
    open_reception: "受付開始",
    close_reception: "受付終了",
    manual_adjust_plus: "1分増やす",
    manual_adjust_minus: "1分減らす"
  };

  return labels[type] || type;
}