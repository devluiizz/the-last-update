const webPush = require("web-push");
const PushSubscriptionRepository = require("../repositories/pushSubscriptionRepository");

const DEFAULT_CONTACT = "mailto:contato@thelastupdate.com";
const rawContact = (process.env.PUSH_CONTACT_EMAIL || "").trim();
const CONTACT_EMAIL = rawContact
  ? rawContact.startsWith("mailto:")
    ? rawContact
    : `mailto:${rawContact}`
  : DEFAULT_CONTACT;
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();

let isReady = false;
let warnedMissingKeys = false;

function configure() {
  if (isReady) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    if (!warnedMissingKeys) {
      warnedMissingKeys = true;
      console.warn(
        "[push] Push desativado: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env"
      );
    }
    return;
  }
  try {
    webPush.setVapidDetails(CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    isReady = true;
  } catch (err) {
    console.error("[push] Falha ao configurar VAPID", err);
  }
}

configure();

function isSafeIcon(path) {
  if (typeof path !== "string") return false;
  const value = path.trim();
  if (!value) return false;
  if (value.startsWith("data:")) return false;
  if (value.length > 512) return false;
  return true;
}

function buildNotificationPayload(publication) {
  if (!publication) {
    return {
      title: "Nova publicação disponível!",
      body: "Confira as últimas novidades no The Last Update.",
      url: "/",
    };
  }
  const title = publication.title || "Nova publicação disponível!";
  const teaser = publication.description || "";
  const url = publication.slug
    ? `/noticia/${encodeURIComponent(publication.slug)}`
    : publication.id != null
    ? `/noticia?id=${encodeURIComponent(publication.id)}`
    : "/";
  const category = publication.category || "";

  const fallbackBody =
    teaser.trim().length > 0
      ? teaser.trim().slice(0, 160)
      : `Confira a nova matéria de ${category || "The Last Update"}.`;

  const iconCandidate =
    typeof publication.image === "string" && publication.image.trim().length
      ? publication.image.trim()
      : null;
  const icon = isSafeIcon(iconCandidate)
    ? iconCandidate
    : "/assets/img/favicon.svg";

  return {
    title,
    body: fallbackBody,
    url,
    tag: publication.slug
      ? `tlu-publication-${publication.slug}`
      : `tlu-publication-${publication.id || "latest"}`,
    icon,
    data: {
      url,
      postId: publication.id || null,
      slug: publication.slug || null,
      category,
    },
  };
}

async function fanoutNotification(payload) {
  if (!isReady) {
    console.warn("[push] Fanout ignorado: serviço não configurado");
    return { delivered: 0, total: 0 };
  }
  const subscriptions = PushSubscriptionRepository.listActive();
  if (!subscriptions.length) {
    console.warn("[push] Nenhuma inscrição ativa para receber notificações");
    return { delivered: 0, total: 0 };
  }

  const body =
    typeof payload === "string" ? payload : JSON.stringify(payload || {});

  console.log("[push] Enviando notificação", {
    title: payload?.title,
    url: payload?.url,
    totalSubscriptions: subscriptions.length,
  });

  const sendTasks = subscriptions.map((sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime || null,
      keys: {
        auth: sub.keys.auth,
        p256dh: sub.keys.p256dh,
      },
    };
    return webPush.sendNotification(pushSubscription, body).then(
      () => {
        PushSubscriptionRepository.markDelivered(sub.id);
        console.log("[push] Notificação entregue", {
          subscriptionId: sub.id,
        });
        return { ok: true };
      },
      (err) => {
        const status = err?.statusCode || err?.status || 0;
        const errorBody =
          typeof err?.body === "string"
            ? err.body
            : err?.body && Buffer.isBuffer(err.body)
            ? err.body.toString("utf8")
            : null;
        console.error("[push] Falha ao enviar", {
          subscriptionId: sub.id,
          status,
          message: err?.message,
          body: errorBody,
        });
        if (status === 400 || status === 404 || status === 410) {
          // Endpoint inválido/expirado: desativa para forçar nova inscrição
          PushSubscriptionRepository.deactivateById(sub.id);
        } else {
          PushSubscriptionRepository.markFailure(sub.id, err.message || "");
        }
        return { ok: false };
      }
    );
  });

  const results = await Promise.allSettled(sendTasks);
  const delivered = results.filter(
    (result) => result.status === "fulfilled" && result.value?.ok
  ).length;
  console.log("[push] Fanout finalizado", {
    title: payload?.title,
    delivered,
    total: subscriptions.length,
  });
  return { delivered, total: subscriptions.length };
}

async function notifyNewPublication(publication) {
  if (!isReady) {
    console.warn("[push] Notificação ignorada: serviço não configurado");
    return { delivered: 0, total: 0 };
  }
  const payload = buildNotificationPayload(publication);
  console.log("[push] Nova publicação pronta para push", {
    id: publication?.id,
    slug: publication?.slug,
    title: payload.title,
  });
  return fanoutNotification(payload);
}

module.exports = {
  isConfigured: () => isReady,
  getClientConfig() {
    return {
      enabled: isReady,
      publicKey: isReady ? VAPID_PUBLIC_KEY : null,
    };
  },
  notifyNewPublication,
  fanoutNotification,
};
