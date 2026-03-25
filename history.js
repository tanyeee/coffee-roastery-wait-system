import {
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "./firebase-config.js";
import {
  ensureInitialData,
  subscribeAll,
  getTodayLogs,
  getTodayTotalOrders,
  getActiveOrders,
  formatTime,
  getLogTypeLabel
} from "./app.js";

const authGate = document.getElementById("history-auth-gate");
const historyPanel = document.getElementById("history-panel");

const loginForm = document.getElementById("history-login-form");
const emailInput = document.getElementById("history-email-input");
const passwordInput = document.getElementById("history-password-input");
const loginError = document.getElementById("history-login-error");
const logoutButton = document.getElementById("history-logout-button");

const totalOrdersEl = document.getElementById("history-total-orders");
const activeOrdersEl = document.getElementById("history-active-orders");
const tableBody = document.getElementById("history-table-body");

await ensureInitialData();

subscribeAll((data) => {
  if (!auth.currentUser) {
    return;
  }

  const todayLogs = getTodayLogs(data.logs);
  totalOrdersEl.textContent = String(getTodayTotalOrders(data.orders));
  activeOrdersEl.textContent = String(getActiveOrders(data.orders).length);

  if (!todayLogs.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="empty-cell">本日の履歴はまだありません。</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = todayLogs
    .map((log) => {
      return `
        <tr>
          <td>${formatTime(log.timestamp)}</td>
          <td>${getLogTypeLabel(log.type)}</td>
          <td>${log.targetOrderId || "-"}</td>
        </tr>
      `;
    })
    .join("");
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    authGate.classList.add("hidden");
    historyPanel.classList.remove("hidden");
  } else {
    authGate.classList.remove("hidden");
    historyPanel.classList.add("hidden");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch (error) {
    loginError.textContent = "ログインに失敗しました。メールアドレスまたはパスワードを確認してください。";
  }
});

logoutButton.addEventListener("click", async () => {
  sessionStorage.removeItem("roastery_admin_pin_authenticated");
  await signOut(auth);
});