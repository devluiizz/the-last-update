function requireAdmin(req, res, next) {
  const user = req?.user || {};
  const role = user.role || user.tipo;
  const id = typeof user.id === "number" ? user.id : null;
  const isAdmin = role === "admin" || id === -1 || id === 1;
  if (!isAdmin) {
    return res
      .status(403)
      .json({ error: "Acesso restrito aos administradores." });
  }
  return next();
}

module.exports = requireAdmin;
