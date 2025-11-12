const { Router } = require("express");
const MemberRepository = require("../repositories/memberRepository");

const router = Router();

function mapSqliteError(err) {
  if (err && err.message === "INVALID_DATA") {
    return {
      status: 400,
      body: { error: "Dados inválidos. Verifique os campos enviados." },
    };
  }
  if (err && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    if (err.message.includes("members.cpf")) {
      return { status: 409, body: { error: "CPF já cadastrado." } };
    }
    if (err.message.includes("members.email")) {
      return { status: 409, body: { error: "Email já cadastrado." } };
    }
    return { status: 409, body: { error: "Registro duplicado." } };
  }
  return null;
}

router.get("/", (_req, res) => {
  const members = MemberRepository.list();
  return res.json(members);
});

router.get("/team", (_req, res) => {
  const members = MemberRepository.listTeamMembers();
  return res.json(members);
});

router.get("/:id/details", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const details = MemberRepository.getDetails(id);
  if (!details) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }
  return res.json(details);
});

router.post("/", (req, res) => {
  try {
    const payload = req.body || {};
    // Check if a member with this CPF exists regardless of active status
    if (payload && payload.cpf) {
      const existing = MemberRepository.findAnyByCPF(payload.cpf);
      if (existing) {
        // If the existing member is active (is_active flag) treat as duplicate
        if (existing.is_active) {
          return res.status(409).json({ error: "CPF já cadastrado." });
        }
        // Otherwise, the member is soft deleted. Signal to the client that
        // restoration is possible instead of creating a duplicate.
        return res.status(409).json({
          error: "CPF vinculado a membro excluído.",
          deleted: true,
          member: { id: existing.id, nome: existing.nome },
        });
      }
    }
    const member = MemberRepository.create(payload);
    return res.status(201).json(member);
  } catch (err) {
    const mapped = mapSqliteError(err);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error("Erro ao criar membro", err);
    return res.status(500).json({ error: "Erro interno ao criar membro." });
  }
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  try {
    const member = MemberRepository.update(id, req.body || {});
    if (!member) {
      return res.status(404).json({ error: "Membro não encontrado." });
    }
    return res.json(member);
  } catch (err) {
    const mapped = mapSqliteError(err);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    console.error("Erro ao atualizar membro", err);
    return res.status(500).json({ error: "Erro interno ao atualizar membro." });
  }
});

router.patch("/:id/about", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const member = MemberRepository.updateAbout(id, req.body?.about ?? "");
  if (!member) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }
  return res.json(member);
});

router.patch("/:id/o-que-faz", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const member = MemberRepository.updateWhatDo(
    id,
    req.body?.oQueFaz ?? req.body?.o_que_faz ?? ""
  );
  if (!member) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }
  return res.json(member);
});

router.post("/:id/team", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const member = MemberRepository.setTeamMember(id, true);
  if (!member) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }
  return res.json(member);
});

router.delete("/:id/team", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const member = MemberRepository.setTeamMember(id, false);
  if (!member) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }
  return res.json(member);
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const result = MemberRepository.remove(id);
  if (!result.changes) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }
  return res.status(204).send();
});

router.post("/:id/restore", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido." });
  }
  const member = MemberRepository.restore(id);
  if (!member) {
    return res.status(404).json({ error: "Membro não encontrado." });
  }
  return res.json(member);
});

module.exports = router;
