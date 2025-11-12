const { Router } = require("express");
const PushSubscriptionRepository = require("../repositories/pushSubscriptionRepository");
const pushNotificationService = require("../services/pushNotificationService");

const router = Router();

router.get("/config", (_req, res) => {
  return res.json(pushNotificationService.getClientConfig());
});

router.post("/subscriptions", (req, res) => {
  const body = req.body || {};
  const subscription = body.subscription || {};
  const endpoint =
    typeof subscription.endpoint === "string"
      ? subscription.endpoint.trim()
      : "";
  if (!endpoint) {
    return res.status(400).json({ error: "ENDPOINT_OBRIGATORIO" });
  }

  const preferenceRaw = body.preference || body.status;
  const preference =
    typeof preferenceRaw === "string" ? preferenceRaw.trim() : "accepted";
  if (preference === "denied") {
    PushSubscriptionRepository.deactivateByEndpoint(endpoint);
    return res.status(204).send();
  }

  try {
    const saved = PushSubscriptionRepository.upsert({
      endpoint,
      authKey: subscription.keys?.auth || null,
      p256dhKey: subscription.keys?.p256dh || null,
      expirationTime: subscription.expirationTime ?? null,
      userAgent: req.headers["user-agent"] || null,
      preference,
    });
    return res
      .status(201)
      .json({ id: saved?.id || null, ok: true, preference });
  } catch (err) {
    return res
      .status(400)
      .json({ error: err.message || "Falha ao salvar assinatura" });
  }
});

router.delete("/subscriptions", (req, res) => {
  const body = req.body || {};
  const endpointFromBody =
    typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const endpoint =
    endpointFromBody ||
    (body.subscription &&
    typeof body.subscription.endpoint === "string"
      ? body.subscription.endpoint.trim()
      : "");
  if (!endpoint) {
    return res.status(400).json({ error: "ENDPOINT_OBRIGATORIO" });
  }
  const removed = PushSubscriptionRepository.deactivateByEndpoint(endpoint);
  return res.status(removed ? 204 : 200).send();
});

module.exports = router;
