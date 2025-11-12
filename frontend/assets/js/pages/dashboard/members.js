(function () {
  const tbody = document.getElementById("members-tbody");
  const totalEl = document.getElementById("members-total");
  const btnAdd = document.getElementById("btn-add-member");
  // Campo de busca pelo nome dos membros
  const searchEl = document.getElementById("member-search");

  if (!tbody || !totalEl) return;

  const modal = window.MemberModal || null;
  const feedbackModal = window.appModal || null;
  const deleteModalEl = document.getElementById("memberDeleteModal") || null;
  const deleteModalOverlay =
    deleteModalEl?.querySelector("[data-member-delete-dismiss]") || null;
  const deleteModalTitle =
    deleteModalEl?.querySelector("#memberDeleteTitle") || null;
  const deleteModalMessage =
    deleteModalEl?.querySelector("#memberDeleteMessage") || null;
  const deleteModalCancel =
    deleteModalEl?.querySelector('[data-member-delete-action="cancel"]') ||
    null;
  const deleteModalConfirm =
    deleteModalEl?.querySelector('[data-member-delete-action="confirm"]') ||
    null;

  let pendingDeleteMember = null;
  let deleteModalBusy = false;

  const RESTORE_MODAL_ID = "memberRestoreModal";
  let restoreModalEl = null;

  function ensureRestoreModal() {
    if (restoreModalEl) return restoreModalEl;
    const div = document.createElement("div");
    div.className = "member-delete-modal";
    div.id = RESTORE_MODAL_ID;
    div.setAttribute("hidden", "");
    div.innerHTML = `
      <div class="member-delete-modal__overlay" data-member-restore-dismiss></div>
      <div class="member-delete-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="memberRestoreTitle">
        <h2 class="member-delete-modal__title" id="memberRestoreTitle">Atenção</h2>
        <p class="member-delete-modal__text" id="memberRestoreMessage">Este membro havia sido excluído anteriormente. Deseja restaurá-lo?</p>
        <div class="member-delete-modal__actions">
          <button type="button" class="btn-lg member-delete-modal__secondary" data-member-restore-action="cancel">Cancelar</button>
          <button type="button" class="btn-lg member-delete-modal__primary" data-member-restore-action="confirm">Restaurar</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    restoreModalEl = div;
    return div;
  }

  function openRestoreModal() {
    const modal = ensureRestoreModal();
    return new Promise((resolve) => {
      // Set up event handlers for cancel and confirm actions
      const overlay = modal.querySelector("[data-member-restore-dismiss]");
      const cancelBtn = modal.querySelector(
        '[data-member-restore-action="cancel"]'
      );
      const confirmBtn = modal.querySelector(
        '[data-member-restore-action="confirm"]'
      );

      function cleanup(result) {
        // Remove listeners and hide modal
        if (overlay) overlay.removeEventListener("click", onDismiss);
        if (cancelBtn) cancelBtn.removeEventListener("click", onCancel);
        if (confirmBtn) confirmBtn.removeEventListener("click", onConfirm);
        modal.removeAttribute("data-active");
        // Allow time for CSS transitions before hiding completely
        setTimeout(() => {
          modal.setAttribute("hidden", "");
        }, 220);
        // Remove modal-open class to restore scroll
        document.body.classList.remove("member-delete-modal-open");
        resolve(result);
      }

      function onDismiss() {
        cleanup(false);
      }
      function onCancel() {
        cleanup(false);
      }
      function onConfirm() {
        cleanup(true);
      }

      overlay.addEventListener("click", onDismiss);
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);

      // Show modal
      modal.removeAttribute("hidden");
      // Prevent background scroll when modal is active
      document.body.classList.add("member-delete-modal-open");
      requestAnimationFrame(() => {
        modal.setAttribute("data-active", "true");
        // Set focus on confirm button for accessibility
        if (confirmBtn) {
          setTimeout(() => {
            confirmBtn.focus();
          }, 240);
        }
      });
    });
  }

  function normalizeCpf(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, 11);
  }

  function formatCpf(value) {
    const digits = normalizeCpf(value);
    if (!digits) return "";
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatPhone(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "telefone n\u00e3o cadastrado";
    const cleanDigits = normalizePhone(value);
    const digits =
      cleanDigits.length > 11
        ? cleanDigits.slice(cleanDigits.length - 11)
        : cleanDigits;
    if (digits.length === 11) {
      return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    if (digits.length === 10) {
      return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    if (digits.length) return digits;
    return rawValue;
  }

  const SINCE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  function parseISODate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatSince(dateIso) {
    const date = parseISODate(dateIso);
    if (!date) return "";
    return `Desde ${SINCE_FORMATTER.format(date)}`;
  }

  function formatArticleDate(dateIso) {
    const date = parseISODate(dateIso);
    if (!date) return "";
    const parts = SHORT_MONTH_FORMATTER.formatToParts(date);
    const day = parts.find((p) => p.type === "day")?.value || "";
    const month = (parts.find((p) => p.type === "month")?.value || "").replace(
      ".",
      ""
    );
    const year = parts.find((p) => p.type === "year")?.value || "";
    return `${day} ${month} ${year}`.trim();
  }

  function adaptMember(raw) {
    if (!raw) return null;
    const tipo = raw.tipo || raw.role || "jornalista";
    const avatarLight = raw.avatar_light || DEFAULT_AVATARS.light;
    const avatarDark = raw.avatar_dark || DEFAULT_AVATARS.dark;
    const totalPublicacoes =
      Number(raw.total_publicacoes ?? raw.publicacoes ?? 0) || 0;
    const totalExclusoes = Number(raw.total_exclusoes ?? 0) || 0;
    const telefoneRaw =
      raw.phone ??
      raw.telefone ??
      raw.telefone_contato ??
      raw.telefoneContato ??
      raw.celular ??
      raw.cellphone ??
      "";
    return {
      id: raw.id,
      nome: raw.nome || raw.name || "",
      email: raw.email || "",
      telefone: telefoneRaw,
      telefoneLabel: formatPhone(telefoneRaw),
      cpf: normalizeCpf(raw.cpf),
      nascimento: raw.nascimento || "",
      tipo,
      role: tipo,
      teamMember:
        raw.team_member === 1 ||
        raw.team_member === true ||
        raw.teamMember === 1 ||
        raw.teamMember === true,
      cidade: raw.cidade || "",
      about: raw.about || "",
      oQueFaz: raw.o_que_faz || raw.oQueFaz || "",
      publicacoesTotal: totalPublicacoes,
      exclusoesTotal: totalExclusoes,
      createdAt: raw.created_at || raw.createdAt || "",
      avatar_light: avatarLight,
      avatar_dark: avatarDark,
    };
  }

  function isDeleteModalOpen() {
    return deleteModalEl?.getAttribute("data-active") === "true";
  }

  function resetDeleteModalControls() {
    deleteModalBusy = false;
    if (deleteModalConfirm) deleteModalConfirm.disabled = false;
    if (deleteModalCancel) deleteModalCancel.disabled = false;
  }

  function closeDeleteModal(immediate = false, clearTarget = true) {
    if (!deleteModalEl) return;
    const finalize = () => {
      deleteModalEl.setAttribute("hidden", "");
      if (clearTarget) pendingDeleteMember = null;
      resetDeleteModalControls();
    };
    if (!isDeleteModalOpen()) {
      finalize();
      return;
    }
    deleteModalEl.removeAttribute("data-active");
    if (immediate) {
      finalize();
      return;
    }
    const onTransitionEnd = (event) => {
      if (event.target !== deleteModalEl) return;
      deleteModalEl.removeEventListener("transitionend", onTransitionEnd);
      finalize();
    };
    deleteModalEl.addEventListener("transitionend", onTransitionEnd);
    window.setTimeout(onTransitionEnd, 240);
  }

  function openDeleteModal(member) {
    if (!deleteModalEl) return;
    pendingDeleteMember = member;
    resetDeleteModalControls();
    if (deleteModalTitle)
      deleteModalTitle.textContent = `Excluir ${member.nome}?`;
    if (deleteModalMessage)
      deleteModalMessage.textContent = "Essa ação não pode ser desfeita.";
    deleteModalEl.removeAttribute("hidden");
    requestAnimationFrame(() => {
      deleteModalEl.setAttribute("data-active", "true");
    });
    if (deleteModalCancel) {
      setTimeout(() => {
        if (isDeleteModalOpen()) deleteModalCancel.focus();
      }, 240);
    }
  }

  async function handleDeleteConfirmation() {
    if (!pendingDeleteMember || deleteModalBusy) return;
    const member = pendingDeleteMember;
    deleteModalBusy = true;
    if (deleteModalConfirm) deleteModalConfirm.disabled = true;
    if (deleteModalCancel) deleteModalCancel.disabled = true;
    closeDeleteModal(false, false);
    if (feedbackModal) {
      feedbackModal.showLoading("Removendo membro...", { duration: 4400 });
    }
    try {
      await Store.remove(member.id);
      renderMembers();
      if (feedbackModal) {
        feedbackModal.showStatus({
          type: "success",
          message: `${member.nome} removido com sucesso.`,
          duration: 4200,
        });
      }
    } catch (err) {
      if (feedbackModal) {
        feedbackModal.showStatus({
          type: "error",
          message: err.message || "Erro ao excluir membro.",
          duration: 5200,
        });
      } else {
        console.warn(err.message || "Erro ao excluir membro.");
      }
    } finally {
      pendingDeleteMember = null;
      deleteModalBusy = false;
      resetDeleteModalControls();
    }
  }

  function getMemberAvatar(member) {
    if (!member) return DEFAULT_AVATARS.dark;
    return typeof window.isLightTheme === "function" && window.isLightTheme()
      ? member.avatar_light || DEFAULT_AVATARS.light
      : member.avatar_dark || DEFAULT_AVATARS.dark;
  }

  const Store = {
    _items: [],

    list() {
      return [...this._items];
    },

    get(id) {
      return this._items.find((m) => m.id === id);
    },

    async refresh() {
      const response = await apiFetch("/api/members");
      const items = Array.isArray(response) ? response.map(adaptMember) : [];
      // Ordena os membros por ID crescente para garantir a exibição na ordem
      // de criação (conforme solicitado). O ID pode vir como string ou número,
      // por isso convertemos para número ao comparar.
      items.sort((a, b) => {
        const idA = a.id != null ? Number(a.id) : 0;
        const idB = b.id != null ? Number(b.id) : 0;
        return idA - idB;
      });
      this._items = items;
      return this.list();
    },

    async create(payload) {
      const created = await apiFetch("/api/members", {
        method: "POST",
        body: payload,
      });
      const item = adaptMember(created);
      this._items.push(item);
      return item;
    },

    async update(id, payload) {
      const updated = await apiFetch(`/api/members/${id}`, {
        method: "PUT",
        body: payload,
      });
      const item = adaptMember(updated);
      const idx = this._items.findIndex((m) => m.id === item.id);
      if (idx >= 0) this._items[idx] = item;
      return item;
    },

    async remove(id) {
      await apiFetch(`/api/members/${id}`, { method: "DELETE" });
      const idx = this._items.findIndex((m) => m.id === id);
      if (idx >= 0) this._items.splice(idx, 1);
    },
  };

  function roleBadge(role) {
    const isAdmin = role === "admin";
    const cls = isAdmin ? "badge badge--admin" : "badge badge--journalist";
    const label = isAdmin ? "Admin" : "Jornalista";
    return `<span class="${cls}">${label}</span>`;
  }

  function actionButtons(id) {
    return `
      <button class="icon-btn" data-action="delete" data-id="${id}" title="Excluir" aria-label="Excluir">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.4801 6.26987L6.51992 17.23M17.4801 17.23L13.4142 13.1642M6.51992 6.26987L10.5858 10.3357" stroke="var(--color-primary01)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="icon-btn" data-action="edit" data-id="${id}" title="Editar" aria-label="Editar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.3246 9.76734L18.8493 8.24264C19.6303 7.46159 19.6303 6.19526 18.8493 5.41421C18.0682 4.63316 16.8019 4.63316 16.0208 5.41421L8.03461 13.4004C7.86533 13.5697 7.72782 13.768 7.62862 13.9859L6.52143 16.4176C6.13828 17.2591 7.00441 18.1252 7.84592 17.7421L10.2776 16.6349C10.4955 16.5357 10.6938 16.3982 10.863 16.2289L11.8495 15.2424M17.3246 9.76734L16.2639 8.70668M17.3246 9.76734L14.2415 12.8504" stroke="var(--color-darkwhite)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    `;
  }

  function rowTemplate(member) {
    const avatarSrc = getMemberAvatar(member);
    return `
      <tr data-id="${member.id}">
        <td>#${String(member.id).padStart(3, "0")}</td>
        <td>
          <div class="member-name">
            <img class="member-name__avatar" src="${avatarSrc}" alt="Avatar de ${
      member.nome
    }">
            <div>
              <div class="btn-md">${member.nome}</div>
              <small class="btn-sm btn-second member-name__cpf">${formatCpf(
                member.cpf
              )}</small>
            </div>
          </div>
        </td>
        <td class="member-contact">
          <span class="member-contact__email">${member.email || "-"}</span>
          <span class="member-contact__phone">${member.telefoneLabel}</span>
        </td>
        <td class="btn-md">${roleBadge(member.tipo)}</td>
        <td>
          <div class="member-stats">
            <div class="member-stats__item member-stats__item--green">
              <span class="member-stats__icon" aria-hidden="true">\ud83d\udcc4</span>
              <div class="member-stats__text">
                <span class="member-stats__value">${
                  member.publicacoesTotal
                }</span>
                <span class="member-stats__label">publica\u00e7\u00f5es</span>
              </div>
            </div>
            <div class="member-stats__item member-stats__item--red">
              <span class="member-stats__icon" aria-hidden="true">\ud83d\uddd1\ufe0f</span>
              <div class="member-stats__text">
                <span class="member-stats__value">${
                  member.exclusoesTotal
                }</span>
                <span class="member-stats__label">exclus\u00f5es</span>
              </div>
            </div>
          </div>
        </td>
        <td>
          <div class="actions">${actionButtons(member.id)}</div>
        </td>
      </tr>
    `;
  }

  function renderMembers() {
    // Aplica filtro de busca pelo nome do membro, se o campo de busca existir
    const q =
      searchEl && searchEl.value ? searchEl.value.trim().toLowerCase() : "";
    let data = Store.list();
    if (q) {
      data = data.filter((m) => {
        const name = String(m.nome || m.name || "").toLowerCase();
        return name.includes(q);
      });
    }
    if (!data.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="btn-md btn-second" style="text-align:center">Nenhum membro cadastrado.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = data.map(rowTemplate).join("");
    }
    totalEl.textContent = String(data.length);
  }

  async function loadMembers(initial = false) {
    try {
      await Store.refresh();
      renderMembers();
    } catch (err) {
      console.error("Falha ao carregar membros", err);
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="btn-md btn-second" style="text-align:center">
            ${
              err.status === 403
                ? "Acesso restrito aos administradores."
                : "Erro ao carregar membros."
            }
          </td>
        </tr>
      `;
      totalEl.textContent = "0";
      if (!initial) {
        if (feedbackModal) {
          feedbackModal.showStatus({
            type: "error",
            message: err.message || "Erro ao carregar membros.",
            duration: 5200,
          });
        } else {
          console.warn(err.message || "Erro ao carregar membros.");
        }
      }
    }
  }

  // Vincula a funcionalidade de busca ao campo de entrada. Quando o usuário digita
  // no campo de busca de membros, a lista é filtrada em tempo real.
  if (searchEl) {
    searchEl.addEventListener("input", () => {
      renderMembers();
    });
  }

  function openCreateModal() {
    if (!modal || typeof modal.openCreate !== "function") return;
    modal.openCreate({
      onSubmit: async (form) => {
        const dto = {
          role: form.role,
          cpf: normalizeCpf(form.cpf),
          nascimento: form.nascimento,
          nome: (form.nome || "").trim(),
          email: (form.email || "").trim(),
        };
        try {
          const created = await Store.create(dto);
          renderMembers();
          return created;
        } catch (err) {
          // If the CPF exists but the member is soft-deleted, err.payload.deleted
          // will be truthy. Prompt the user to restore the existing member.
          if (err && err.status === 409 && err.payload && err.payload.deleted) {
            const confirmRestore = await openRestoreModal();
            if (confirmRestore) {
              try {
                // Call the restore endpoint using the member ID provided in the payload
                const restored = await apiFetch(
                  `/api/members/${err.payload.member.id}/restore`,
                  { method: "POST" }
                );
                // Update local store and re-render
                updateStoredMember(restored, { rerender: true });
                return restored;
              } catch (restoreErr) {
                // If restore fails, propagate the error so the modal shows a message
                throw restoreErr;
              }
            }
            // User chose not to restore; throw original error so the modal shows an error
            throw err;
          }
          // For other errors, rethrow to let the modal display the message
          throw err;
        }
      },
    });
  }

  function openEditModal(member) {
    if (!modal || typeof modal.openEdit !== "function") return;
    modal.openEdit({
      member: {
        id: member.id,
        nome: member.nome,
        email: member.email,
        cpf: member.cpf,
        nascimento: member.nascimento,
        role: member.role,
        avatar_light: member.avatar_light,
        avatar_dark: member.avatar_dark,
      },
      onSubmit: async (form) => {
        const dto = {
          role: form.role,
          cpf: normalizeCpf(form.cpf),
          nascimento: form.nascimento,
          nome: (form.nome || "").trim(),
          email: (form.email || "").trim(),
        };
        const updated = await Store.update(form.id, dto);
        renderMembers();
        return updated;
      },
    });
  }

  let detailModalEl = null;

  function updateStoredMember(raw, options = {}) {
    if (!raw) return null;
    const adapted = adaptMember(raw);
    const index = Store._items.findIndex((item) => item.id === adapted.id);
    if (index >= 0) {
      Store._items[index] = { ...Store._items[index], ...adapted };
    } else {
      Store._items.push(adapted);
    }
    if (options.rerender) {
      renderMembers();
    }
    return adapted;
  }

  function buildArticleUrl(pub) {
    if (pub.slug) {
      return `/noticia/${encodeURIComponent(pub.slug)}`;
    }
    if (pub.id) {
      return `/pages/noticia.html?id=${encodeURIComponent(pub.id)}`;
    }
    return "#";
  }

  function closeMemberDetail() {
    if (!detailModalEl) return;
    detailModalEl.remove();
    detailModalEl = null;
    document.body.classList.remove("member-detail-modal-open");
    document.removeEventListener("keydown", handleDetailKeydown);
  }

  function handleDetailKeydown(event) {
    if (event.key === "Escape") {
      closeMemberDetail();
    }
  }

  function renderMemberDetailModal(detail, memberData) {
    closeMemberDetail();
    const memberInfo = memberData || adaptMember(detail.member);
    const stats = detail.stats || {
      publicacoes: memberInfo.publicacoesTotal || 0,
      exclusoes: memberInfo.exclusoesTotal || 0,
    };
    const latest = Array.isArray(detail.latestPublicacoes)
      ? detail.latestPublicacoes
      : [];

    const overlay = document.createElement("div");
    overlay.className = "member-detail-modal";
    overlay.innerHTML = `
      <div class="member-detail-modal__backdrop" data-member-detail-close></div>
      <div class="member-detail-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="member-detail-title">
        <button type="button" class="member-detail-modal__close" data-member-detail-close aria-label="Fechar modal">\u2715</button>
        <div class="member-detail-modal__layout">
          <aside class="member-detail-modal__column member-detail-modal__column--left">
            <article class="member-info-card member-info-card--profile">
              <img class="member-info-card__avatar" src="${getMemberAvatar(
                memberInfo
              )}" alt="Avatar de ${memberInfo.nome}">
              <h2 class="member-info-card__name" id="member-detail-title">${
                memberInfo.nome
              }</h2>
              <p class="member-info-card__since">${formatSince(
                memberInfo.createdAt
              )}</p>
              <button type="button" class="member-info-card__primary" id="btn-adicionar-equipe">Adicionar \u00e0 equipe</button>
            </article>

            <article class="member-info-card">
              <h3 class="member-info-card__label">Contato</h3>
              <div class="member-info-card__stack">
                <span class="member-info-card__value">${
                  memberInfo.email || "-"
                }</span>
                <span class="member-info-card__muted">${
                  memberInfo.telefoneLabel
                }</span>
              </div>
            </article>

            <article class="member-info-card member-info-card--editable">
              <div class="member-info-card__header">
                <span class="member-info-card__label">O que faz \u2753</span>
                <button type="button" class="member-info-card__icon-btn" data-member-save-what aria-label="Salvar O que faz">\ud83d\udcbe</button>
              </div>
              <textarea class="member-info-card__textarea" data-member-what rows="4" maxlength="400" placeholder="Descreva as responsabilidades do membro.">${
                detail.member.o_que_faz || ""
              }</textarea>
            </article>

            <article class="member-info-card member-info-card--editable">
              <div class="member-info-card__header">
                <span class="member-info-card__label">Sobre voc\u00ea</span>
                <div class="member-info-card__actions">
                  <button type="button" class="member-info-card__icon-btn" data-member-edit-about aria-label="Editar Sobre voc\u00ea">\u270f\ufe0f</button>
                  <button type="button" class="member-info-card__icon-btn" data-member-save-about aria-label="Salvar Sobre voc\u00ea" disabled>\ud83d\udcbe</button>
                </div>
              </div>
              <textarea class="member-info-card__textarea" data-member-about rows="4" maxlength="600" readonly placeholder="Sem informa\u00e7\u00f5es.">${
                detail.member.about || ""
              }</textarea>
            </article>
          </aside>

          <section class="member-detail-modal__column member-detail-modal__column--right">
            <article class="member-info-card">
              <h3 class="member-info-card__label">Documentos</h3>
              <div class="member-info-card__stack">
                <span class="member-info-card__muted">CPF</span>
                <span class="member-info-card__value">${formatCpf(
                  memberInfo.cpf
                )}</span>
              </div>
              ${
                memberInfo.cidade
                  ? `<div class="member-info-card__stack">
                      <span class="member-info-card__muted">Cidade</span>
                      <span class="member-info-card__value">${memberInfo.cidade}</span>
                    </div>`
                  : ""
              }
            </article>

            <article class="member-info-card member-info-card--stats">
              <div class="member-stats member-stats--modal">
                <div class="member-stats__item member-stats__item--green">
                  <span class="member-stats__icon" aria-hidden="true">\ud83d\udcc4</span>
                  <div class="member-stats__text">
                    <span class="member-stats__value">${
                      stats.publicacoes || 0
                    }</span>
                    <span class="member-stats__label">publica\u00e7\u00f5es</span>
                  </div>
                </div>
                <div class="member-stats__item member-stats__item--red">
                  <span class="member-stats__icon" aria-hidden="true">\ud83d\uddd1\ufe0f</span>
                  <div class="member-stats__text">
                    <span class="member-stats__value">${
                      stats.exclusoes || 0
                    }</span>
                    <span class="member-stats__label">exclus\u00f5es</span>
                  </div>
                </div>
              </div>
            </article>

            <article class="member-info-card member-info-card--latest">
              <div class="member-info-card__header">
                <h3 class="member-info-card__label">\u00daltimas publica\u00e7\u00f5es</h3>
              </div>
              ${
                latest.length
                  ? `<div class="member-detail-modal__table-wrapper">
                      <table class="member-detail-modal__table">
                        <thead>
                          <tr>
                            <th>Publica\u00e7\u00e3o</th>
                            <th>Categoria</th>
                            <th>Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${latest
                          .map((pub) => {
                            const url = buildArticleUrl(pub);
                            return `<tr>
                              <td><a href="${url}">${pub.titulo}</a></td>
                              <td>${pub.categoria || "-"}</td>
                              <td>${formatArticleDate(pub.created_at)}</td>
                            </tr>`;
                          })
                          .join("")}
                      </tbody>
                    </table>
                    </div>`
                  : '<p class="member-detail-modal__empty">Sem publica\u00e7\u00f5es registradas.</p>'
              }
            </article>
          </section>
        </div>
      </div>
    `;

    detailModalEl = overlay;
    document.body.appendChild(overlay);
    document.body.classList.add("member-detail-modal-open");
    document.addEventListener("keydown", handleDetailKeydown);

    const addTeamBtn = overlay.querySelector("#btn-adicionar-equipe");
    if (addTeamBtn) {
      addTeamBtn.dataset.memberId = String(memberInfo.id);
      // Atualiza o rótulo e o estado do botão de equipe. Nunca desabilita o
      // botão para permitir a remoção; o estado é mantido via dataset.
      const setTeamButtonState = (isMember) => {
        addTeamBtn.textContent = isMember
          ? "J\u00e1 na equipe"
          : "Adicionar \u00e0 equipe";
        // sempre habilitado; a desativação temporária ocorre apenas durante a requisição
        addTeamBtn.disabled = false;
        addTeamBtn.dataset.teamMember = isMember ? "1" : "0";
      };
      // Aplica o estado inicial do botão com base no membro atual
      setTeamButtonState(Boolean(memberInfo.teamMember));
      // Exibe sugestão de remoção ao passar o mouse quando o membro já faz parte da equipe
      addTeamBtn.addEventListener("mouseenter", () => {
        if (addTeamBtn.dataset.teamMember === "1") {
          addTeamBtn.textContent = "Remover da equipe?";
        }
      });
      addTeamBtn.addEventListener("mouseleave", () => {
        if (addTeamBtn.dataset.teamMember === "1") {
          addTeamBtn.textContent = "J\u00e1 na equipe";
        }
      });
      addTeamBtn.addEventListener("click", async () => {
        if (addTeamBtn.dataset.loading === "1") return;
        const isMember = addTeamBtn.dataset.teamMember === "1";
        addTeamBtn.dataset.loading = "1";
        // Desabilita temporariamente para prevenir cliques múltiplos
        addTeamBtn.disabled = true;
        if (feedbackModal) {
          feedbackModal.showLoading(
            isMember
              ? "Removendo da equipe..."
              : "Adicionando \u00e0 equipe...",
            {
              duration: window.TLU_LOADING_MS,
            }
          );
        }
        try {
          let updated;
          if (isMember) {
            // Remove o membro da equipe
            updated = await apiFetch(`/api/members/${memberInfo.id}/team`, {
              method: "DELETE",
            });
          } else {
            // Adiciona o membro à equipe
            updated = await apiFetch(`/api/members/${memberInfo.id}/team`, {
              method: "POST",
            });
          }
          feedbackModal?.hide(true);
          const normalized = updateStoredMember(updated, { rerender: true });
          if (normalized) {
            memberInfo.teamMember = normalized.teamMember;
          }
          const nowMember = Boolean(memberInfo.teamMember);
          setTeamButtonState(nowMember);
          if (isMember) {
            // Caso fosse membro, exibimos mensagem de remoção
            if (feedbackModal) {
              feedbackModal.showStatus({
                type: "success",
                message: "Removido da equipe com sucesso",
                duration: 4200,
              });
            }
            // Remove cartão correspondente da seção Quem Somos, se existir
            try {
              const slider = document.getElementById("team-slider");
              if (slider) {
                const card = slider.querySelector(
                  `[data-id="${memberInfo.id}"]`
                );
                if (card) card.remove();
                slider.dispatchEvent(
                  new CustomEvent("team:updated", {
                    bubbles: false,
                    cancelable: false,
                  })
                );
              }
            } catch (_) {
              // ignora falhas de atualização visual
            }
          } else {
            // Caso tenha sido adicionado
            if (feedbackModal) {
              feedbackModal.showStatus({
                type: "success",
                message: `${memberInfo.nome} agora faz parte da equipe.`,
                duration: 4200,
              });
            }
            // Não atualizamos a página Quem Somos aqui; ela será recarregada posteriormente
          }
        } catch (err) {
          feedbackModal?.hide(true);
          if (feedbackModal) {
            feedbackModal.showStatus({
              type: "error",
              message:
                err?.message ||
                (isMember
                  ? "Erro ao remover da equipe."
                  : "Erro ao adicionar \u00e0 equipe."),
              duration: 5200,
            });
          } else {
            console.warn(
              err?.message ||
                (isMember
                  ? "Erro ao remover da equipe."
                  : "Erro ao adicionar \u00e0 equipe."),
              err
            );
          }
        } finally {
          delete addTeamBtn.dataset.loading;
          // Reativa o botão após conclusão
          addTeamBtn.disabled = false;
        }
      });
    }

    overlay
      .querySelectorAll("[data-member-detail-close]")
      .forEach((btn) => btn.addEventListener("click", closeMemberDetail));

    const saveWhatBtn = overlay.querySelector("[data-member-save-what]");
    const whatTextarea = overlay.querySelector("[data-member-what]");
    const saveAboutBtn = overlay.querySelector("[data-member-save-about]");
    const editAboutBtn = overlay.querySelector("[data-member-edit-about]");
    const aboutTextarea = overlay.querySelector("[data-member-about]");

    saveWhatBtn?.addEventListener("click", async () => {
      if (!whatTextarea) return;
      const value = whatTextarea.value.trim();
      saveWhatBtn.disabled = true;
      try {
        if (feedbackModal) {
          feedbackModal.showLoading("Salvando informa\u00e7\u00f5es...", {
            duration: window.TLU_LOADING_MS,
          });
        }
        const updated = await apiFetch(
          `/api/members/${memberInfo.id}/o-que-faz`,
          {
            method: "PATCH",
            body: { oQueFaz: value },
          }
        );
        feedbackModal?.hide(true);
        const normalized = updateStoredMember(updated, { rerender: true });
        if (normalized) {
          memberInfo.oQueFaz = normalized.oQueFaz;
        }
        if (feedbackModal) {
          feedbackModal.showStatus({
            type: "success",
            message: "Informa\u00e7\u00f5es atualizadas.",
            duration: 4200,
          });
        }
      } catch (err) {
        feedbackModal?.hide(true);
        if (feedbackModal) {
          feedbackModal.showStatus({
            type: "error",
            message: err.message || "Erro ao salvar informa\u00e7\u00f5es.",
            duration: 5200,
          });
        } else {
          console.warn(err.message || "Erro ao salvar informa\u00e7\u00f5es.");
        }
      } finally {
        saveWhatBtn.disabled = false;
      }
    });

    editAboutBtn?.addEventListener("click", () => {
      if (!aboutTextarea) return;
      aboutTextarea.readOnly = false;
      aboutTextarea.focus();
      aboutTextarea.setSelectionRange(
        aboutTextarea.value.length,
        aboutTextarea.value.length
      );
      saveAboutBtn.disabled = false;
    });

    saveAboutBtn?.addEventListener("click", async () => {
      if (!aboutTextarea) return;
      const value = aboutTextarea.value.trim();
      saveAboutBtn.disabled = true;
      try {
        if (feedbackModal) {
          feedbackModal.showLoading("Salvando informa\u00e7\u00f5es...", {
            duration: window.TLU_LOADING_MS,
          });
        }
        const updated = await apiFetch(`/api/members/${memberInfo.id}/about`, {
          method: "PATCH",
          body: { about: value },
        });
        feedbackModal?.hide(true);
        const normalized = updateStoredMember(updated, { rerender: true });
        if (normalized) {
          memberInfo.about = normalized.about;
        }
        aboutTextarea.readOnly = true;
        saveAboutBtn.disabled = true;
        if (feedbackModal) {
          feedbackModal.showStatus({
            type: "success",
            message: "Informa\u00e7\u00f5es atualizadas.",
            duration: 4200,
          });
        }
      } catch (err) {
        feedbackModal?.hide(true);
        saveAboutBtn.disabled = false;
        aboutTextarea.readOnly = false;
        if (feedbackModal) {
          feedbackModal.showStatus({
            type: "error",
            message: err.message || "Erro ao salvar informa\u00e7\u00f5es.",
            duration: 5200,
          });
        } else {
          console.warn(err.message || "Erro ao salvar informa\u00e7\u00f5es.");
        }
      }
    });
  }

  async function openMemberDetail(id) {
    try {
      if (feedbackModal) {
        feedbackModal.showLoading("Carregando membro...", {
          duration: window.TLU_LOADING_MS,
        });
      }
      const detail = await apiFetch(`/api/members/${id}/details`);
      feedbackModal?.hide(true);
      if (!detail || !detail.member) return;
      const normalized = updateStoredMember(detail.member, { rerender: true });
      renderMemberDetailModal(detail, normalized);
    } catch (err) {
      feedbackModal?.showStatus({
        type: "error",
        message: err.message || "Erro ao carregar detalhes do membro.",
        duration: 5200,
      });
    }
  }

  btnAdd?.addEventListener("click", () => {
    openCreateModal();
  });

  deleteModalOverlay?.addEventListener("click", () =>
    closeDeleteModal(false, true)
  );
  deleteModalCancel?.addEventListener("click", () =>
    closeDeleteModal(false, true)
  );
  deleteModalConfirm?.addEventListener("click", handleDeleteConfirmation);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!isDeleteModalOpen()) return;
    event.preventDefault();
    closeDeleteModal(false, true);
  });

  tbody?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest(".icon-btn");
    if (actionButton) {
      const id = Number(actionButton.dataset.id);
      if (!Number.isInteger(id)) return;
      const action = actionButton.dataset.action;
      const current = Store.get(id);
      if (!current) return;

      if (action === "edit") {
        openEditModal(current);
        return;
      }

      if (action === "delete") {
        openDeleteModal(current);
        return;
      }
      return;
    }

    if (event.target.closest(".actions")) return;
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const id = Number(row.dataset.id);
    if (!Number.isInteger(id)) return;
    openMemberDetail(id);
  });

  loadMembers(true);
})();
