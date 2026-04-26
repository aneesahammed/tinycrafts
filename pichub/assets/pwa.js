(function () {
  "use strict";

  var THEME_KEY = "pichub-theme";
  var UPDATE_TOAST_ID = "pwaUpdateToast";
  var UPDATE_TOAST_ACTION_ID = "pwaUpdateToastAction";
  var UPDATE_TOAST_DISMISS_ID = "pwaUpdateToastDismiss";
  var UPDATE_TOAST_TITLE_ID = "pwaUpdateToastTitle";
  var controllerRefreshPending = false;
  var updateToastHideTimer = 0;

  function readStorage(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {}
  }

  function getUpdateToast() {
    return document.getElementById(UPDATE_TOAST_ID);
  }

  function getUpdateToastAction() {
    return document.getElementById(UPDATE_TOAST_ACTION_ID);
  }

  function getUpdateToastDismiss() {
    return document.getElementById(UPDATE_TOAST_DISMISS_ID);
  }

  function getUpdateToastTitle() {
    return document.getElementById(UPDATE_TOAST_TITLE_ID);
  }

  function hideUpdateToast(immediate) {
    var toast = getUpdateToast();
    var action = getUpdateToastAction();
    if (!toast) return;

    window.clearTimeout(updateToastHideTimer);
    toast.classList.remove("is-visible");
    if (action) {
      action.disabled = false;
      action.textContent = "Refresh";
    }

    if (immediate) {
      toast.hidden = true;
      return;
    }

    updateToastHideTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, 240);
  }

  function showUpdateToast(registration) {
    var toast = getUpdateToast();
    var action = getUpdateToastAction();
    var dismiss = getUpdateToastDismiss();
    var title = getUpdateToastTitle();
    if (!toast || !action || !dismiss) return;

    window.clearTimeout(updateToastHideTimer);
    toast.hidden = false;
    if (title) {
      title.textContent = "A newer build is ready.";
    }
    action.disabled = false;
    action.textContent = "Refresh";
    action.onclick = function () {
      if (!registration.waiting) return;
      action.disabled = true;
      action.textContent = "Refreshing...";
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    };
    dismiss.onclick = function () {
      hideUpdateToast(false);
    };
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
  }

  function wireServiceWorkerLifecycle(registration) {
    if (!registration) return;

    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateToast(registration);
    } else {
      hideUpdateToast(true);
    }

    registration.addEventListener("updatefound", function () {
      var installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", function () {
        if (
          installing.state === "installed" &&
          navigator.serviceWorker &&
          navigator.serviceWorker.controller
        ) {
          showUpdateToast(registration);
        }
      });
    });

    if (wireServiceWorkerLifecycle.didBindController) return;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (controllerRefreshPending) return;
      controllerRefreshPending = true;
      window.location.reload();
    });
    wireServiceWorkerLifecycle.didBindController = true;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      return Promise.resolve(null);
    }

    return navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then(function (registration) {
        wireServiceWorkerLifecycle(registration);
        return registration;
      })
      .catch(function (error) {
        console.warn("[pichub-pwa] service worker registration failed", error);
        return null;
      });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function setupThemeToggle() {
    var themeBtn = document.getElementById("themeToggleBtn");
    if (!themeBtn) return;

    var systemDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(readStorage(THEME_KEY, systemDark ? "dark" : "light"));

    themeBtn.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme") || "light";
      var next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      writeStorage(THEME_KEY, next);
    });
  }

  function syncToolbarHeight() {
    var toolbar = document.querySelector(".toolbar");
    if (!toolbar) return;
    document.documentElement.style.setProperty(
      "--toolbar-h",
      toolbar.offsetHeight + "px",
    );
  }

  function setupToolbarHeightSync() {
    syncToolbarHeight();
    window.addEventListener("resize", syncToolbarHeight);
    var toolbar = document.querySelector(".toolbar");
    if (toolbar && "ResizeObserver" in window) {
      new ResizeObserver(syncToolbarHeight).observe(toolbar);
    }
  }

  function init() {
    setupThemeToggle();
    setupToolbarHeightSync();
    registerServiceWorker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
