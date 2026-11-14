(function () {
  "use strict";

  var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  var isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  var isMobile = window.matchMedia("(max-width: 820px)").matches || isIos;
  var installPrompt = null;
  var installAvailable = false;
  var installButton = null;
  var updateBar = null;
  var waitingWorker = null;
  var refreshing = false;
  var guideLayer = null;

  function uiBlocked() {
    if (document.querySelector(".quiz-screen")) return true;
    return Array.prototype.some.call(document.querySelectorAll(".modal-layer"), function (layer) {
      return !layer.hidden;
    });
  }

  function syncInstallButton() {
    if (!installButton) return;
    installButton.hidden = !installAvailable || isStandalone || !isMobile || uiBlocked();
  }

  function ensureInstallButton() {
    if (installButton || isStandalone || !isMobile) return;
    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "pwa-install";
    installButton.setAttribute("aria-label", "安装方舆到手机桌面");
    installButton.innerHTML = '<span class="pwa-install-icon" aria-hidden="true">↓</span><span>安装 App</span>';
    installButton.hidden = true;
    installButton.addEventListener("click", function () {
      if (installPrompt) {
        var prompt = installPrompt;
        installPrompt = null;
        installAvailable = false;
        if (installButton) installButton.hidden = true;
        prompt.prompt();
        Promise.resolve(prompt.userChoice).catch(function () {}).then(function () {});
        return;
      }
      showInstallGuide();
    });
    document.body.appendChild(installButton);
    new MutationObserver(syncInstallButton).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "class"]
    });
  }

  function enableInstallButton() {
    if (isStandalone || !isMobile) return;
    installAvailable = true;
    ensureInstallButton();
    syncInstallButton();
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    installPrompt = event;
    enableInstallButton();
  });

  window.addEventListener("appinstalled", function () {
    installAvailable = false;
    installPrompt = null;
    if (installButton) installButton.hidden = true;
  });

  if ((isIos || isWeChat) && !isStandalone) {
    window.setTimeout(enableInstallButton, 1000);
  }

  function closeGuide() {
    if (!guideLayer) return;
    guideLayer.remove();
    guideLayer = null;
    document.body.classList.remove("pwa-guide-open");
  }

  function showInstallGuide() {
    if (guideLayer) return;
    var wechatNote = isWeChat
      ? "<p><strong>当前在微信内，不能直接安装。</strong>请点右上角「…」→「在浏览器中打开」，再按上面的步骤安装。</p>"
      : "";
    var steps = isIos
      ? "<ol><li>确认当前使用的是 Safari 浏览器</li><li>点屏幕底部的「分享」按钮</li><li>在列表中选择「添加到主屏幕」</li><li>点右上角的「添加」</li></ol>"
      : "<ol><li>用 Chrome 或其他浏览器打开本页</li><li>点浏览器菜单中的「安装应用」或「添加到主屏幕」</li><li>确认安装</li></ol>";
    guideLayer = document.createElement("div");
    guideLayer.className = "pwa-guide-layer";
    guideLayer.setAttribute("role", "dialog");
    guideLayer.setAttribute("aria-modal", "true");
    guideLayer.setAttribute("aria-labelledby", "pwaGuideTitle");
    guideLayer.innerHTML =
      '<div class="pwa-guide">' +
      '<button type="button" class="pwa-guide-close" aria-label="关闭安装说明">×</button>' +
      '<p class="pwa-guide-kicker">安装到主屏幕</p>' +
      '<h2 id="pwaGuideTitle">把方舆装进手机</h2>' +
      steps +
      wechatNote +
      '<button type="button" class="pwa-guide-ok">知道了</button>' +
      "</div>";
    document.body.appendChild(guideLayer);
    document.body.classList.add("pwa-guide-open");
    guideLayer.addEventListener("click", function (event) {
      if (event.target === guideLayer || event.target.closest(".pwa-guide-close") || event.target.closest(".pwa-guide-ok")) {
        closeGuide();
      }
    });
    document.addEventListener("keydown", function onKey(event) {
      if (event.key === "Escape") {
        closeGuide();
        document.removeEventListener("keydown", onKey);
      }
    });
  }

  function ensureUpdateBar() {
    if (updateBar) return;
    updateBar = document.createElement("div");
    updateBar.className = "pwa-update";
    updateBar.setAttribute("role", "status");
    updateBar.setAttribute("aria-live", "polite");
    updateBar.hidden = true;
    updateBar.innerHTML =
      '<div class="pwa-update-copy"><strong>发现新版本</strong><span>更新后会保留本机账号和成绩。</span></div>' +
      '<button type="button">立即更新</button>';
    updateBar.querySelector("button").addEventListener("click", function () {
      if (!waitingWorker) return;
      var button = updateBar.querySelector("button");
      button.disabled = true;
      button.textContent = "正在更新…";
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(function () {
        if (!refreshing) window.location.reload();
      }, 4000);
    });
    document.body.appendChild(updateBar);
  }

  function showUpdate(worker) {
    waitingWorker = worker;
    ensureUpdateBar();
    updateBar.hidden = false;
    if (installButton) installButton.hidden = true;
  }

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).then(function (registration) {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdate(registration.waiting);
        }
        registration.addEventListener("updatefound", function () {
          var worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", function () {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdate(worker);
            }
          });
        });
        var check = function () {
          registration.update().catch(function () {});
        };
        window.setInterval(check, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) check();
        });
      }).catch(function () {});
    });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshing || !waitingWorker) return;
      refreshing = true;
      window.location.reload();
    });
  }
})();
