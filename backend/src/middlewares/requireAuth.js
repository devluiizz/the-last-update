const { verifyToken, TOKEN_COOKIE } = require("../auth/token");
const MemberRepository = require("../repositories/memberRepository");

function extractToken(req) {
  const bearer = req.get("Authorization");
  if (bearer && bearer.startsWith("Bearer ")) {
    return bearer.slice(7).trim();
  }
  if (req.cookies && req.cookies[TOKEN_COOKIE]) {
    return req.cookies[TOKEN_COOKIE];
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  try {
    const decoded = verifyToken(token);
    const member = MemberRepository.findById(decoded.sub);
    if (!member) {
      return res.status(401).json({ error: "Sessão inválida" });
    }
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : null;
    req.user = member;
    req.auth = decoded;
    req.sessionExpiresAt = expiresAt;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Sessão inválida" });
  }
}

module.exports = requireAuth;
