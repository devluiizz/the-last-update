/*
 * Service Worker para The Last Update.
 *
 * Mantém o push ativo em segundo plano, garantindo que as notificações
 * cheguem mesmo quando não há abas abertas. O worker também renova a
 * inscrição sempre que o navegador invalida o subscription.
 */

/* eslint-disable no-restricted-globals */

const DEFAULT_ICON = '/assets/img/favicon.svg';
const DEFAULT_BADGE = '/assets/img/favicon.svg';
const DEFAULT_TITLE = 'Nova publicação disponível!';
const DEFAULT_BODY = 'Confira as últimas novidades no The Last Update.';
const PUSH_CONFIG_ENDPOINT = '/api/push/config';
const PUSH_SUBSCRIPTIONS_ENDPOINT = '/api/push/subscriptions';
const CONFIG_TTL_MS = 10 * 60 * 1000;

let cachedConfig = null;
let cachedConfigAt = 0;

self.addEventListener('install', () => {
  console.log('[sw:push] instalando worker');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      console.log('[sw:push] ativado, garantindo subscription');
      await ensurePushSubscription();
    })(),
  );
});

self.addEventListener('push', (event) => {
  console.log('[sw:push] push recebido', {
    hasData: !!event.data,
  });
  event.waitUntil(handlePushEvent(event));
});

self.addEventListener('notificationclick', (event) => {
  console.log('[sw:push] notification click', {
    url: event.notification.data && event.notification.data.url,
  });
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if (!client.url) continue;
        try {
          const normalizedUrl = new URL(client.url, self.location.origin);
          const targetUrl = new URL(url, self.location.origin);
          if (normalizedUrl.href === targetUrl.href && 'focus' in client) {
            client.focus();
            return;
          }
        } catch (_) {
          // Ignora URLs inválidas; abriremos uma nova aba abaixo.
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(handlePushSubscriptionChange(event));
});

async function handlePushEvent(event) {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.error('Failed to parse push payload', err);
  }

  const title = data.title || DEFAULT_TITLE;
  const body = data.body || DEFAULT_BODY;
  const icon = data.icon || DEFAULT_ICON;
  const badge = data.badge || DEFAULT_BADGE;
  const url = data.url || '/';
  const payload = {
    body,
    icon,
    badge,
    data: {
      url,
      postId: data.data?.postId ?? data.postId ?? null,
      slug: data.data?.slug ?? data.slug ?? null,
      category: data.data?.category ?? data.category ?? null,
    },
    tag: data.tag || 'tlu-publication',
    renotify: data.renotify === true,
    requireInteraction: data.requireInteraction === true,
  };

  await self.registration.showNotification(title, payload);
  console.log('[sw:push] notificação exibida', {
    title,
    url: payload.data.url,
  });
  await broadcastMessage({ type: 'tlu:push-delivered', data: payload.data });
}

async function ensurePushSubscription(force = false) {
  if (!self.registration?.pushManager) return null;
  if (self.Notification && self.Notification.permission === 'denied') {
    console.warn('[sw:push] não é possível assinar: permissão negada');
    return null;
  }

  try {
    const current = await self.registration.pushManager.getSubscription();
    if (current && !force) {
      console.log('[sw:push] subscription existente mantida');
      await sendSubscriptionToServer(current);
      return current;
    }
  } catch (err) {
    console.error('Failed to read push subscription', err);
  }

  try {
    const config = await fetchPushConfig(force);
    if (!config?.publicKey) {
      console.warn('[sw:push] não há chave pública para assinar');
      return null;
    }
    const serverKey = urlBase64ToUint8Array(config.publicKey);
    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey,
    });
    console.log('[sw:push] novo subscription criado');
    await sendSubscriptionToServer(subscription);
    await broadcastMessage({ type: 'tlu:push-refresh-subscription' });
    return subscription;
  } catch (err) {
    console.error('Failed to renew push subscription', err);
    return null;
  }
}

async function handlePushSubscriptionChange(event) {
  try {
    if (event.oldSubscription) {
      await removeSubscriptionFromServer(event.oldSubscription);
    }
  } catch (err) {
    console.warn('Failed to remove stale subscription', err);
  }
  console.log('[sw:push] navegador pediu renovação do subscription');
  await ensurePushSubscription(true);
}

async function fetchPushConfig(force = false) {
  const now = Date.now();
  if (!force && cachedConfig && now - cachedConfigAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }
  try {
    const response = await fetch(PUSH_CONFIG_ENDPOINT, {
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    cachedConfig = await response.json();
    cachedConfigAt = now;
  } catch (err) {
    console.error('Failed to load push config', err);
    cachedConfig = null;
  }
  return cachedConfig;
}

async function sendSubscriptionToServer(subscription) {
  if (!subscription) return;
  try {
    await fetch(PUSH_SUBSCRIPTIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ subscription, preference: 'accepted' }),
    });
  } catch (err) {
    console.error('Failed to sync subscription', err);
  }
}

async function removeSubscriptionFromServer(subscription) {
  const endpoint = subscription?.endpoint;
  if (!endpoint) return;
  try {
    await fetch(PUSH_SUBSCRIPTIONS_ENDPOINT, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint }),
    });
  } catch (err) {
    console.warn('Failed to remove subscription on server', err);
  }
}

async function broadcastMessage(message) {
  try {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    clientList.forEach((client) => {
      client.postMessage(message);
    });
  } catch (err) {
    console.error('Failed to notify clients', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
