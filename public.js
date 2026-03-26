import {
  ensureInitialData,
  subscribeAll,
  calculateCurrentWaitMinutes,
  formatDateTime
} from "./app.js";

const statusTitle = document.getElementById("public-status-title");
const waitTime = document.getElementById("public-wait-time");
const statusSubtitle = document.getElementById("public-status-subtitle");
const orderGuide = document.getElementById("public-order-guide");
const finishGuide = document.getElementById("public-finish-guide");
const caution = document.getElementById("public-caution");
const lastUpdated = document.getElementById("public-last-updated");

let latestData = null;

await ensureInitialData();

subscribeAll((data) => {
  latestData = data;
  renderPublic();
});

function renderPublic() {
  if (!latestData) {
    return;
  }

  const now = Date.now();
  const minutes = calculateCurrentWaitMinutes(latestData.orders, latestData.settings, now);

  if (!latestData.settings.isOpen) {
    statusTitle.textContent = "本日の受付は終了しました";
    waitTime.textContent = "";
    statusSubtitle.textContent = "営業時間内に更新されます。";
    orderGuide.textContent = "";
    finishGuide.textContent = "";
    caution.textContent = "";
  } else if (minutes > 0) {
    statusTitle.textContent = "焙煎開始までの待ち時間";
    waitTime.textContent = `約 ${minutes} 分`;
    statusSubtitle.textContent = "";
    orderGuide.textContent = `今ご注文いただくと、約${minutes}分後に焙煎を開始します`;
    finishGuide.textContent = "焙煎開始後、出来上がりまでさらに約15分ほどかかります";
    caution.textContent = "混雑状況や豆の種類により前後する場合があります";
  } else {
    statusTitle.textContent = "焙煎開始までの待ち時間";
    waitTime.textContent = "すぐにご案内できます";
    statusSubtitle.textContent = "";
    orderGuide.textContent = "今ご注文いただくと、すぐに焙煎を開始できます";
    finishGuide.textContent = "焙煎開始後、出来上がりまでさらに約15分ほどかかります";
    caution.textContent = "混雑状況や豆の種類により前後する場合があります";
  }

  lastUpdated.textContent = `最終更新: ${formatDateTime(now)}`;
}

setInterval(() => {
  renderPublic();
}, 60 * 1000);