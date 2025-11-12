const jwt = require("jsonwebtoken");

const TOKEN_COOKIE = "tlu_session";
const SESSION_TTL = process.env.SESSION_TTL || "40m";

function parseTtlToMs(ttl) {
  if (!ttl) return 40 * 60 * 1000;
  if (typeof ttl === "number" && Number.isFinite(ttl)) {
    return Math.max(ttl, 0);
  }
  const match = String(ttl).trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    const asNumber = Number(ttl);
    if (Number.isFinite(asNumber)) {
      return Math.max(asNumber, 0);
    }
    return 40 * 60 * 1000;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 40 * 60 * 1000;
  }
}

const SESSION_TTL_MS = parseTtlToMs(SESSION_TTL);

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.APP_KEY;
  if (secret) return secret;
  return "change-this-secret";
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, getSecret(), { expiresIn: SESSION_TTL, ...options });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = {
  TOKEN_COOKIE,
  SESSION_TTL,
  SESSION_TTL_MS,
  signToken,
  verifyToken,
};
