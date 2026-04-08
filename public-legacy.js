(function () {
  var statusTitle = document.getElementById("public-status-title");
  var waitTime = document.getElementById("public-wait-time");
  var statusSubtitle = document.getElementById("public-status-subtitle");
  var orderGuide = document.getElementById("public-order-guide");
  var finishGuide = document.getElementById("public-finish-guide");
  var caution = document.getElementById("public-caution");
  var lastUpdated = document.getElementById("public-last-updated");

  var publicStatusUrl = window.PUBLIC_STATUS_URL;
  var latestPublicStatus = null;
  var jsonpCounter = 0;

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function formatDateTime(timestamp) {
    if (!timestamp) {
      return "--";
    }

    var date = new Date(Number(timestamp));
    return (
      date.getFullYear() + "/" +
      pad2(date.getMonth() + 1) + "/" +
      pad2(date.getDate()) + " " +
      pad2(date.getHours()) + ":" +
      pad2(date.getMinutes()) + ":" +
      pad2(date.getSeconds())
    );
  }

  function normalizeFutureEvents(futureEvents) {
    var events = [];
    var i;

    if (!futureEvents) {
      return events;
    }

    if (Object.prototype.toString.call(futureEvents) === "[object Array]") {
      for (i = 0; i < futureEvents.length; i += 1) {
        if (futureEvents[i]) {
          events.push({
            timestamp: Number(futureEvents[i].timestamp),
            waitMinutes: Number(futureEvents[i].waitMinutes)
          });
        }
      }
    } else {
      for (var key in futureEvents) {
        if (Object.prototype.hasOwnProperty.call(futureEvents, key) && futureEvents[key]) {
          events.push({
            timestamp: Number(futureEvents[key].timestamp),
            waitMinutes: Number(futureEvents[key].waitMinutes)
          });
        }
      }
    }

    events.sort(function (a, b) {
      return a.timestamp - b.timestamp;
    });

    return events;
  }

  function calculateDisplayedWaitFromPublicStatus(publicStatus, now) {
    if (!publicStatus) {
      return 0;
    }

    var current = Number(publicStatus.displayWaitMinutes || 0);
    var events = normalizeFutureEvents(publicStatus.futureEvents);
    var i;

    for (i = 0; i < events.length; i += 1) {
      if (now >= Number(events[i].timestamp)) {
        current = Number(events[i].waitMinutes || 0);
      } else {
        break;
      }
    }

    return current < 0 ? 0 : current;
  }

  function renderPublic() {
    var now;
    var minutes;
    var finishEstimateMinutes;

    if (!latestPublicStatus) {
      statusTitle.textContent = "読み込み中...";
      waitTime.textContent = "--";
      statusSubtitle.textContent = "";
      orderGuide.textContent = "";
      finishGuide.textContent = "";
      caution.textContent = "";
      return;
    }

    now = Date.now();
    minutes = calculateDisplayedWaitFromPublicStatus(latestPublicStatus, now);
    finishEstimateMinutes = Number(latestPublicStatus.finishEstimateMinutes || 15);

    if (!latestPublicStatus.isOpen) {
      statusTitle.textContent = "本日の受付は終了しました";
      waitTime.textContent = "";
      statusSubtitle.textContent = "営業時間内に更新されます。";
      orderGuide.textContent = "";
      finishGuide.textContent = "";
      caution.textContent = "";
    } else if (minutes > 0) {
      statusTitle.textContent = "焙煎開始までの待ち時間";
      waitTime.textContent = "約 " + minutes + " 分";
      statusSubtitle.textContent = "";
      orderGuide.textContent = "今ご注文いただくと、約" + minutes + "分後に焙煎を開始します";
      finishGuide.textContent = "焙煎開始後、出来上がりまでさらに約" + finishEstimateMinutes + "分ほどかかります";
      caution.textContent = "混雑状況や豆の種類により前後する場合があります";
    } else {
      statusTitle.textContent = "焙煎開始までの待ち時間";
      waitTime.textContent = "すぐにご案内できます";
      statusSubtitle.textContent = "";
      orderGuide.textContent = "今ご注文いただくと、すぐに焙煎を開始できます";
      finishGuide.textContent = "焙煎開始後、出来上がりまでさらに約" + finishEstimateMinutes + "分ほどかかります";
      caution.textContent = "混雑状況や豆の種類により前後する場合があります";
    }

    lastUpdated.textContent = "最終更新: " + formatDateTime(latestPublicStatus.updatedAt || now);
  }

  function showLoadError() {
    if (!latestPublicStatus) {
      statusTitle.textContent = "読み込みに失敗しました";
      waitTime.textContent = "";
      statusSubtitle.textContent = "時間をおいて再度ご確認ください。";
      orderGuide.textContent = "";
      finishGuide.textContent = "";
      caution.textContent = "";
      lastUpdated.textContent = "";
    }
  }

  function fetchPublicStatusJsonp() {
    if (!publicStatusUrl) {
      statusTitle.textContent = "設定エラーです";
      waitTime.textContent = "";
      statusSubtitle.textContent = "公開用データのURLが設定されていません。";
      orderGuide.textContent = "";
      finishGuide.textContent = "";
      caution.textContent = "";
      lastUpdated.textContent = "";
      return;
    }

    jsonpCounter += 1;
    var callbackName = "__publicStatusCallback" + jsonpCounter;
    var script = document.createElement("script");
    var timeoutId;

    window[callbackName] = function (data) {
      clearTimeout(timeoutId);
      latestPublicStatus = data || {};
      renderPublic();

      try {
        delete window[callbackName];
      } catch (e) {
        window[callbackName] = undefined;
      }

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    script.onerror = function () {
      clearTimeout(timeoutId);
      showLoadError();

      try {
        delete window[callbackName];
      } catch (e) {
        window[callbackName] = undefined;
      }

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    timeoutId = setTimeout(function () {
      showLoadError();

      try {
        delete window[callbackName];
      } catch (e) {
        window[callbackName] = undefined;
      }

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }, 10000);

    script.src =
      publicStatusUrl +
      "?callback=" + encodeURIComponent(callbackName) +
      "&t=" + new Date().getTime();

    document.body.appendChild(script);
  }

  fetchPublicStatusJsonp();
  setInterval(fetchPublicStatusJsonp, 60000);
  setInterval(renderPublic, 30000);
})();