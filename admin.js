import {
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "./firebase-config.js";
import {
  ensureInitialData,
  subscribeAll,
  calculateCurrentWaitMinutes,
  getActiveOrders,
  findNextDecayTime,
  formatMinutesLabel,
  formatTime,
  addOrder,
  cancelLatestActiveOrder,
  completeOldestActiveOrder,
  setReceptionOpen,
  saveSettings
} from "./app.js";

const authGate = document.getElementById("auth-gate");
const pinGate = document.getElementById("pin-gate");
const adminPanel = document.getElementById("admin-panel");

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const loginError = document.getElementById("login-error");

const pinForm = document.getElementById("pin-form");
const pinInput = document.getElementById("pin-input");
const pinError = document.getElementById("pin-error");

const actionMessage = document.getElementById("admin-action-message");

const currentWaitEl = document.getElementById("admin-current-wait");
const nextDecayEl = document.getElementById("admin-next-decay");
const openStatusEl = document.getElementById("admin-open-status");
const activeOrdersEl = document.getElementById("admin-active-orders");

const addOrderButton = document.getElementById("add-order-button");
const cancelOrderButton = document.getElementById("cancel-order-button");
const completeOrderButton = document.getElementById("complete-order-button");
const openReceptionButton = document.getElementById("open-reception-button");
const closeReceptionButton = document.getElementById("close-reception-button");
const logoutButton = document.getElementById("logout-button");

const settingsForm = document.getElementById("settings-form");
const perOrderInput = document.getElementById("per-order-minutes");
const decayLagInput = document.getElementById("decay-lag-minutes");
const decayStepInput = document.getElementById("decay-step-minutes");
const currentSettingsText = document.getElementById("current-settings-text");

let latestData = null;
let isFirebaseAuthenticated = false;
let isPinAuthenticated = sessionStorage.getItem("roastery_admin_pin_authenticated") === "true";

await ensureInitialData();

subscribeAll((data) => {
  latestData = data;

  if (isFirebaseAuthenticated && isPinAuthenticated) {
    renderAdmin(data);
  }
});

onAuthStateChanged(auth, (user) => {
  isFirebaseAuthenticated = !!user;

  if (!isFirebaseAuthenticated) {
    sessionStorage.removeItem("roastery_admin_pin_authenticated");
    isPinAuthenticated = false;
    showAuthGate();
    loginError.textContent = "未ログインです。";
    return;
  }

  loginError.textContent = `ログインできました。(${user.email})`;

  if (isPinAuthenticated) {
    showAdminPanel();
    if (latestData) {
      renderAdmin(latestData);
    }
  } else {
    showPinGate();
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "ログイン処理中です...";
  setLoginDisabled(true);

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
    loginError.textContent = `ログインできました。(${credential.user.email})`;
  } catch (error) {
    console.error(error);
    loginError.textContent = "ログインできませんでした。メールアドレスまたはパスワードを確認してください。";
  } finally {
    setLoginDisabled(false);
  }
});

pinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!latestData) {
    pinError.textContent = "データの読み込み中です。";
    return;
  }

  if (pinInput.value === String(latestData.settings.pinCode || "")) {
    isPinAuthenticated = true;
    sessionStorage.setItem("roastery_admin_pin_authenticated", "true");
    pinError.textContent = "PIN認証できました。";
    showAdminPanel();
    renderAdmin(latestData);
  } else {
    pinError.textContent = "PIN認証できませんでした。";
  }
});

logoutButton.addEventListener("click", async () => {
  sessionStorage.removeItem("roastery_admin_pin_authenticated");
  isPinAuthenticated = false;
  await signOut(auth);
});

addOrderButton.addEventListener("click", async () => {
  await runAction(async () => {
    const orderId = await addOrder(latestData.settings);
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
    await saveSettings(latestData.settings, {
      perOrderMinutes: perOrderInput.value,
      decayLagMinutes: decayLagInput.value,
      decayStepMinutes: decayStepInput.value
    });
    return "設定を保存しました。";
  });
});

function showAuthGate() {
  authGate.classList.remove("hidden");
  pinGate.classList.add("hidden");
  adminPanel.classList.add("hidden");
}

function showPinGate() {
  authGate.classList.add("hidden");
  pinGate.classList.remove("hidden");
  adminPanel.classList.add("hidden");
}

function showAdminPanel() {
  authGate.classList.add("hidden");
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
  activeOrdersEl.textContent = String(activeOrders.length);

  perOrderInput.placeholder = String(data.settings.perOrderMinutes);
  decayLagInput.placeholder = String(data.settings.decayLagMinutes);
  decayStepInput.placeholder = String(data.settings.decayStepMinutes);

  perOrderInput.value = "";
  decayLagInput.value = "";
  decayStepInput.value = "";

  currentSettingsText.textContent =
    `現在設定: 加算 ${data.settings.perOrderMinutes}分 / ` +
    `ラグ ${data.settings.decayLagMinutes}分 / ` +
    `刻み ${data.settings.decayStepMinutes}分`;
}

async function runAction(action) {
  actionMessage.textContent = "処理中...";
  setButtonsDisabled(true);

  try {
    const message = await action();
    actionMessage.textContent = message;
  } catch (error) {
    console.error(error);
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
    closeReceptionButton,
    logoutButton
  ].forEach((button) => {
    button.disabled = disabled;
  });
}

function setLoginDisabled(disabled) {
  emailInput.disabled = disabled;
  passwordInput.disabled = disabled;
  loginForm.querySelector("button[type='submit']").disabled = disabled;
}