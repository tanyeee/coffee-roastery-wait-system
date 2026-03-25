import {
  ensureInitialData,
  subscribeAll,
  calculateCurrentWaitMinutes,
  formatMinutesLabel,
  formatDateTime
} from "./app.js";

const statusTitle = document.getElementById("public-status-title");
const waitTime = document.getElementById("public-wait-time");
const statusSubtitle = document.getElementById("public-status-subtitle");
const lastUpdated = document.getElementById("public-last-updated");

await ensureInitialData();

subscribeAll((data) => {
  const now = Date.now();
  const minutes = calculateCurrentWaitMinutes(data.orders, data.settings, now);

  if (!data.settings.isOpen) {
    statusTitle.textContent = "本日の受付は終了しました";
    waitTime.textContent = "";
    statusSubtitle.textContent = "営業時間内に更新されます。";
  } else if (minutes > 0) {
    statusTitle.textContent = "現在の焙煎待ち時間";
    waitTime.textContent = formatMinutesLabel(minutes);
    statusSubtitle.textContent = "";
  } else {
    statusTitle.textContent = "現在待ち時間はありません";
    waitTime.textContent = "";
    statusSubtitle.textContent = "ご注文後すぐに焙煎できます";
  }

  lastUpdated.textContent = `最終更新: ${formatDateTime(now)}`;
});
