(function () {
  "use strict";

  var PRIMARY_HANDLE_DB_NAME = "markv-pwa";
  var PRIMARY_HANDLE_DB_VERSION = 1;
  var PRIMARY_HANDLE_STORE = "handles";
  var PRIMARY_HANDLE_KEY = "primary-file";
  var PRIMARY_HANDLE_SESSION_KEY = "markv-pwa-primary-handle";
  var UPDATE_TOAST_ID = "pwaUpdateToast";
  var UPDATE_TOAST_ACTION_ID = "pwaUpdateToastAction";
  var UPDATE_TOAST_DISMISS_ID = "pwaUpdateToastDismiss";
  var UPDATE_TOAST_TITLE_ID = "pwaUpdateToastTitle";
  var BACKGROUND_SYNC_TAG = "markv-flush-queue";

  var pendingSharedContent = parsePendingSharedContent();
  var appReady = false;
  var restoreInFlight = false;
  var controllerRefreshPending = false;
  var updateToastHideTimer = 0;

  function readSessionValue(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function writeSessionValue(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_error) {}
  }

  function removeSessionValue(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (_error) {}
  }

  function setPrimaryHandleRestoreMarker(enabled) {
    if (enabled) {
      writeSessionValue(PRIMARY_HANDLE_SESSION_KEY, "1");
      return;
    }
    removeSessionValue(PRIMARY_HANDLE_SESSION_KEY);
  }

  function shouldRestorePrimaryHandle() {
    return readSessionValue(PRIMARY_HANDLE_SESSION_KEY) === "1";
  }

  function parsePendingSharedContent() {
    var url;
    try {
      url = new URL(window.location.href);
    } catch (_error) {
      return null;
    }

    var title = url.searchParams.get("title");
    var text = url.searchParams.get("text");
    var sharedUrl = url.searchParams.get("url");
    if (!title && !text && !sharedUrl) {
      return null;
    }

    return {
      title: title || "",
      text: text || "",
      url: sharedUrl || "",
    };
  }

  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      var request = indexedDB.open(
        PRIMARY_HANDLE_DB_NAME,
        PRIMARY_HANDLE_DB_VERSION,
      );
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(PRIMARY_HANDLE_STORE)) {
          db.createObjectStore(PRIMARY_HANDLE_STORE);
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function storePrimaryHandle(handle) {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRIMARY_HANDLE_STORE, "readwrite");
        tx.objectStore(PRIMARY_HANDLE_STORE).put(handle, PRIMARY_HANDLE_KEY);
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function loadPrimaryHandle() {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRIMARY_HANDLE_STORE, "readonly");
        var request = tx.objectStore(PRIMARY_HANDLE_STORE).get(PRIMARY_HANDLE_KEY);
        request.onsuccess = function () {
          var result = request.result || null;
          db.close();
          resolve(result);
        };
        request.onerror = function () {
          db.close();
          reject(request.error);
        };
      });
    });
  }

  function clearPrimaryHandle() {
    return openHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRIMARY_HANDLE_STORE, "readwrite");
        tx.objectStore(PRIMARY_HANDLE_STORE).delete(PRIMARY_HANDLE_KEY);
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function rememberPrimaryFileHandle(handle) {
    if (!handle) {
      forgetPrimaryFileHandle();
      return;
    }

    setPrimaryHandleRestoreMarker(true);
    storePrimaryHandle(handle).catch(function (error) {
      console.warn("[pwa] failed to persist file handle", error);
    });
  }

  function forgetPrimaryFileHandle() {
    setPrimaryHandleRestoreMarker(false);
    clearPrimaryHandle().catch(function (error) {
      console.warn("[pwa] failed to clear file handle", error);
    });
  }

  function getHooks() {
    return window.markvPWAHooks || null;
  }

  function requestLifecycleFlush(reason) {
    var hooks = getHooks();
    if (!hooks) return;

    try {
      if (typeof hooks.flushSessionDraft === "function") {
        hooks.flushSessionDraft();
      }
    } catch (error) {
      console.warn("[pwa] draft flush failed", error);
    }

    try {
      if (typeof hooks.flushPendingWrites === "function") {
        Promise.resolve(hooks.flushPendingWrites({ reason: reason })).catch(
          function (error) {
            console.warn("[pwa] pending write flush failed", error);
          },
        );
      }
    } catch (error) {
      console.warn("[pwa] pending write flush threw", error);
    }
  }

  function wireLifecycleFlush() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        requestLifecycleFlush("visibility-hidden");
      }
    });

    window.addEventListener("pagehide", function () {
      requestLifecycleFlush("pagehide");
    });
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

  function wireUpdateToast() {
    var dismiss = getUpdateToastDismiss();
    if (!dismiss || dismiss.dataset.pwaWired === "true") return;
    dismiss.dataset.pwaWired = "true";
    dismiss.addEventListener("click", function () {
      hideUpdateToast(false);
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

  function registerBackgroundSync(registration) {
    if (!registration || !("sync" in registration)) {
      return Promise.resolve();
    }

    return registration.sync
      .register(BACKGROUND_SYNC_TAG)
      .catch(function (_error) {});
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return Promise.resolve(null);
    }

    return navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then(function (registration) {
        wireServiceWorkerLifecycle(registration);
        return registerBackgroundSync(registration).then(function () {
          return registration;
        });
      })
      .catch(function (error) {
        console.warn("[pwa] service worker registration failed", error);
        return null;
      });
  }

  function restorePrimaryHandleIfEligible() {
    var hooks = getHooks();
    if (
      restoreInFlight ||
      !appReady ||
      !shouldRestorePrimaryHandle() ||
      !hooks ||
      typeof hooks.restorePrimaryFileHandle !== "function"
    ) {
      return;
    }

    restoreInFlight = true;
    loadPrimaryHandle()
      .then(function (handle) {
        if (!handle) {
          forgetPrimaryFileHandle();
          return;
        }
        hooks.restorePrimaryFileHandle(handle);
      })
      .catch(function (error) {
        console.warn("[pwa] failed to restore file handle", error);
      })
      .finally(function () {
        restoreInFlight = false;
      });
  }

  function initAfterLoad() {
    wireUpdateToast();
    registerServiceWorker();
    restorePrimaryHandleIfEligible();
  }

  window.MarkVPWA = window.MarkVPWA || {};
  window.MarkVPWA.consumePendingSharedContent = function () {
    var next = pendingSharedContent;
    pendingSharedContent = null;
    return next;
  };
  window.MarkVPWA.shouldRestorePrimaryFileHandle = shouldRestorePrimaryHandle;
  window.MarkVPWA.rememberPrimaryFileHandle = rememberPrimaryFileHandle;
  window.MarkVPWA.forgetPrimaryFileHandle = forgetPrimaryFileHandle;

  document.addEventListener("markv:ready", function () {
    appReady = true;
    restorePrimaryHandleIfEligible();
  });

  wireLifecycleFlush();

  if (document.readyState === "complete") {
    initAfterLoad();
  } else {
    window.addEventListener("load", initAfterLoad, { once: true });
  }
})();
