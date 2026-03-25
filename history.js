import {
  ensureInitialData,
  subscribeAll,
  getTodayLogs,
  getTodayTotalOrders,
  getActiveOrders,
  formatTime,
  getLogTypeLabel
} from "./app.js";

const totalOrdersEl = document.getElementById("history-total-orders");
const activeOrdersEl = document.getElementById("history-active-orders");
const tableBody = document.getElementById("history-table-body");

await ensureInitialData();

subscribeAll((data) => {
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
