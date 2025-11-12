const PREF_KEY = "tlu.notifications.preference";
const LAST_POST_KEY = "tlu.notifications.lastPost";
const API_BASE = (window.__API_BASE__ || "/api").replace(/\/$/, "");
const CONFIG_URL = `${API_BASE}/push/config`;
const SUBSCRIPTIONS_URL = `${API_BASE}/push/subscriptions`;

if (!window.__tluPushClientInitialized) {
  window.__tluPushClientInitialized = true;

  let cachedConfig = null;
  let registrationPromise = null;
  let syncingPreference = false;
  let lastKnownPreference = null;

  const supportsPush =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined";
  let storagePatched = false;

  function readPreference() {
    try {
      return localStorage.getItem(PREF_KEY);
    } catch (_) {
      return null;
    }
  }

  function setLastPost(identifier) {
    if (!identifier) return;
    try {
      localStorage.setItem(LAST_POST_KEY, String(identifier));
    } catch (_) {}
  }

  async function fetchConfig() {
    if (cachedConfig !== null) return cachedConfig;
    try {
      const response = await fetch(CONFIG_URL, { credentials: "same-origin" });
      if (!response.ok) {
        cachedConfig = { enabled: false, publicKey: null };
        return cachedConfig;
      }
      const data = await response.json();
      cachedConfig = {
        enabled: !!data?.enabled && !!data?.publicKey,
        publicKey: data?.publicKey || null,
      };
    } catch (err) {
      console.error("[push] Falha ao carregar config", err);
      cachedConfig = { enabled: false, publicKey: null };
    }
    return cachedConfig;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function getRegistration() {
    if (!supportsPush) return null;
    if (registrationPromise) return registrationPromise;
    registrationPromise = (async () => {
      try {
        if (navigator.serviceWorker.getRegistration) {
          const existing = await navigator.serviceWorker.getRegistration("/");
          if (existing) return existing;
        }
        return navigator.serviceWorker.register("/service-worker.js");
      } catch (err) {
        console.error("[push] Falha ao registrar service worker", err);
        registrationPromise = null;
        return null;
      }
    })();
    return registrationPromise;
  }

  async function sendSubscriptionToServer(subscription, preference = "accepted") {
    try {
      await fetch(SUBSCRIPTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ subscription, preference }),
      });
      console.log("[push-client] subscription sincronizado", {
        endpoint: subscription?.endpoint,
        preference,
      });
    } catch (err) {
      console.error("[push] Falha ao enviar inscrição", err);
    }
  }

  async function removeSubscriptionFromServer(subscriptionOrEndpoint) {
    const endpoint =
      typeof subscriptionOrEndpoint === "string"
        ? subscriptionOrEndpoint
        : subscriptionOrEndpoint?.endpoint || null;
    if (!endpoint) return;
    try {
      await fetch(SUBSCRIPTIONS_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ endpoint }),
      });
      console.log("[push-client] subscription removido", { endpoint });
    } catch (err) {
      console.warn("[push] Falha ao remover inscrição", err);
    }
  }

  async function unsubscribeFromPush() {
    const registration = await getRegistration();
    if (!registration) return;
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      console.log("[push-client] unsubscribe solicitado", { endpoint });
      await removeSubscriptionFromServer(endpoint);
    } catch (err) {
      console.error("[push] Falha ao cancelar inscrição", err);
    }
  }

  async function subscribeForPush() {
    const config = await fetchConfig();
    if (!config.enabled) return false;
    const registration = await getRegistration();
    if (!registration) return false;
    let subscription = await registration.pushManager.getSubscription();
    try {
      if (!subscription) {
        const serverKey = urlBase64ToUint8Array(config.publicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKey,
        });
        console.log("[push-client] subscription criado no navegador", {
          endpoint: subscription.endpoint,
        });
      }
      await sendSubscriptionToServer(subscription, "accepted");
      return true;
    } catch (err) {
      console.error("[push] Falha ao assinar push", err);
      if (subscription && err?.name === "NotAllowedError") {
        await unsubscribeFromPush();
      }
      return false;
    }
  }

  async function syncPreferenceWithSubscription() {
    if (!supportsPush || syncingPreference) return;
    syncingPreference = true;
    try {
      const pref = readPreference();
      lastKnownPreference = pref;
      if (pref === "accepted" && Notification.permission === "granted") {
        await subscribeForPush();
      } else {
        await unsubscribeFromPush();
      }
    } finally {
      syncingPreference = false;
    }
  }

  function handlePreferenceChange() {
    const pref = readPreference();
    if (pref === lastKnownPreference) return;
    lastKnownPreference = pref;
    syncPreferenceWithSubscription();
  }

  function handlePermissionChange() {
    if (Notification.permission === "denied") {
      unsubscribeFromPush();
    } else if (Notification.permission === "granted") {
      syncPreferenceWithSubscription();
    }
  }

  function listenToWorkerMessages() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.addEventListener) {
      return;
    }
    navigator.serviceWorker.addEventListener("message", (event) => {
      const payload = event?.data;
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "tlu:push-delivered") {
        const info = payload.data || {};
        const identifier =
          info.slug ||
          (info.postId != null ? String(info.postId) : null);
        if (identifier) {
          console.log("[push-client] notificação entregue (SW -> página)", {
            identifier,
          });
          setLastPost(identifier);
        }
      } else if (payload.type === "tlu:push-refresh-subscription") {
        console.log("[push-client] SW pediu refresh de subscription");
        syncPreferenceWithSubscription();
      }
    });
  }

  function patchStorageObserver() {
    if (storagePatched) return;
    try {
      const original = Storage.prototype.setItem;
      if (typeof original !== "function") return;
      const wrapped = function setItemPatched(key, value) {
        original.apply(this, arguments);
        if (key === PREF_KEY) {
          handlePreferenceChange();
        }
      };
      wrapped.__tluPatched = true;
      Storage.prototype.setItem = wrapped;
      storagePatched = true;
    } catch (err) {
      console.warn("[push] Falha ao observar Storage.setItem", err);
    }
  }

  async function init() {
    if (!supportsPush) return;
    await fetchConfig();
    await getRegistration();
    lastKnownPreference = readPreference();
    patchStorageObserver();
    listenToWorkerMessages();
    console.log("[push-client] inicializado", {
      preference: lastKnownPreference,
      permission: Notification.permission,
    });
    syncPreferenceWithSubscription();

    window.addEventListener("focus", syncPreferenceWithSubscription);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        syncPreferenceWithSubscription();
      }
    });
    window.addEventListener("storage", (event) => {
      if (event.key === PREF_KEY) {
        handlePreferenceChange();
      }
    });
    setInterval(handlePreferenceChange, 2000);
    if (navigator.permissions?.query) {
      try {
        navigator.permissions.query({ name: "notifications" }).then((status) => {
          status.onchange = handlePermissionChange;
        });
      } catch (_) {}
    }
  }

  if (supportsPush) {
    if (document.readyState === "complete") {
      init();
    } else {
      window.addEventListener("load", init, { once: true });
    }
  }
}
