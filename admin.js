import {
  ensureInitialData,
  subscribeAll,
  calculateCurrentWaitMinutes,
  getActiveOrders,
  getTodayTotalOrders,
  findNextDecayTime,
  formatMinutesLabel,
  formatTime,
  addOrder,
  cancelLatestActiveOrder,
  completeOldestActiveOrder,
  setReceptionOpen,
  saveSettings
} from "./app.js";

const pinGate = document.getElementById("pin-gate");
const adminPanel = document.getElementById("admin-panel");
const pinForm = document.getElementById("pin-form");
const pinInput = document.getElementById("pin-input");
const pinError = document.getElementById("pin-error");
const actionMessage = document.getElementById("admin-action-message");

const currentWaitEl = document.getElementById("admin-current-wait");
const nextDecayEl = document.getElementById("admin-next-decay");
const openStatusEl = document.getElementById("admin-open-status");
const totalOrdersEl = document.getElementById("admin-total-orders");
const activeOrdersEl = document.getElementById("admin-active-orders");

const addOrderButton = document.getElementById("add-order-button");
const cancelOrderButton = document.getElementById("cancel-order-button");
const completeOrderButton = document.getElementById("complete-order-button");
const openReceptionButton = document.getElementById("open-reception-button");
const closeReceptionButton = document.getElementById("close-reception-button");

const settingsForm = document.getElementById("settings-form");
const perOrderInput = document.getElementById("per-order-minutes");
const decayLagInput = document.getElementById("decay-lag-minutes");
const decayStepInput = document.getElementById("decay-step-minutes");

let latestData = null;
let isAuthenticated = sessionStorage.getItem("roastery_admin_authenticated") === "true";

await ensureInitialData();

subscribeAll((data) => {
  latestData = data;
  if (isAuthenticated) {
    renderAdmin(data);
  }
});

pinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!latestData) {
    pinError.textContent = "データの読み込み中です。";
    return;
  }

  if (pinInput.value === String(latestData.settings.pinCode || "")) {
    isAuthenticated = true;
    sessionStorage.setItem("roastery_admin_authenticated", "true");
    pinError.textContent = "";
    renderAuthenticatedState();
    renderAdmin(latestData);
  } else {
    pinError.textContent = "PINが正しくありません。";
  }
});

addOrderButton.addEventListener("click", async () => {
  await runAction(async () => {
    const orderId = await addOrder();
    return `注文を追加しました。(${orderId})`;
  });
});

cancelOrderButton.addEventListener("click", async () => {
  await runAction(async () => {
    const orderId = await cancelLatestActiveOrder(latestData.orders, latestData.settings);
    return `直前の注文を取消しました。(${orderId})`;
  });
});

completeOrderButton.addEventListener("click", async () => {
  await runAction(async () => {
    const orderId = await completeOldestActiveOrder(latestData.orders);
    return `最も古い有効注文を完了扱いにしました。(${orderId})`;
  });
});

openReceptionButton.addEventListener("click", async () => {
  await runAction(async () => {
    await setReceptionOpen(true);
    return "受付開始に切り替えました。";
  });
});

closeReceptionButton.addEventListener("click", async () => {
  await runAction(async () => {
    await setReceptionOpen(false);
    return "受付終了に切り替えました。";
  });
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(async () => {
    await saveSettings({
      perOrderMinutes: perOrderInput.value,
      decayLagMinutes: decayLagInput.value,
      decayStepMinutes: decayStepInput.value
    });
    return "設定を保存しました。";
  });
});

if (isAuthenticated) {
  renderAuthenticatedState();
}

function renderAuthenticatedState() {
  pinGate.classList.add("hidden");
  adminPanel.classList.remove("hidden");
}

function renderAdmin(data) {
  const now = Date.now();
  const waitMinutes = calculateCurrentWaitMinutes(data.orders, data.settings, now);
  const activeOrders = getActiveOrders(data.orders);
  const nextDecayTime = findNextDecayTime(data.orders, data.settings, now);

  currentWaitEl.textContent = waitMinutes > 0 ? formatMinutesLabel(waitMinutes) : "0分";
  nextDecayEl.textContent = `次の自動減少目安: ${nextDecayTime ? formatTime(nextDecayTime) : "なし"}`;
  openStatusEl.textContent = data.settings.isOpen ? "受付中" : "受付終了";
  totalOrdersEl.textContent = String(getTodayTotalOrders(data.orders));
  activeOrdersEl.textContent = String(activeOrders.length);

  perOrderInput.value = data.settings.perOrderMinutes;
  decayLagInput.value = data.settings.decayLagMinutes;
  decayStepInput.value = data.settings.decayStepMinutes;
}

async function runAction(action) {
  actionMessage.textContent = "処理中...";
  setButtonsDisabled(true);
  try {
    const message = await action();
    actionMessage.textContent = message;
  } catch (error) {
    actionMessage.textContent = error.message || "エラーが発生しました。";
  } finally {
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  [
    addOrderButton,
    cancelOrderButton,
    completeOrderButton,
    openReceptionButton,
    closeReceptionButton
  ].forEach((button) => {
    button.disabled = disabled;
  });
}
