(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const feedbackModal = window.appModal || null;
  const DEFAULT_DURATION = 3000;
  const ERROR_DURATION = 3000;

  const showLoadingModal = (message, duration) => {
    if (!feedbackModal) return;
    const ms =
      Number.isFinite(Number(duration)) && Number(duration) > 0
        ? Number(duration)
        : window.TLU_LOADING_MS || 3600;
    feedbackModal.showLoading(message, { duration: ms });
  };

  const showStatusModal = (type, message, duration) => {
    if (!feedbackModal) return;
    const ms =
      Number.isFinite(Number(duration)) && Number(duration) > 0
        ? Number(duration)
        : DEFAULT_DURATION;
    feedbackModal.showStatus({
      type,
      message,
      duration: ms,
    });
  };

  function getCategoryLabels(input) {
    const category = String(input || "").trim();
    return {
      category,
      categoryLabel: category,
      subcategory: "",
      subcategoryLabel: "",
    };
  }
  function asItems(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.items)) return json.items;
    if (json && Array.isArray(json.data)) return json.data;
    return [];
  }
  function normalizeStatus(s) {
    const v = String(s || "").toLowerCase();
    if (v === "published" || v === "publicado") return "published";
    if (v === "excluded" || v === "excluido" || v === "excluído")
      return "excluded";
    if (
      v === "review" ||
      v === "analysis" ||
      v === "analise" ||
      v === "análise"
    )
      return "review";
    if (v === "draft" || v === "rascunho") return "draft";
    return s || "published";
  }

  function slugifyTitle(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " e ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  function makeArticleUrl(pub) {
    // Gera sempre a rota usando o slug. Se o slug não estiver presente, ele é
    // derivado do título por meio de slugifyTitle. O ID nunca é exposto na URL.
    const slug =
      pub && (pub.slug || slugifyTitle(pub.title || ""));
    if (slug) return `/noticia/${encodeURIComponent(slug)}`;
    return "#";
  }

  const state = {
    page: 1,
    pageSize: 8,
    query: "",
    author: "__all__",
    category: "__all__",
    sort: "recent",
    currentUser: "Dr. Ana Silva",
  };

  const draftState = {
    page: 1,
    pageSize: 8,
    query: "",
    author: "__all__",
    category: "__all__",
    sort: "recent",
    currentUser: state.currentUser,
  };

  const scope = $("#view-publicacoes") || document;
  const els = {
    tbody: $("#publication-tbody", scope),
    search: $("#pub-search", scope),
    author: $("#pub-filter-author", scope),
    category: $("#pub-filter-category", scope),
    sort: $("#pub-sort", scope),
    newBtn: $("#btn-new-publication", scope),
    pagination: (function () {
      let p = $("#pub-pagination", scope);
      if (!p) {
        const tw = $(".table-wrapper", scope);
        if (tw) {
          tw.insertAdjacentHTML(
            "afterend",
            `<div class="publication-pagination" id="pub-pagination" style="margin:12px 0; display:flex; gap:8px; justify-content:center;"></div>`
          );
          p = $("#pub-pagination", scope);
        }
      }
      return p;
    })(),
    kpiTotal: $("#kpi-total", scope),
    kpiMine: $("#kpi-mine", scope),
    kpiViews: $("#kpi-views", scope),
    kpiMonth: $("#kpi-month", scope),
  };

  const scopeDraft = document.querySelector("#view-rascunhos") || document;
  const draftEls = {
    tbody: $("#draft-tbody", scopeDraft),
    search: $("#draft-search", scopeDraft),
    author: $("#draft-filter-author", scopeDraft),
    category: $("#draft-filter-category", scopeDraft),
    sort: $("#draft-sort", scopeDraft),
    pagination: (function () {
      let p = $("#draft-pagination", scopeDraft);
      if (!p) {
        const tw = scopeDraft.querySelector(".table-wrapper");
        if (tw) {
          tw.insertAdjacentHTML(
            "afterend",
            `<div class="publication-pagination" id="draft-pagination" style="margin:12px 0; display:flex; gap:8px; justify-content:center;"></div>`
          );
          p = $("#draft-pagination", scopeDraft);
        }
      }
      return p;
    })(),
    kpiTotal: $("#kpi-draft-total", scopeDraft),
    kpiMine: $("#kpi-draft-mine", scopeDraft),
    kpiOther: $("#kpi-draft-other", scopeDraft),
    kpiMonth: $("#kpi-draft-month", scopeDraft),
  };

  // Alternância de seções
  const sectionList = $(
    ".publication-section[aria-labelledby='publication-section']",
    scope
  );
  const sectionEdit = $(
    ".publication-edit[aria-labelledby='publication-section']",
    scope
  );
  const sectionPreview = $(
    ".publication-preview[aria-labelledby='publication-section']",
    scope
  );
  const btnBack = $("#btn-back-publication", scope);

  function toggleSections(showEdit) {
    if (sectionList) sectionList.hidden = !!showEdit;
    if (sectionEdit) sectionEdit.hidden = !showEdit;
    if (sectionPreview) sectionPreview.hidden = true;
    if (showEdit) {
      if (!editMode) initEditorDefaults();
      updateWordCount();
      $("#pub-editor", scope)?.focus();
    }
  }

  const data = [];
  const drafts = [];
  const excluded = [];

  async function fetchPublished() {
    try {
      const isAdmin = window.currentUser && window.currentUser.role === "admin";
      const base = "/api/publications";
      const statusBuckets = [
        { key: "published", query: "?status=published" },
        { key: "review", query: "?status=review" },
        { key: "analysis", query: "?status=analysis" },
        { key: "analise", query: "?status=analise" },
      ];

      const collected = [];

      for (const bucket of statusBuckets) {
        let q = bucket.query;
        if (!isAdmin) {
          if (bucket.key === "published") q += "&mine=true";
        }
        const res = await fetch(`${base}${q}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) continue;
        const items = asItems(await res.json());
        items.forEach((item) => collected.push(item));
      }

      data.splice(0, data.length);

      const currentId = window.currentUser?.id ?? null;
      const currentName =
        window.currentUser?.nome || window.currentUser?.name || "";

      collected.forEach((item) => {
        const status = normalizeStatus(item.status || item.situation || "");
        if (!isAdmin && status === "review") {
          const authorId =
            (item.author && item.author.id) || item.author_id || null;
          const authorName =
            (item.author && (item.author.name || item.author.nome)) ||
            item.author_name ||
            item.author ||
            "";
          const belongsToMe =
            (currentId && authorId && String(currentId) === String(authorId)) ||
            (!!authorName && !!currentName && authorName === currentName);
          if (!belongsToMe) return;
        }

        const catInfo = getCategoryLabels(item.category || "");
        data.push({
          id: item.id,
          slug: item.slug || null,
          title: item.title,
          author:
            (item.author && (item.author.name || item.author.nome)) ||
            item.author_name ||
            item.author ||
            "",
          authorId: (item.author && item.author.id) || item.author_id || null,
          category: catInfo.category,
          categoryLabel: catInfo.categoryLabel,
          subcategory: catInfo.subcategory,
          subcategoryLabel: catInfo.subcategoryLabel,
          dateISO: item.date || "",
          status: status,
          views: item.views,
          uniqueViews:
            item.uniqueViews ??
            item.unique_views ??
            item.visitas_unicas ??
            0,
          // Cliques não são mais contabilizados.
          cover: item.image || "",
          description: item.description || "",
          imageCredit: item.image_credit || item.imageCredit || "",
          content: item.content || "",
        });
      });

      render();
      hydrateFilters();
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchDrafts() {
    try {
      const isAdmin = window.currentUser && window.currentUser.role === "admin";
      const query = isAdmin ? "?status=draft" : "?status=draft&mine=true";
      const res = await fetch(`/api/publications${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Erro ao carregar rascunhos");
      const items = asItems(await res.json());
      drafts.splice(0, drafts.length);
      items.forEach((item) => {
        drafts.push({
          id: item.id,
          slug: item.slug || null,
          title: item.title,
          author:
            (item.author && (item.author.name || item.author.nome)) ||
            item.author_name ||
            item.author ||
            "",
          authorId: (item.author && item.author.id) || item.author_id || null,
          category: item.category,
          dateISO: item.date,
          status: normalizeStatus(item.status),
          views: item.views,
          cover: item.image || "",
          description: item.description || "",
          imageCredit: item.image_credit || item.imageCredit || "",
          content: item.content || "",
        });
      });
      renderDrafts();
      hydrateDraftFilters();
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchExcluded() {
    try {
      const isAdmin = window.currentUser && window.currentUser.role === "admin";
      const query = isAdmin ? "?status=excluded" : "?status=excluded&mine=true";
      const res = await fetch(`/api/publications${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Erro ao carregar excluídos");
      const items = asItems(await res.json());
      excluded.splice(0, excluded.length);
      items.forEach((item) => {
        excluded.push({
          id: item.id,
          slug: item.slug || null,
          title: item.title,
          author:
            (item.author && (item.author.name || item.author.nome)) ||
            item.author_name ||
            item.author ||
            "",
          category: item.category,
          dateISO: item.date,
          status: normalizeStatus(item.status),
          views: item.views,
          cover: item.image || "",
          description: item.description || "",
          imageCredit: item.image_credit || item.imageCredit || "",
          content: item.content || "",
          motivo_exclusao: item.motivo_exclusao ?? item.reason ?? "",
        });
      });
      render();
      hydrateFilters();
    } catch (err) {
      console.error(err);
    }
  }

  const fmtDate = (iso) => {
    if (typeof window.formatDatePtBrShort === "function") {
      return window.formatDatePtBrShort(iso);
    }
    if (iso instanceof Date && !Number.isNaN(iso.getTime())) {
      return [
        String(iso.getUTCDate()).padStart(2, "0"),
        String(iso.getUTCMonth() + 1).padStart(2, "0"),
        String(iso.getUTCFullYear()),
      ].join("/");
    }
    if (typeof iso === "number") {
      const byTimestamp = new Date(iso);
      if (!Number.isNaN(byTimestamp.getTime())) {
        return [
          String(byTimestamp.getUTCDate()).padStart(2, "0"),
          String(byTimestamp.getUTCMonth() + 1).padStart(2, "0"),
          String(byTimestamp.getUTCFullYear()),
        ].join("/");
      }
      return "";
    }
    if (typeof iso !== "string") return "";
    const value = iso.trim();
    if (!value) return "";
    let date;
    let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) {
      const [, y, m, d] = match;
      date = new Date(Date.UTC(+y, +m - 1, +d));
    } else {
      match = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
        value
      );
      if (match) {
        const [, y, m, d, H, M, S = "0"] = match;
        date = new Date(Date.UTC(+y, +m - 1, +d, +H, +M, +S));
      } else {
        date = new Date(value);
      }
    }
    if (!date || Number.isNaN(date.getTime())) return value;
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const yy = date.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  };

  const statusBadge = (s) =>
    s === "published"
      ? `<span class="btn-public">Publicado</span>`
      : s === "review"
      ? `<span class="btn-sm btn-rvw btn-second">Análise</span>`
      : `<span class="btn-exc">Excluído</span>`;

  const categoryChip = (c) => `<span class="btn-sm btn-second">${c}</span>`;

  const buildRow = (p) => `
    <tr data-id="${p.id}">
      <td>
        <div class="cell-title"><div><div class="btn-sm">${
          p.title
        }</div></div></div>
      </td>
      <td class="btn-sm btn-second">${p.author}</td>
      <td class="btn-sm btn-second">${categoryChip(p.category)}</td>
      <td class="btn-sm btn-second">${fmtDate(p.dateISO)}</td>
      <td class="btn-sm btn-second js-status">${statusBadge(p.status)}</td>
      <td class="td-right btn-second">${(p.views ?? 0).toLocaleString(
        "pt-BR"
      )}</td>
      <td class="td-right btn-second">${(p.uniqueViews ?? 0).toLocaleString(
        "pt-BR"
      )}</td>
      <td class="is-right">
        <div class="actions">${
          p.status === "excluded"
            ? window.currentUser?.role === "admin"
              ? `<button class="action-btn js-view"  title="Visualizar" aria-label="Visualizar">👁️</button>
                 <button class="action-btn is-danger js-restore" title="Restaurar" aria-label="Restaurar">↩️</button>
                 <button class="action-btn is-danger js-delete-permanent" title="Excluir permanentemente" aria-label="Excluir permanentemente">🗑️</button>`
              : `<button class="action-btn js-view"  title="Visualizar" aria-label="Visualizar">👁️</button>`
            : p.status === "review" && window.currentUser?.role !== "admin"
            ? `<button class="action-btn js-view"  title="Visualizar" aria-label="Visualizar">👁️</button>`
            : `<button class="action-btn js-view"  title="Visualizar" aria-label="Visualizar">👁️</button>
                 <button class="action-btn js-edit"  title="Editar"    aria-label="Editar">✏️</button>
                 <button class="action-btn is-danger js-delete" title="Excluir"    aria-label="Excluir">🗑️</button>`
        }</div>
      </td>
    </tr>
  `;

  const buildDraftRow = (d) => `
    <tr data-id="${d.id}">
      <td>
        <div class="cell-title"><div><div class="btn-sm">${
          d.title
        }</div></div></div>
      </td>
      <td class="btn-sm btn-second">${d.author}</td>
      <td class="btn-sm btn-second">${categoryChip(d.category)}</td>
      <td class="btn-sm btn-second">${fmtDate(d.dateISO)}</td>
      <td class="is-right">
        <div class="actions">
          <button class="action-btn js-edit-draft" title="Editar" aria-label="Editar">✏️</button>
          <button class="action-btn is-danger js-delete-draft" title="Excluir" aria-label="Excluir">🗑️</button>
        </div>
      </td>
    </tr>
  `;

  function applyFilters(rows) {
    const q = state.query.trim().toLowerCase();
    let out = rows.filter((r) => {
      const matchQ =
        !q ||
        r.title.toLowerCase().includes(q) ||
        (r.subtitle || "").toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q);
      const matchA = state.author === "__all__" || r.author === state.author;
      const matchC =
        state.category === "__all__" || r.category === state.category;
      return matchQ && matchA && matchC;
    });
    switch (state.sort) {
      case "recent":
        out.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
        break;
      case "old":
        out.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
        break;
      case "views_desc":
        out.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case "views_asc":
        out.sort((a, b) => (a.views || 0) - (b.views || 0));
        break;
      case "title_asc":
        out.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "title_desc":
        out.sort((a, b) => b.title.localeCompare(a.title));
        break;
    }
    return out;
  }

  const paginate = (rows) =>
    els.pagination
      ? rows.slice(
          (state.page - 1) * state.pageSize,
          state.page * state.pageSize
        )
      : rows;

  function renderPagination(total) {
    if (!els.pagination) return;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    els.pagination.innerHTML = Array.from({ length: pages }, (_, i) => {
      const n = i + 1;
      const active = n === state.page ? " is-active" : "";
      return `<button class="publication__page-btn${active}" data-page="${n}">${n}</button>`;
    }).join("");
    els.pagination.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.page = Number(btn.dataset.page);
        render();
      });
    });
  }

  function render() {
    if (window.currentUser) {
      state.currentUser =
        window.currentUser.name || window.currentUser.nome || state.currentUser;
    }
    const allRows = data.concat(excluded);
    const filtered = applyFilters(allRows);
    const rows = paginate(filtered);
    if (els.tbody) els.tbody.innerHTML = rows.map(buildRow).join("");

    if (els.tbody && !els.tbody.__highlightListenerAttached) {
      els.tbody.addEventListener("click", handleRowHighlightClick);
      els.tbody.__highlightListenerAttached = true;
    }

    if (els.kpiTotal) els.kpiTotal.textContent = String(filtered.length);
    if (els.kpiMine)
      els.kpiMine.textContent = String(
        filtered.filter((p) => p.author === state.currentUser).length
      );
    if (els.kpiViews) {
      const isAdmin = window.currentUser && window.currentUser.role === "admin";
      const countDeleted = excluded.filter((p) =>
        isAdmin ? true : p.author === state.currentUser
      ).length;
      els.kpiViews.textContent = String(countDeleted);
    }
    const now = new Date();
    if (els.kpiMonth)
      els.kpiMonth.textContent = String(
        filtered.filter((p) => {
          const d = new Date(p.dateISO);
          return (
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        }).length
      );
    renderPagination(filtered.length);
  }

  function hydrateFilters() {
    const authors = [
      ...new Set(data.concat(excluded).map((d) => d.author)),
    ].sort();
    const cats = [
      ...new Set(data.concat(excluded).map((d) => d.category)),
    ].sort();
    if (els.author)
      els.author.innerHTML =
        `<option value="__all__">Todos os autores</option>` +
        authors.map((a) => `<option value="${a}">${a}</option>`).join("");
    if (els.category)
      els.category.innerHTML =
        `<option value="__all__">Todas as categorias</option>` +
        cats.map((c) => `<option value="${c}">${c}</option>`).join("");
  }

  function openModal({
    title = "",
    bodyHTML = "",
    confirmText = "OK",
    cancelText = "Cancelar",
    onConfirm,
  }) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;";
    const modal = document.createElement("div");
    modal.style.cssText =
      "background:var(--color-card,#14161a);color:var(--color-text-primary);border:1px solid var(--color-stroke);border-radius:12px;max-width:480px;width:92%;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.4);";
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">
        <strong class="btn-sm" style="font-size:1rem;">${title}</strong>
        <button class="btn-sm" type="button" aria-label="Fechar" style="background:transparent;border:0;color:inherit;font-size:18px;cursor:pointer;">×</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button class="btn-sm" type="button" data-role="cancel" style="height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--color-stroke);background:var(--color-card);color:inherit;">${cancelText}</button>
        <button class="btn-sm" type="button" data-role="ok" style="height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--color-primary01);background:var(--color-card);color:inherit;">${confirmText}</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() {
      document.body.removeChild(overlay);
    }
    modal.querySelector("button[aria-label='Fechar']").onclick = close;
    modal.querySelector("[data-role='cancel']").onclick = close;
    modal.querySelector("[data-role='ok']").onclick = () => {
      if (onConfirm) onConfirm({ modal, close });
      else close();
    };
    return { overlay, modal, close };
  }

  (function setupNotifications() {
    const bellBtn = document.querySelector("#btn-notification");
    if (!bellBtn) return;

    bellBtn.classList.add("btnNotification");
    let dropdown;

    const notifState = {
      list: [],
      unreadCount: 0,
      reviewCount: 0,
      polling: null,
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/`/g, "&#96;");
    }

    function isAdmin() {
      return !!(window.currentUser && window.currentUser.role === "admin");
    }

    function filterForCurrentUser(memList) {
      const uid = window.currentUser?.id;
      const admin = isAdmin();
      return (memList || []).filter((n) => {
        if (n.toUserId != null) {
          return String(n.toUserId) === String(uid);
        }
        if (n.toRole) {
          return n.toRole === "admin" && admin;
        }
        return false;
      });
    }

    async function apiFetchNotifications() {
      try {
        const res = await fetch("/api/notifications?unread=1", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("notifs fail");
        const items = await res.json();
        const arr = Array.isArray(items) ? items : items?.data || [];
        return filterForCurrentUser(arr);
      } catch {
        const mem = JSON.parse(sessionStorage.getItem("__notif_mem__") || "[]");
        return filterForCurrentUser(mem).filter((n) => !n.read);
      }
    }

    async function apiMarkAsRead(id) {
      try {
        const res = await fetch(`/api/notifications/${id}/read`, {
          method: "PUT",
          credentials: "include",
        });
        if (!res.ok) throw new Error("mark fail");
      } catch {
        const mem = JSON.parse(sessionStorage.getItem("__notif_mem__") || "[]");
        const idx = mem.findIndex((n) => String(n.id) === String(id));
        if (idx >= 0) mem[idx].read = true;
        sessionStorage.setItem("__notif_mem__", JSON.stringify(mem));
      }
    }

    async function apiCreateNotification(payload) {
      try {
        const res = await fetch("/api/notifications", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("create notif fail");
        return await res.json().catch(() => null);
      } catch {
        const mem = JSON.parse(sessionStorage.getItem("__notif_mem__") || "[]");
        mem.unshift({
          id: "mem_" + Date.now(),
          title: payload.title,
          message: payload.message,
          url: payload.url || "",
          toUserId: payload.toUserId ?? null,
          toRole: payload.toRole ?? null,
          meta: payload.meta || null,
          read: false,
          createdAt: new Date().toISOString(),
          __mem__: true,
        });
        sessionStorage.setItem("__notif_mem__", JSON.stringify(mem));
        return null;
      }
    }

    async function fetchReviewCountAdmin() {
      try {
        const a = await fetch("/api/publications?status=review", {
          credentials: "include",
          cache: "no-store",
        });
        const b = await fetch("/api/publications?status=analysis", {
          credentials: "include",
          cache: "no-store",
        });
        const c = await fetch("/api/publications?status=analise", {
          credentials: "include",
          cache: "no-store",
        });
        let n = 0;
        if (a.ok) n += asItems(await a.json()).length;
        if (b.ok) n += asItems(await b.json()).length;
        if (c.ok) n += asItems(await c.json()).length;
        return n;
      } catch {
        return 0;
      }
    }

    function renderBell() {
      let badge = bellBtn.querySelector(".notif-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "notif-badge";
        badge.style.cssText = `
          position:absolute; top:-4px; right:-4px; min-width:18px; height:18px;
          padding:0 5px; display:flex; align-items:center; justify-content:center;
          background:#e53935; color:#fff; border-radius:999px; font-size:11px;
          line-height:18px; font-weight:700; pointer-events:none;
        `;
        bellBtn.style.position = "relative";
        bellBtn.appendChild(badge);
      }
      const count = isAdmin()
        ? notifState.reviewCount || 0
        : notifState.unreadCount || 0;
      badge.textContent = String(count);
      if (count > 0) bellBtn.classList.add("animate");
      else bellBtn.classList.remove("animate");
    }

    function buildNotificationMarkup(n) {
      const date = n.createdAt
        ? new Date(n.createdAt).toLocaleString("pt-BR")
        : "";
      const safeTitle = escapeHtml(n.title || "Notificação");
      const safeMessage = escapeHtml(n.message || "");
      const safeDate = escapeHtml(date);
      if (n.meta && (n.meta.type === "draft" || n.meta.variant === "draft")) {
        const draftId =
          n.meta.draftId ||
          n.meta.pubId ||
          n.meta.publicationId ||
          n.meta.id ||
          "";
        return (
          `<div class="notif-item is-draft" data-kind="draft" data-id="${escapeAttr(
            n.id
          )}" data-url="${escapeAttr(n.url || "")}" data-draft-id="${escapeAttr(
            draftId
          )}"` +
          ` style="padding:12px 12px 16px;background:transparent;">` +
          `<div style="display:flex;gap:12px;align-items:flex-start;">` +
          `<span aria-hidden="true" style="display:inline-flex;width:36px;height:36px;border-radius:12px;background:color-mix(in srgb, var(--color-primary01) 18%, transparent);color:var(--color-primary01);align-items:center;justify-content:center;">` +
          `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">` +
          `<path d="M12.532 4.218 15.782 7.468 6.75 16.5H3.5V13.25L12.532 4.218Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<path d="M11.219 5.531 14.469 8.781" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
          `</svg>` +
          `</span>` +
          `<div style="flex:1;">` +
          `<div class="btn-sm" style="font-weight:700;margin-bottom:4px;">${safeTitle}</div>` +
          `<div class="btn-sm btn-second" style="opacity:.9;">${safeMessage}</div>` +
          `<div class="btn-sm" style="opacity:.55;margin-top:6px;">${safeDate}</div>` +
          `</div>` +
          `</div>` +
          `<div style="display:flex;justify-content:flex-end;margin-top:12px;">` +
          `<button type="button" class="btn-sm notif-draft-view" data-action="view" style="height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--color-primary01);background:var(--color-card);color:var(--color-text-primary);cursor:pointer;">Ver</button>` +
          `</div>` +
          `</div>` +
          `<hr style="border:none;border-top:1px solid var(--color-stroke,#2b2f37);margin:0;">`
        );
      }
      return (
        `<button class="notif-item" data-kind="default" data-id="${escapeAttr(
          n.id
        )}" data-url="${escapeAttr(
          n.url || ""
        )}" style="display:block;width:100%;text-align:left;padding:12px;border:0;background:transparent;cursor:pointer;">` +
        `<div class="btn-sm" style="font-weight:700;margin-bottom:4px;">${safeTitle}</div>` +
        `<div class="btn-sm btn-second" style="opacity:.9;">${safeMessage}</div>` +
        `<div class="btn-sm" style="opacity:.55;margin-top:6px;">${safeDate}</div>` +
        `</button>` +
        `<hr style="border:none;border-top:1px solid var(--color-stroke,#2b2f37);margin:0;">`
      );
    }

    function renderDropdown() {
      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.className = "notif-dropdown";
        dropdown.style.cssText =
          "position:absolute; right:0; top:calc(100% + 8px); z-index:9999;" +
          "\n          width:340px; max-height:60vh; overflow:auto;" +
          "\n          border:1px solid var(--color-stroke,#2b2f37);" +
          "\n          background:var(--color-card,#14161a); color:var(--color-text-primary,#fff);" +
          "\n          border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.35);";
        const wrap = document.createElement("div");
        wrap.style.position = "relative";
        bellBtn.parentNode.insertBefore(wrap, bellBtn);
        wrap.appendChild(bellBtn);
        wrap.appendChild(dropdown);
      }

      const parts = [];
      if (isAdmin()) {
        parts.push(
          '<div style="padding:12px;">' +
            '<div class="btn-sm" style="font-weight:700;margin-bottom:4px;">Publicações em análise</div>' +
            '<div class="btn-sm btn-second" style="opacity:.9;">Você tem <strong>' +
            notifState.reviewCount +
            "</strong> publicação(ões) para autorizar.</div>" +
            '<div style="margin-top:8px;">' +
              '<button id="notif-open-review" class="btn-sm" style="height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--color-stroke);background:var(--color-card);color:inherit;cursor:pointer;">Abrir lista</button>' +
            "</div>" +
          "</div>" +
          '<hr style="border:none;border-top:1px solid var(--color-stroke,#2b2f37);margin:0;">'
        );
      }

      if (notifState.list.length === 0) {
        parts.push(
          '<div class="btn-sm" style="padding:12px;opacity:.8;">Sem notificações.</div>'
        );
      } else {
        parts.push(notifState.list.map(buildNotificationMarkup).join(""));
      }

      dropdown.innerHTML = parts.join("");

      const openReviewBtn = dropdown.querySelector("#notif-open-review");
      if (openReviewBtn) {
        openReviewBtn.addEventListener("click", () => {
          try {
            const pubBtn = document.querySelector(
              "button[data-section='publicacoes']"
            );
            pubBtn?.click();
          } catch (_) {}
        });
      }

      dropdown.querySelectorAll(".notif-item").forEach((item) => {
        const id = item.getAttribute("data-id");
        if (!id) return;
        const kind = item.getAttribute("data-kind") || "default";
        const url = item.getAttribute("data-url") || "";
        if (kind === "draft") {
          const draftId = item.getAttribute("data-draft-id") || "";
          const viewBtn = item.querySelector(".notif-draft-view");
          const handleDraft = async () => {
            await apiMarkAsRead(id);
            notifState.list = notifState.list.filter(
              (x) => String(x.id) !== String(id)
            );
            notifState.unreadCount = notifState.list.length;
            renderBell();
            renderDropdown();
            openDraftSection(draftId);
          };
          if (viewBtn) {
            viewBtn.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              handleDraft();
            });
          }
          item.addEventListener("click", (ev) => {
            if (ev.target && ev.target.closest(".notif-draft-view")) return;
            handleDraft();
          });
        } else {
          item.addEventListener("click", async () => {
            await apiMarkAsRead(id);
            notifState.list = notifState.list.filter(
              (x) => String(x.id) !== String(id)
            );
            notifState.unreadCount = notifState.list.length;
            renderBell();
            renderDropdown();
            if (url) {
              window.location.href = url;
            } else {
              try {
                const pubBtn = document.querySelector(
                  "button[data-section='publicacoes']"
                );
                pubBtn?.click();
              } catch (_) {}
            }
          });
        }
      });
    }

    function openDraftSection(draftId) {
      try {
        const draftTabBtn = document.querySelector(
          "button[data-section='rascunhos']"
        );
        if (draftTabBtn) draftTabBtn.click();
        else {
          const viewDraft = document.querySelector("#view-rascunhos");
          const viewPub = document.querySelector("#view-publicacoes");
          if (viewDraft && viewPub) {
            viewPub.style.display = "none";
            viewDraft.style.display = "";
          }
        }
      } catch (_) {}
      focusDraftRow(draftId);
    }
    async function refreshNotifications() {
      if (!window.currentUser) return;
      try {
        const items = await apiFetchNotifications();
        notifState.list = (items || []).map((n) => ({
          id: n.id,
          title: n.title || "",
          message: n.message || "",
          url: n.url || "",
          meta: n.meta || n.metadata || null,
          read: !!n.read,
          createdAt:
            n.createdAt || n.created_at || n.date || new Date().toISOString(),
        }));
        notifState.unreadCount = notifState.list.length;
      } catch {
        notifState.list = [];
        notifState.unreadCount = 0;
      }
      if (isAdmin()) {
        notifState.reviewCount = await fetchReviewCountAdmin();
      } else {
        notifState.reviewCount = 0;
      }
      renderBell();
      if (dropdown && !dropdown.hidden) renderDropdown();
    }

    let isOpen = false;
    bellBtn.addEventListener("click", async () => {
      isOpen = !isOpen;
      if (!isOpen) {
        if (dropdown) dropdown.hidden = true;
        return;
      }
      await refreshNotifications();
      renderDropdown();
      dropdown.hidden = false;
    });

    notifState.polling = setInterval(refreshNotifications, 12000);

    (function waitUserForNotif() {
      if (window.currentUser) refreshNotifications();
      else setTimeout(waitUserForNotif, 200);
    })();

    window.__notify = {
      async toAdminsNewReview(/* pub */) {
        await refreshNotifications();
      },
      async toAuthorApproved(pub, authorId) {
        if (!authorId) return;
        const url = makeArticleUrl(pub);
        await apiCreateNotification({
          toUserId: authorId,
          title: "Sua publicação foi autorizada",
          message: `“${pub.title}” foi publicada.`,
          url,
          meta: { pubId: pub.id },
        });
        await refreshNotifications();
      },
      async toCurrentUserSubmitted(pub) {
        await apiCreateNotification({
          toUserId: (window.currentUser && window.currentUser.id) || null,
          title: "Sua publicação foi enviada para análise",
          message: `“${pub.title}” aguarda autorização do administrador.`,
          url: "",
          meta: { pubId: pub.id },
        });
        await refreshNotifications();
      },
      async toAuthorDraftSaved(pub) {
        if (!pub) return;
        const authorId = window.currentUser?.id;
        if (!authorId) return;
        const title = pub.title || "Publicação";
        await apiCreateNotification({
          toUserId: authorId,
          title: "Publicação movida para rascunho",
          message:
            "Sua publicação '" +
            title +
            "' foi salva automaticamente como rascunho.",
          url: "",
          meta: { type: "draft", draftId: pub.id || null, pubId: pub.id || null },
        });
        await refreshNotifications();
      },
      async refresh() {
        await refreshNotifications();
      },
    };
  })();

  function handleRowHighlightClick(event) {
    const tr = event.target.closest("tr");
    if (!tr) return;
    if (event.target.closest(".actions")) return;

    const user = window.currentUser;
    if (!user) return;

    const pubId = Number(tr.dataset.id);
    if (!pubId) return;

    const item =
      data.find((p) => p.id === pubId) || excluded.find((p) => p.id === pubId);
    if (!item) return;

    if (item.status === "review" && user.role === "admin") {
      openModal({
        title: "Autorizar publicação",
        bodyHTML: `<p class="btn-sm btn-second">Deseja autorizar a publicação <strong>${item.title}</strong>?</p>`,
        confirmText: "Autorizar",
        cancelText: "Cancelar",
        onConfirm: async ({ close }) => {
          showLoadingModal("Autorizando publicação...");
          try {
            const res = await fetch(`/api/publications/${pubId}`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "published" }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || "Erro ao autorizar");
            }
            try {
              const publishedItem =
                data.find((p) => p.id === pubId) ||
                excluded.find((p) => p.id === pubId) ||
                {};
              if (window.__notify?.toAuthorApproved) {
                await window.__notify.toAuthorApproved(
                  {
                    id: pubId,
                    title: publishedItem.title || "Publicação",
                    slug: publishedItem.slug || null,
                  },
                  publishedItem.authorId || null
                );
              }
            } catch (e) {
              console.error(e);
            }

            await fetchPublished();
            await fetchDrafts();
    await fetchPublished();
    const editingDraftFlag =
      typeof isEditingDraft !== "undefined" ? Boolean(isEditingDraft) : false;
    if (!editingDraftFlag && window.__notify?.toAuthorDraftSaved) {
      await window.__notify.toAuthorDraftSaved(item);
    } else if (window.__notify?.refresh) {
      await window.__notify.refresh();
    }

    showStatusModal("success", "Publicação autorizada.");
          } catch (e) {
            console.error(e);
            showStatusModal(
              "error",
              e?.message || "Erro ao autorizar publicação.",
              ERROR_DURATION
            );
          } finally {
            close();
          }
        },
      });
      return;
    }

    if (item.status === "excluded") return;

    if (!(user && Number(user.id) === 1)) return;

    openHighlightModal(pubId);
  }

  async function openHighlightModal(publicationId) {
    let currentCard = null;

    try {
      const response = await fetch("/api/publications/highlights/all", {
        credentials: "include",
        cache: "no-store",
      });
      if (response.ok) {
        const highlightMap = await response.json();
        Object.keys(highlightMap || {}).forEach((cardKey) => {
          const entry = highlightMap[cardKey];
          if (entry && Number(entry.id) === Number(publicationId)) {
            currentCard = Number(cardKey);
          }
        });
      }
    } catch (error) {
      console.error("Erro ao carregar destaques", error);
    }

    const bodyHTML = `
      <p class="btn-sm btn-second">Escolha em qual card a publicação será destacada:</p>
      <div style="display:flex;flex-direction:column;gap:var(--space-12);margin-top:var(--space-20);">
        <button class="btn-dest" style="padding:8px var(--space-12);cursor:pointer;border:1px solid var(--color-stroke);border-radius:var(--bdr-primary);" type="button" data-card="1">Card Principal - Esquerda</button>
        <button class="btn-dest" style="padding:8px var(--space-12);cursor:pointer;border:1px solid var(--color-stroke);border-radius:var(--bdr-primary);" type="button" data-card="2">Card Direita - Topo</button>
        <button class="btn-dest" style="padding:8px var(--space-12);cursor:pointer;border:1px solid var(--color-stroke);border-radius:var(--bdr-primary);" type="button" data-card="3">Card Direita - Baixo</button>
      </div>
    `;
    const modalCtrl = openModal({
      title: "Definir destaque",
      bodyHTML,
      confirmText: "Confirmar",
      cancelText: "Fechar",
      onConfirm: () => modalCtrl.close(),
    });

    const buttons = modalCtrl.modal.querySelectorAll("[data-card]");
    buttons.forEach((btn) => {
      const cardNum = Number(btn.getAttribute("data-card"));
      if (cardNum === Number(currentCard)) btn.classList.add("is-current");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        showLoadingModal("Definindo destaque...", window.TLU_LOADING_MS);
        try {
          const res = await fetch(`/api/publications/highlights/${cardNum}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ publicationId }),
          });
          if (!res.ok) throw new Error("Erro ao definir destaque");
          showStatusModal("success", "Destaque definido com sucesso!");
        } catch (error) {
          showStatusModal(
            "error",
            "Falha ao definir destaque." +
              (error.message ? ` ${error.message}` : ""),
            ERROR_DURATION
          );
        } finally {
          modalCtrl.close();
        }
      });
    });

    if (currentCard) {
      const confirmBtn = modalCtrl.modal.querySelector("[data-role='ok']");
      const footer = confirmBtn ? confirmBtn.parentElement : null;
      if (footer && confirmBtn) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn-sm";
        removeBtn.dataset.role = "remove";
        removeBtn.textContent = "Retirar destaque";
        removeBtn.style.cssText =
          "height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--color-primary01);background:var(--color-card);color:inherit;cursor:pointer;";
        footer.insertBefore(removeBtn, confirmBtn);
        removeBtn.addEventListener("click", async () => {
          removeBtn.disabled = true;
          showLoadingModal("Removendo destaque...", window.TLU_LOADING_MS);
          try {
            const res = await fetch(
              `/api/publications/highlights/${currentCard}`,
              { method: "DELETE", credentials: "include" }
            );
            if (!res.ok) throw new Error("Erro ao remover destaque");
            showStatusModal("success", "Destaque removido com sucesso!");
          } catch (error) {
            showStatusModal(
              "error",
              "Falha ao remover destaque." +
                (error.message ? ` ${error.message}` : ""),
              ERROR_DURATION
            );
          } finally {
            modalCtrl.close();
          }
        });
      }
    }
  }

  if (els.search)
    els.search.addEventListener("input", (e) => {
      state.query = e.target.value;
      state.page = 1;
      render();
    });
  if (els.author)
    els.author.addEventListener("change", (e) => {
      state.author = e.target.value;
      state.page = 1;
      render();
    });
  if (els.category)
    els.category.addEventListener("change", (e) => {
      state.category = e.target.value;
      state.page = 1;
      render();
    });
  if (els.sort)
    els.sort.addEventListener("change", (e) => {
      state.sort = e.target.value;
      state.page = 1;
      render();
    });

  if (els.newBtn)
    els.newBtn.addEventListener("click", () => {
      resetEditorForm();
      editMode = null;
      editId = null;
      toggleSections(true);
    });

  if (btnBack)
    btnBack.addEventListener("click", () => {
      autoSaveDraft();
      toggleSections(false);
      renderDrafts();
      hydrateDraftFilters();
    });

  if (els.tbody)
    els.tbody.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;

      const tr = ev.target.closest("tr");
      const id = tr ? Number(tr.dataset.id) : null;
      const item =
        data.find((p) => p.id === id) || excluded.find((p) => p.id === id);
      if (!item) return;

      if (btn.classList.contains("js-view")) {
        try {
          if (item.status === "excluded" || item.status === "review") {
            resetEditorForm();
            fillEditorForm(item, "publication");
            showPreviewSection();
          } else {
            window.location.href = makeArticleUrl(item);
          }
        } catch (_) {}
      } else if (btn.classList.contains("js-edit")) {
        resetEditorForm();
        fillEditorForm(item, "publication");
        toggleSections(true);
      } else if (btn.classList.contains("js-restore")) {
        if (!(window.currentUser && window.currentUser.role === "admin"))
          return;
        openModal({
          title: "Restaurar publicação",
          bodyHTML: `
            <p class="btn-sm" style="margin:0 0 8px;">Deseja restaurar e republicar a publicação?</p>
            <div style="border:1px solid var(--color-stroke);padding:10px;border-radius:10px;">
              <div class="btn-sm" style="font-weight:600;margin-bottom:6px;">${item.title}</div>
              <div class="btn-sm" style="opacity:.8;">Autor: ${item.author} | Categoria: ${item.category}</div>
            </div>`,
          confirmText: "Restaurar e publicar",
          cancelText: "Cancelar",
          onConfirm: async ({ close }) => {
            showLoadingModal("Restaurando publicação...");
            try {
              const res = await fetch(`/api/publications/${item.id}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "published" }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao restaurar publicação");
              }
              await fetchExcluded();
              await fetchPublished();
              if (window.__notify?.refresh) await window.__notify.refresh();
              showStatusModal("success", "Publicação restaurada.");
            } catch (e) {
              console.error(e);
              showStatusModal(
                "error",
                e?.message || "Erro ao restaurar publicação.",
                ERROR_DURATION
              );
            } finally {
              close();
            }
          },
        });
      } else if (btn.classList.contains("js-delete-permanent")) {
        if (!(window.currentUser && window.currentUser.role === "admin"))
          return;
        openModal({
          title: "Excluir permanentemente",
          bodyHTML: `
            <p class="btn-sm" style="margin:0 0 8px;">Deseja excluir permanentemente esta publicação? Esta ação não pode ser desfeita.</p>
            <div style="border:1px solid var(--color-stroke);padding:10px;border-radius:10px;">
              <div class="btn-sm" style="font-weight:600;margin-bottom:6px;">${
                item.title
              }</div>
              <div class="btn-sm" style="opacity:.8;">Autor: ${
                item.author
              } | Categoria: ${item.category}</div>
              ${
                item.motivo_exclusao
                  ? `<div class="btn-sm" style="margin-top:8px;opacity:.95;"><strong>Motivo da exclusão:</strong> ${item.motivo_exclusao}</div>`
                  : ``
              }
            </div>`,
          confirmText: "Excluir permanentemente",
          cancelText: "Cancelar",
          onConfirm: async ({ close }) => {
            showLoadingModal("Excluindo permanentemente...");
            try {
              const res = await fetch(
                `/api/publications/${item.id}?permanent=true`,
                { method: "DELETE", credentials: "include" }
              );
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Erro ao excluir permanentemente");
              }
              await fetchExcluded();
              await fetchPublished();
              if (window.__notify?.refresh) await window.__notify.refresh();
              showStatusModal("success", "Publicação apagada permanentemente.");
            } catch (e) {
              console.error(e);
              showStatusModal(
                "error",
                e?.message || "Erro ao excluir permanentemente.",
                ERROR_DURATION
              );
            } finally {
              close();
            }
          },
        });
      } else if (btn.classList.contains("js-delete")) {
        openModal({
          title: "Confirmar exclusão",
          bodyHTML: `
            <p class="btn-sm" style="margin:0 0 8px;">Tem certeza que deseja excluir a publicação abaixo?</p>
            <div style="border:1px solid var(--color-stroke);padding:10px;border-radius:10px;">
              <div class="btn-sm" style="font-weight:600;margin-bottom:6px;">${item.title}</div>
              <div class="btn-sm" style="opacity:.8;">Autor: ${item.author} | Categoria: ${item.category}</div>
            </div>`,
          confirmText: "Excluir",
          cancelText: "Cancelar",
          onConfirm: ({ close }) => {
            close();
            openModal({
              title: "Motivo da exclusão",
              bodyHTML: `
                <label class="btn-sm" style="display:block;margin-bottom:8px;">Descreva o motivo (obrigatório para publicações)</label>
                <textarea id="modal-delete-reason" class="modal-input" rows="4" style="width:100%;border:1px solid var(--color-stroke);border-radius:10px;padding:10px;" placeholder="Ex.: conteúdo duplicado, violação de diretrizes, etc."></textarea>
              `,
              confirmText: "Confirmar",
              cancelText: "Cancelar",
              onConfirm: async ({ close: closeReason }) => {
                showLoadingModal("Apagando publicação...");
                try {
                  const reasonEl = document.getElementById(
                    "modal-delete-reason"
                  );
                  const reason = reasonEl ? reasonEl.value.trim() : "";
                  const res = await fetch(`/api/publications/${item.id}`, {
                    method: "DELETE",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || "Erro ao excluir publicação");
                  }
                  await fetchPublished();
                  if (window.__notify?.refresh) await window.__notify.refresh();
                  showStatusModal("success", "Publicação apagada.");
                } catch (e) {
                  console.error(e);
                  showStatusModal(
                    "error",
                    e?.message || "Erro ao excluir publicação.",
                    ERROR_DURATION
                  );
                } finally {
                  closeReason();
                }
              },
            });
          },
        });
      }
    });

  const editor = $("#pub-editor", scope);
  const srcArea = $("#pub-editor-source", scope);

  const fmtBlock = $("#fmt-block", scope);
  const btnBold = $("#cmd-bold", scope);
  const btnItalic = $("#cmd-italic", scope);
  const btnUnder = $("#cmd-underline", scope);
  const btnStrike = $("#cmd-strike", scope);
  const btnOrdered = $("#cmd-ordered", scope);
  const btnUnordered = $("#cmd-unordered", scope);
  const styleToggleButtons = [
    { button: btnBold, command: "bold" },
    { button: btnItalic, command: "italic" },
    { button: btnUnder, command: "underline" },
    { button: btnStrike, command: "strikeThrough" },
    { button: btnOrdered, command: "insertOrderedList" },
    { button: btnUnordered, command: "insertUnorderedList" },
  ];

  const btnLeft = $("#cmd-align-left", scope);
  const btnCenter = $("#cmd-align-center", scope);
  const btnRight = $("#cmd-align-right", scope);
  const btnJust = $("#cmd-align-justify", scope);

  const btnLink = $("#cmd-link", scope);
  const btnImage = $("#cmd-image", scope);
  const btnAudio = $("#cmd-audio", scope);
  const btnVideo = $("#cmd-video", scope);

  const btnOutdent = $("#cmd-outdent", scope);
  const btnIndent = $("#cmd-indent", scope);

  const wordCount = $("#word-count", scope);

  const fldDate = $("#pub-description")
    ? $("#pub-date", scope)
    : $("#pub-date", scope);
  const fldDesc = $("#pub-description", scope);
  const fldImageCredits = $("#pub-image-credits", scope);
  const descCount = $("#desc-count", scope);

  let editMode = null;
  let editId = null;

  let currentBlockTag = (fmtBlock && fmtBlock.value) || "p";
  let forceParagraphAfterHeading = false;
  let currentMediaBox = null;
  let draggingBox = null;
  function getCurrentBlockNode() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return editor;
    let node = sel.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (
      node &&
      node !== editor &&
      !(
        node instanceof HTMLElement &&
        /^(P|H1|H2|H3|H4|LI|DIV)$/.test(node.tagName)
      )
    ) {
      node = node.parentNode;
    }
    return node instanceof HTMLElement ? node : editor;
  }
  function cleanupInlineColorInParagraph(pEl) {
    if (!pEl || !(pEl instanceof HTMLElement) || pEl.tagName !== "P") return;
    pEl.style.removeProperty("color");
    pEl.querySelectorAll("[style*='color']").forEach((el) => {
      el.style.removeProperty("color");
      if (!el.getAttribute("style")) el.removeAttribute("style");
    });
    pEl.querySelectorAll("font[color]").forEach((font) => {
      while (font.firstChild)
        font.parentNode.insertBefore(font.firstChild, font);
      font.remove();
    });
  }
  function resetParagraphAppearance(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    const textAlign =
      (el.style && el.style.textAlign) || el.getAttribute("align") || "";
    if (el.hasAttribute("style")) {
      el.style.removeProperty("font-size");
      el.style.removeProperty("font-weight");
      el.style.removeProperty("line-height");
      el.style.removeProperty("letter-spacing");
    }
    el.removeAttribute("align");
    if (el.hasAttribute("style")) {
      const tempAlign = el.style.textAlign || "";
      el.removeAttribute("style");
      if (tempAlign) el.style.textAlign = tempAlign;
    }
    if (textAlign && (!el.style || !el.style.textAlign)) {
      el.style.textAlign = textAlign;
    }
    cleanupInlineColorInParagraph(el);
  }

  function forceParagraphBlockFromSelection() {
    focusEditor();
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("formatBlock", false, "P");
    const blk = getCurrentBlockNode();
    if (blk && blk.tagName === "P") {
      resetParagraphAppearance(blk);
      cleanupInlineColorInParagraph(blk);
    }
    currentBlockTag = "p";
    if (fmtBlock && fmtBlock.value !== "p") fmtBlock.value = "p";
    syncSource();
    refreshStyleButtons();
  }

  function isHeadingTag(tagName) {
    if (!tagName) return false;
    return /^(h1|h2|h3|h4)$/i.test(tagName);
  }

  if (fmtBlock) {
    fmtBlock.addEventListener("change", () => {
      clearMediaSelection();
      currentBlockTag = fmtBlock.value || "p";
      if (currentBlockTag === "p") {
        forceParagraphBlockFromSelection();
      } else {
        enforceCurrentBlock();
      }
      focusEditor();
    });
  }

  function initEditorDefaults() {
    if (fldDate) {
      const now = new Date();
      fldDate.value = `${String(now.getDate()).padStart(2, "0")}/${String(
        now.getMonth() + 1
      ).padStart(2, "0")}/${now.getFullYear()}`;
    }
    if (fldDesc && descCount)
      descCount.textContent = String(fldDesc.value.length);
    const authorInput = $("#pub-author", scope);
    if (authorInput && window.currentUser) {
      authorInput.value =
        window.currentUser.nome || window.currentUser.name || authorInput.value;
    }
  }

  function resetEditorForm() {
    const titleInput = $("#pub-title", scope);
    if (titleInput) titleInput.value = "";
    if (fldDesc) {
      fldDesc.value = "";
      if (descCount) descCount.textContent = "0";
    }
    if (fldImageCredits) {
      fldImageCredits.value = "";
    }
    const tagSelect = $("#pub-tags", scope);
    if (tagSelect) tagSelect.selectedIndex = 0;
    const featuredInput = $("#pub-featured", scope);
    if (featuredInput) featuredInput.value = "";
    selectedImageUrl = "";
    // Hide and clear the preview of the cover image when the form is reset
    if (imgFeaturedPreview) {
      imgFeaturedPreview.src = "";
      imgFeaturedPreview.style.display = "none";
    }
    if (editor) editor.innerHTML = "";
    if (srcArea) srcArea.value = "";
    initEditorDefaults();
    updateWordCount();
    editMode = null;
    editId = null;
    refreshStyleButtons();
  }

  function fillEditorForm(item, mode) {
    if (!item) return;
    editMode = mode;
    editId = item.id;
    const titleInput = $("#pub-title", scope);
    if (titleInput) titleInput.value = item.title || "";
    if (fldDesc) {
      fldDesc.value = item.description || "";
      if (descCount) descCount.textContent = String(fldDesc.value.length);
    }
    if (fldImageCredits) {
      fldImageCredits.value = item.imageCredit || "";
    }
    const tagSelect = $("#pub-tags", scope);
    if (tagSelect) {
      const opt = Array.from(tagSelect.options).find(
        (opt) => opt.value === item.category
      );
      if (opt) tagSelect.value = item.category;
      else tagSelect.selectedIndex = 0;
    }
    const authorInput = $("#pub-author", scope);
    if (authorInput) authorInput.value = item.author || authorInput.value;
    const dateInput = $("#pub-date", scope);
    if (dateInput && item.dateISO) {
      const d = new Date(item.dateISO);
      dateInput.value = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1
      ).padStart(2, "0")}/${d.getFullYear()}`;
    }
    selectedImageUrl = item.cover || "";
    // When editing an existing publication, show its cover in the preview
    if (imgFeaturedPreview) {
      if (selectedImageUrl) {
        imgFeaturedPreview.src = selectedImageUrl;
        imgFeaturedPreview.style.display = "";
      } else {
        imgFeaturedPreview.src = "";
        imgFeaturedPreview.style.display = "none";
      }
    }
    if (editor) editor.innerHTML = item.content || "";
    if (srcArea) srcArea.value = item.content || "";
    updateWordCount();
    updatePreview();
    refreshStyleButtons();
  }

  function getFormValues(existingId) {
    const title = $("#pub-title", scope)?.value.trim() || "";
    const author = $("#pub-author", scope)?.value.trim() || "";
    const dateStr = $("#pub-date", scope)?.value.trim() || "";
    const category = $("#pub-tags", scope)?.value || "";
    const description = fldDesc?.value || "";
    const imageCredit = fldImageCredits?.value?.trim() || "";
    syncSource();
    const contentHtml = srcArea?.value || "";
    let dateISO = new Date().toISOString().split("T")[0];
    if (dateStr) {
      const [dd, mm, yyyy] = dateStr.split("/");
      if (dd && mm && yyyy) {
        const d = new Date(`${yyyy}-${mm}-${dd}`);
        if (!isNaN(d.getTime())) dateISO = d.toISOString().split("T")[0];
      }
    }
    const id = existingId || "id" + Date.now();
    const slug = slugifyTitle(title); // <-- NOVO
    return {
      id,
      slug,
      title,
      subtitle: "",
      author,
      category,
      dateISO,
      description,
      imageCredit,
      content: contentHtml,
      cover: selectedImageUrl || "",
      views: 0,
    };
  }

  function selectionInsideEditor() {
    if (!editor) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const { anchorNode, focusNode } = sel;
    const anchorInside =
      anchorNode && (anchorNode === editor || editor.contains(anchorNode));
    const focusInside =
      focusNode && (focusNode === editor || editor.contains(focusNode));
    return anchorInside || focusInside;
  }

  function getSelectedLinkElement(selectionAlreadyInside) {
    if (!editor) return null;
    const inside =
      selectionAlreadyInside === true
        ? true
        : selectionAlreadyInside === false
        ? false
        : selectionInsideEditor();
    if (!inside) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const nodes = [
      sel.anchorNode,
      sel.focusNode,
      range.startContainer,
      range.endContainer,
    ];
    const anchors = nodes
      .map((node) => {
        if (!node) return null;
        const baseNode =
          node.nodeType === Node.ELEMENT_NODE
            ? node
            : node.parentElement || node.parentNode;
        if (!baseNode) return null;
        if (baseNode.tagName === "A") return baseNode;
        return baseNode.closest ? baseNode.closest("a") : null;
      })
      .filter(
        (link) =>
          link &&
          link.tagName === "A" &&
          (link === editor || editor.contains(link))
      );
    if (!anchors.length) return null;
    const primary = anchors[0];
    const sameAnchor = anchors.every((link) => link === primary);
    if (!sameAnchor) return null;
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const startInside =
      primary === startNode ||
      (primary.contains && primary.contains(startNode));
    const endInside =
      primary === endNode || (primary.contains && primary.contains(endNode));
    if (!startInside || !endInside) return null;
    return primary;
  }

  function refreshStyleButtons() {
    const inside = selectionInsideEditor();
    styleToggleButtons.forEach(({ button, command }) => {
      if (!button) return;
      if (!inside) {
        button.classList.remove("is-active");
        return;
      }
      let isActive = false;
      try {
        isActive = document.queryCommandState(command);
      } catch (err) {
        isActive = false;
      }
      button.classList.toggle("is-active", !!isActive);
    });
    if (btnLink) {
      const linkEl = getSelectedLinkElement(inside);
      btnLink.classList.toggle("is-active", !!(inside && linkEl));
    }
  }

  function focusEditor() {
    if (editor) editor.focus();
  }
  function applyExec(cmd, val = null) {
    focusEditor();
    document.execCommand("styleWithCSS", false, false);
    document.execCommand(cmd, false, val);
    syncSource();
    updateWordCount();
    refreshStyleButtons();
  }

  function sanitizeForOutput(htmlContainer) {
    const clone = htmlContainer.cloneNode(true);
    clone.querySelectorAll("[data-resize]").forEach((n) => n.remove());
    clone.querySelectorAll('[data-media-box="1"]').forEach((box) => {
      box.removeAttribute("data-media-box");
      box.removeAttribute("contenteditable");
      if (box.style) {
        const keepWidth = box.style.width;
        const keepMargin = box.style.margin;
        box.removeAttribute("style");
        if (keepWidth) box.style.width = keepWidth;
        if (keepMargin) box.style.margin = keepMargin;
        box.style.display = "block";
        box.style.maxWidth = "100%";
      }
    });
    clone.querySelectorAll("img,video,audio,iframe").forEach((el) => {
      el.removeAttribute("draggable");
      el.style && (el.style.outline = "");
    });
    clone
      .querySelectorAll(".selected")
      .forEach((el) => el.classList.remove("selected"));
    clone.querySelectorAll("p").forEach((p) => {
      p.style && p.style.removeProperty("color");
      p.querySelectorAll("[style*='color']").forEach((el) => {
        el.style.removeProperty("color");
        if (!el.getAttribute("style")) el.removeAttribute("style");
      });
      p.querySelectorAll("font[color]").forEach((font) => {
        while (font.firstChild)
          font.parentNode.insertBefore(font.firstChild, font);
        font.remove();
      });
    });
    return clone.innerHTML;
  }
  function cleanupInlineColorInSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container =
      range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentNode;
    if (!container) return;
    container
      .querySelectorAll("p")
      .forEach((p) => cleanupInlineColorInParagraph(p));
    const blk = getCurrentBlockNode();
    if (blk && blk.tagName === "P") cleanupInlineColorInParagraph(blk);
  }
  function syncSource() {
    if (!srcArea || !editor) return;
    srcArea.value =
      typeof sanitizeForOutput === "function"
        ? sanitizeForOutput(editor)
        : editor.innerHTML;
  }
  function updateWordCount() {
    if (!wordCount || !editor) return;
    const text = editor.innerText || "";
    const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
    wordCount.textContent = `${words} ${words === 1 ? "palavra" : "palavras"}`;
  }

  function unwrapLinkNode(linkEl) {
    if (!linkEl || linkEl.tagName !== "A" || !linkEl.parentNode) return null;
    const parent = linkEl.parentNode;
    let firstChild = linkEl.firstChild;
    let lastChild = linkEl.lastChild || firstChild;
    while (linkEl.firstChild) {
      const child = linkEl.firstChild;
      parent.insertBefore(child, linkEl);
      if (!firstChild) firstChild = child;
      lastChild = child;
    }
    parent.removeChild(linkEl);
    return { parent, firstChild, lastChild };
  }

  function removeLinkElement(linkEl) {
    const result = unwrapLinkNode(linkEl);
    if (!result) return;
    const { firstChild, lastChild } = result;
    if (firstChild && lastChild) {
      const range = document.createRange();
      range.setStartBefore(firstChild);
      range.setEndAfter(lastChild);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    syncSource();
    updateWordCount();
    refreshStyleButtons();
  }

  function unwrapAnchorsWithin(node) {
    if (!node || !node.childNodes) return;
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        unwrapAnchorsWithin(child);
        if (child.tagName === "A") unwrapLinkNode(child);
      }
    });
  }

  function getCurrentBlockNode() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentNode;
    while (
      node &&
      node !== editor &&
      !(
        node instanceof HTMLElement &&
        /^(P|H1|H2|H3|H4|LI|DIV)$/.test(node.tagName)
      )
    )
      node = node.parentNode;
    return node instanceof HTMLElement ? node : editor;
  }
  function isCaretInsideListItem() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "LI") {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }
  function enforceCurrentBlock() {
    const map = { p: "P", h1: "H1", h2: "H2", h3: "H3", h4: "H4" };
    const want = map[currentBlockTag] || "P";
    applyExec("formatBlock", want);
  }
  function reflectBlockFromCaret() {
    const blk = getCurrentBlockNode();
    if (!blk || !fmtBlock) return;
    const tag = blk.tagName?.toLowerCase();
    const allowed = ["p", "h1", "h2", "h3", "h4"];
    if (allowed.includes(tag)) {
      if (fmtBlock.value !== tag) fmtBlock.value = tag;
      currentBlockTag = tag;
      if (tag === "p") {
        const blk = getCurrentBlockNode();
        cleanupInlineColorInParagraph(blk);
        syncSource();
      }
    }
  }

  function placeCaretAfter(node) {
    const range = document.createRange();
    range.setStartAfter(node);
    range.setEndAfter(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    focusEditor();
  }

  function selectMediaBox(box) {
    currentMediaBox = box;
    box.style.outline = "2px solid var(--color-primary01)";
    editor.querySelectorAll('[data-media-box="1"]').forEach((el) => {
      if (el !== box) el.style.outline = "1px dashed var(--color-stroke)";
    });
  }
  function clearMediaSelection() {
    if (!editor) return;
    editor.querySelectorAll('[data-media-box="1"]').forEach((el) => {
      el.style.outline = "1px dashed var(--color-stroke)";
    });
    currentMediaBox = null;
  }

  function createResizableBox(innerEl) {
    const box = document.createElement("span");
    box.setAttribute("data-media-box", "1");
    box.contentEditable = "false";
    box.style.cssText =
      "position:relative;display:block;line-height:0;margin:8px auto;border:1px dashed var(--color-stroke);max-width:100%;";
    if (innerEl.tagName === "AUDIO") {
      box.style.lineHeight = "normal";
    }
    innerEl.style.display = "block";
    if (
      innerEl.tagName === "IMG" ||
      innerEl.tagName === "VIDEO" ||
      innerEl.tagName === "AUDIO" ||
      innerEl.tagName === "IFRAME"
    )
      innerEl.style.width = "100%";
    if (innerEl.tagName === "IMG") innerEl.style.height = "auto";
    if (innerEl.tagName === "IFRAME") {
      innerEl.style.aspectRatio = "16 / 9";
      innerEl.style.height = "auto";
      innerEl.style.minHeight = "220px";
    }
    innerEl.style.maxWidth = "100%";
    innerEl.style.outline = "none";
    innerEl.style.pointerEvents = "auto";
    box.style.pointerEvents = "auto";
    innerEl.setAttribute("draggable", "false");

    const defaultW = Math.min(
      600,
      Math.floor((editor?.clientWidth || 800) * 0.9)
    );
    box.style.width = defaultW + "px";

    const h = document.createElement("span");
    h.setAttribute("data-resize", "se");
    h.style.cssText =
      "position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;background:var(--color-primary01);border:1px solid rgba(0,0,0,.35);border-radius:2px;cursor:se-resize;";
    box.appendChild(innerEl);
    box.appendChild(h);

    box.addEventListener("click", (e) => {
      e.preventDefault();
      selectMediaBox(box);
      placeCaretAfter(box);
    });

    innerEl.addEventListener("click", () => {
      selectMediaBox(box);
      placeCaretAfter(box);
    });

    let startX = 0,
      startY = 0,
      startW = 0,
      startH = 0;
    function onMove(ev) {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const dx = clientX - startX;
      const dy = clientY - startY;
      const newW = Math.max(120, startW + dx);
      const newH = Math.max(120, startH + dy);
      box.style.width = newW + "px";
      if (innerEl.tagName !== "AUDIO") {
        innerEl.style.height = newH + "px";
      }
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      placeCaretAfter(box);
      syncSource();
    }
    if (h)
      if (h)
        h.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          startX = ev.clientX;
          startY = ev.clientY;
          startW = parseFloat(getComputedStyle(box).width);
          startH =
            parseFloat(getComputedStyle(innerEl).height) ||
            innerEl.offsetHeight ||
            0;
          h.setPointerCapture && h.setPointerCapture(ev.pointerId);
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          document.body.style.userSelect = "none";
          document.body.style.cursor = "se-resize";
        });
    if (h)
      if (h)
        h.addEventListener("touchstart", (ev) => {
          ev.stopPropagation();
          startX = ev.touches[0].clientX;
          startW = parseFloat(getComputedStyle(box).width);
          document.addEventListener("touchmove", onMove, { passive: false });
          document.addEventListener("touchend", onUp);
          document.body.style.userSelect = "none";
        });

    box.draggable = true;
    box.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/plain", "");
      ev.dataTransfer.effectAllowed = "move";
      draggingBox = box;
      selectMediaBox(box);
    });
    return box;
  }

  function pickLocalFile(accept, cb) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () =>
        cb({
          file,
          dataUrl: reader.result,
          objectUrl: URL.createObjectURL(file),
        });
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function uploadFileToServer(file) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed");
      const data = await res.json();
      if (data && data.url) return data.url;
    } catch (e) {
      console.warn("Upload falhou; usando URL local:", e);
    }
    return null;
  }

  function parseYoutubeTimestamp(value) {
    if (!value) return 0;
    let input = String(value || "").trim().toLowerCase();
    if (!input) return 0;
    input = input.replace(/^#/, "").replace(/^t=/, "");
    if (!input) return 0;
    if (/^\d+$/.test(input)) return Number(input);
    const match = input.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!match) return 0;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  function extractYoutubeVideoData(rawInput) {
    const value = String(rawInput || "").trim();
    if (!value) return null;

    const sanitizeId = (id) =>
      typeof id === "string" ? id.replace(/[^a-zA-Z0-9_-]/g, "") : "";

    const toUrl = (input) => {
      if (!input) return null;
      try {
        return new URL(input);
      } catch (err) {
        try {
          return new URL(`https://${input}`);
        } catch (e) {
          return null;
        }
      }
    };

    const url = toUrl(value);
    let videoId = "";
    let startAt = 0;

    if (url) {
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      if (host === "youtu.be") {
        videoId = sanitizeId(url.pathname.replace(/^\/+/, "").split("/")[0]);
      } else if (host.endsWith("youtube.com")) {
        if (url.searchParams.get("v")) {
          videoId = sanitizeId(url.searchParams.get("v"));
        } else {
          const segments = url.pathname
            .split("/")
            .map((seg) => seg.trim())
            .filter(Boolean);
          if (segments.length) {
            const special = ["embed", "shorts", "live"];
            const idx = segments.findIndex((seg) =>
              special.includes(seg.toLowerCase())
            );
            if (idx !== -1 && segments[idx + 1]) {
              videoId = sanitizeId(segments[idx + 1]);
            } else {
              const last = segments[segments.length - 1];
              if (
                last &&
                !["channel", "user", "c"].includes(last.toLowerCase()) &&
                !last.startsWith("@")
              ) {
                videoId = sanitizeId(last);
              }
            }
          }
        }
      }
      startAt =
        parseYoutubeTimestamp(url.searchParams.get("t")) ||
        parseYoutubeTimestamp(url.searchParams.get("start")) ||
        parseYoutubeTimestamp(
          url.hash ? url.hash.replace(/^#/, "") : ""
        );
      if (videoId && videoId.length < 8) videoId = "";
    }

    if (!videoId && /^[a-zA-Z0-9_-]{8,}$/.test(value)) {
      videoId = value;
    } else if (!videoId && !value.includes("://")) {
      const maybeId = sanitizeId(value);
      if (/^[a-zA-Z0-9_-]{8,}$/.test(maybeId)) videoId = maybeId;
    }

    if (!videoId) return null;
    return { videoId, startAt: Math.max(0, Math.floor(startAt || 0)) };
  }

  function buildYoutubeEmbedUrl(videoId, startAt = 0) {
    const cleanId =
      typeof videoId === "string"
        ? videoId.replace(/[^a-zA-Z0-9_-]/g, "")
        : "";
    if (!cleanId) return "";
    const base = `https://www.youtube.com/embed/${cleanId}`;
    if (startAt && Number(startAt) > 0) {
      const safeStart = Math.max(0, Math.floor(Number(startAt) || 0));
      return `${base}?start=${safeStart}`;
    }
    return base;
  }

  function createYoutubeIframe(videoId, startAt = 0) {
    const src = buildYoutubeEmbedUrl(videoId, startAt);
    if (!src) return null;
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.width = "560";
    iframe.height = "315";
    iframe.style.width = "100%";
    iframe.style.height = "auto";
    iframe.style.aspectRatio = "16 / 9";
    iframe.style.border = "0";
    iframe.style.backgroundColor = "transparent";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    iframe.setAttribute("allowfullscreen", "");
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.title = "YouTube video player";
    iframe.setAttribute("title", "YouTube video player");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    return iframe;
  }

  function insertNodeAtCaret(node) {
    focusEditor();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      editor.appendChild(node);
    } else {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(node);
    }
    placeCaretAfter(node);
    syncSource();
    updateWordCount();
  }

  function alignMediaBox(box, where) {
    if (!box) return;
    box.style.display = "block";
    box.style.margin = "8px auto";
    if (where === "left") box.style.margin = "8px auto 8px 0";
    if (where === "center") box.style.margin = "8px auto";
    if (where === "right") box.style.margin = "8px 0 8px auto";
    selectMediaBox(box);
    syncSource();
  }

  function getMediaBoxFromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentNode;
    return node.closest ? node.closest('[data-media-box="1"]') : null;
  }

  if (btnImage) {
    btnImage.addEventListener("click", () => {
      pickLocalFile("image/*", async ({ file, dataUrl, objectUrl }) => {
        let url = await uploadFileToServer(file);
        url = url || objectUrl || dataUrl;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        const box = createResizableBox(img);
        insertNodeAtCaret(box);
        selectMediaBox(box);
      });
    });
  }
  if (btnAudio) {
    btnAudio.addEventListener("click", () => {
      pickLocalFile("audio/*", async ({ file, dataUrl, objectUrl }) => {
        let url = await uploadFileToServer(file);
        url = url || objectUrl || dataUrl;
        const audio = document.createElement("audio");
        audio.src = url;
        audio.controls = true;
        audio.preload = "metadata";
        const box = createResizableBox(audio);
        insertNodeAtCaret(box);
        selectMediaBox(box);
      });
    });
  }
  if (btnVideo) {
    btnVideo.addEventListener("click", () => {
      const sel = window.getSelection();
      const savedRange =
        sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
      const { modal } = openModal({
        title: "Inserir vídeo do YouTube",
        bodyHTML: `
          <label class="btn-sm" style="display:block;margin-bottom:6px;">Link do YouTube</label>
          <input class="btn-sm" id="modal-youtube-url" type="text" placeholder="https://www.youtube.com/watch?v=..." style="width:100%;height:38px;border:1px solid var(--color-stroke);border-radius:8px;background:var(--color-card);color:inherit;padding:0 10px;">
          <p class="btn-sm" data-youtube-error style="margin-top:8px;color:#ff4d4f;display:none;">Insira um link válido do YouTube.</p>
        `,
        confirmText: "Inserir",
        onConfirm: ({ modal, close }) => {
          const input = modal.querySelector("#modal-youtube-url");
          const errorMsg = modal.querySelector("[data-youtube-error]");
          if (!input) {
            close();
            return;
          }
          const parsed = extractYoutubeVideoData(input.value);
          if (!parsed) {
            if (errorMsg) errorMsg.style.display = "block";
            input.focus();
            return;
          }
          if (errorMsg) errorMsg.style.display = "none";
          const iframe = createYoutubeIframe(parsed.videoId, parsed.startAt);
          if (!iframe) {
            if (errorMsg) errorMsg.style.display = "block";
            input.focus();
            return;
          }
          const box = createResizableBox(iframe);
          if (savedRange) {
            const range =
              typeof savedRange.cloneRange === "function"
                ? savedRange.cloneRange()
                : savedRange;
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
          insertNodeAtCaret(box);
          selectMediaBox(box);
          close();
        },
      });
      setTimeout(() => {
        const input = modal.querySelector("#modal-youtube-url");
        const errorMsg = modal.querySelector("[data-youtube-error]");
        if (input) {
          input.focus();
          input.addEventListener("input", () => {
            if (errorMsg) errorMsg.style.display = "none";
          });
        }
      }, 0);
    });
  }

  if (btnBold) btnBold.addEventListener("click", () => applyExec("bold"));
  if (btnItalic) btnItalic.addEventListener("click", () => applyExec("italic"));
  if (btnUnder)
    btnUnder.addEventListener("click", () => applyExec("underline"));
  if (btnStrike)
    btnStrike.addEventListener("click", () => applyExec("strikeThrough"));
  if (btnOrdered)
    btnOrdered.addEventListener("click", () => applyExec("insertOrderedList"));
  if (btnUnordered)
    btnUnordered.addEventListener("click", () =>
      applyExec("insertUnorderedList")
    );

  if (btnLeft)
    btnLeft.addEventListener("click", () => {
      const box = currentMediaBox || getMediaBoxFromSelection();
      if (box) alignMediaBox(box, "left");
      else applyExec("justifyLeft");
    });
  if (btnCenter)
    btnCenter.addEventListener("click", () => {
      const box = currentMediaBox || getMediaBoxFromSelection();
      if (box) alignMediaBox(box, "center");
      else applyExec("justifyCenter");
    });
  if (btnRight)
    btnRight.addEventListener("click", () => {
      const box = currentMediaBox || getMediaBoxFromSelection();
      if (box) alignMediaBox(box, "right");
      else applyExec("justifyRight");
    });
  if (btnJust)
    btnJust.addEventListener("click", () => {
      clearMediaSelection();
      applyExec("justifyFull");
    });

  if (btnLink)
    btnLink.addEventListener("click", () => {
      const sel = window.getSelection();
      const insideEditor = selectionInsideEditor();
      const existingLink = getSelectedLinkElement(insideEditor);
      const hasSelection =
        sel && sel.rangeCount > 0 && !sel.isCollapsed && insideEditor;
      if (!hasSelection && !existingLink) {
        openModal({
          title: "Inserir link",
          bodyHTML: `<p class="btn-sm" style="margin:0">Selecione um texto no editor para aplicar o link.</p>`,
          confirmText: "OK",
        });
        return;
      }
      const savedRange =
        sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
      const initialUrl = existingLink?.getAttribute("href") || "";
      const shouldOpenBlank =
        existingLink?.getAttribute("target") === "_blank" || !existingLink;
      const { modal, close } = openModal({
        title: "Inserir link",
        bodyHTML: `
          <label class="btn-sm" style="display:block;margin-bottom:6px;">URL</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input class="btn-sm" id="modal-link-url" type="text" placeholder="https://exemplo.com" style="flex:1;height:38px;border:1px solid var(--color-stroke);border-radius:8px;background:var(--color-card);color:inherit;padding:0 10px;">
            <button class="btn-sm" type="button" data-link-remove aria-label="Remover link" title="Remover link" style="height:38px;width:38px;border-radius:8px;border:1px solid var(--color-stroke);background:var(--color-card);color:var(--color-text-primary);${
              existingLink ? "" : "display:none;"
            }">&times;</button>
          </div>
          <div style="margin-top:8px;">
            <label class="btn-sm"><input id="modal-link-blank" type="checkbox" ${
              shouldOpenBlank ? "checked" : ""
            }> Abrir em nova aba</label>
          </div>
        `,
        confirmText: "Aplicar",
        onConfirm: ({ modal, close }) => {
          const input = modal.querySelector("#modal-link-url");
          const blankCheckbox = modal.querySelector("#modal-link-blank");
          let url = input ? input.value.trim() : "";
          const blank = blankCheckbox ? !!blankCheckbox.checked : true;
          if (!url) {
            if (existingLink) removeLinkElement(existingLink);
            close();
            return;
          }
          if (!/^[a-z]+:/i.test(url)) url = "https://" + url;
          if (existingLink) {
            existingLink.href = url;
            if (blank) existingLink.setAttribute("target", "_blank");
            else existingLink.removeAttribute("target");
            placeCaretAfter(existingLink);
            syncSource();
            updateWordCount();
            refreshStyleButtons();
            close();
            return;
          }
          if (!savedRange) {
            close();
            return;
          }
          const range =
            typeof savedRange.cloneRange === "function"
              ? savedRange.cloneRange()
              : savedRange;
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
          const contents = range.extractContents();
          unwrapAnchorsWithin(contents);
          const a = document.createElement("a");
          a.href = url;
          if (blank) a.setAttribute("target", "_blank");
          a.appendChild(contents);
          range.insertNode(a);
          placeCaretAfter(a);
          syncSource();
          updateWordCount();
          refreshStyleButtons();
          close();
        },
      });
      setTimeout(() => {
        const input = modal.querySelector("#modal-link-url");
        if (input) {
          input.value = initialUrl;
          input.focus();
          if (initialUrl) input.select();
        }
      }, 0);
      const removeBtn = modal.querySelector("[data-link-remove]");
      if (removeBtn && existingLink) {
        removeBtn.addEventListener("click", () => {
          removeLinkElement(existingLink);
          close();
        });
      }
    });

  if (editor) {
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if (!isCaretInsideListItem()) {
          const blk = getCurrentBlockNode();
          forceParagraphAfterHeading = blk
            ? isHeadingTag(blk.tagName)
            : false;
          setTimeout(enforceCurrentBlock, 0);
        } else {
          forceParagraphAfterHeading = false;
          setTimeout(() => {
            syncSource();
            refreshStyleButtons();
          }, 0);
        }
      }
      if (e.key === "Escape") clearMediaSelection();
    });
    editor.addEventListener("keyup", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if (forceParagraphAfterHeading) {
          forceParagraphAfterHeading = false;
          forceParagraphBlockFromSelection();
          sweepParagraphColors();
        }
        reflectBlockFromCaret();
        if (isCaretInsideListItem()) {
          syncSource();
          refreshStyleButtons();
        } else if (currentBlockTag === "p") {
          cleanupInlineColorInSelection();
          sweepParagraphColors();
          syncSource();
        }
      }
    });
    ["keyup", "mouseup"].forEach((ev) =>
      editor.addEventListener(ev, () => {
        const selBox = getMediaBoxFromSelection();
        if (!selBox) clearMediaSelection();
        reflectBlockFromCaret();
        refreshStyleButtons();
      })
    );
    editor.addEventListener("paste", (e) => {
      if (!e) return;
      e.preventDefault();
      const clip = e.clipboardData || window.clipboardData;
      const raw = clip ? clip.getData("text/plain") : "";
      if (!raw) return;
      focusEditor();
      const normalized = raw.replace(/\r\n?/g, "\n");
      const lines = normalized.split("\n");
      lines.forEach((line, idx) => {
        document.execCommand("insertText", false, line);
        if (idx < lines.length - 1) {
          document.execCommand("insertParagraph");
        }
      });
      if (!isCaretInsideListItem()) {
        const blk = getCurrentBlockNode();
        if (!blk || blk.tagName !== "P") {
          forceParagraphBlockFromSelection();
        } else {
          resetParagraphAppearance(blk);
          cleanupInlineColorInParagraph(blk);
        }
      }
      sweepParagraphColors();
      syncSource();
      updateWordCount();
      refreshStyleButtons();
    });
    editor.addEventListener("input", () => {
      updateWordCount();
      syncSource();
      if (currentBlockTag === "p") sweepParagraphColors();
      refreshStyleButtons();
    });
    editor.addEventListener("dragover", (ev) => {
      if (draggingBox) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
      }
    });
    editor.addEventListener("drop", (ev) => {
      if (!draggingBox) return;
      ev.preventDefault();
      const box = draggingBox;
      draggingBox = null;
      const parent = box.parentNode;
      if (parent) parent.removeChild(box);
      let range;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(ev.clientX, ev.clientY);
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
      if (range) {
        range.insertNode(box);
        placeCaretAfter(box);
      } else {
        editor.appendChild(box);
        placeCaretAfter(box);
      }
      syncSource();
    });
  }

  document.addEventListener("selectionchange", () => {
    refreshStyleButtons();
  });

  refreshStyleButtons();

  if (fldDesc) {
    const updateDesc = () => {
      if (fldDesc.value.length > 250)
        fldDesc.value = fldDesc.value.slice(0, 250);
      if (descCount) descCount.textContent = String(fldDesc.value.length);
      updatePreview();
    };
    fldDesc.addEventListener("input", updateDesc);
  }
  if (fldImageCredits) {
    fldImageCredits.addEventListener("input", () => updatePreview());
  }

  let previewIframe = null;
  let selectedImageUrl = "";
  // Reference to the featured image preview element (img tag) that shows the
  // currently selected or existing cover image in the editor form. This is
  // defined here so it can be reused in several functions.
  const imgFeaturedPreview = $("#pub-featured-preview", scope);
  const previewSection = sectionPreview;
  const previewIframeEl = $("#pub-preview-iframe", scope);

  function showPreviewSection() {
    if (!previewSection || !previewIframeEl || !sectionEdit) return;
    sectionEdit.hidden = true;
    previewSection.hidden = false;
    previewIframe = previewIframeEl;
    if (previewIframe.contentDocument?.readyState === "complete") {
      updatePreview();
    } else {
      previewIframe.addEventListener("load", updatePreview, { once: true });
    }
    updatePreview();
  }
  function showEditorSection() {
    if (!previewSection || !sectionEdit) return;
    previewSection.hidden = true;
    sectionEdit.hidden = false;
    $("#pub-editor", scope)?.focus();
  }

  function updatePreview() {
    if (!previewIframe) return;
    const doc =
      previewIframe.contentDocument || previewIframe.contentWindow?.document;
    if (!doc) return;
    const titleEl = doc.getElementById("article-title");
    const titleInput = $("#pub-title", scope);
    if (titleEl && titleInput) titleEl.textContent = titleInput.value || "";
    const descEl = doc.getElementById("article-description");
    if (descEl) {
      const descValue = fldDesc?.value || "";
      descEl.textContent = descValue;
      descEl.hidden = !descValue.trim();
    }
    const authorEl = doc.getElementById("author-name");
    const authorInput = $("#pub-author", scope);
    if (authorEl && authorInput) authorEl.textContent = authorInput.value || "";
    const dateInput = $("#pub-date", scope);
    const dateField = doc.querySelector(".article-date");
    if (dateField && dateInput) {
      dateField.textContent = dateInput.value || "";
      const dStr = dateInput.value || "";
      let iso = "";
      if (dStr) {
        const parts = dStr.split("/");
        if (parts.length === 3) {
          const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          if (!isNaN(d.getTime())) iso = d.toISOString().split("T")[0];
        }
      }
      if (iso) dateField.setAttribute("datetime", iso);
    }
    const imgEl = doc.getElementById("article-image");
    if (imgEl) {
      if (selectedImageUrl) imgEl.src = selectedImageUrl;
      else imgEl.removeAttribute("src");
    }
    const creditEl = doc.getElementById("article-image-credit");
    if (creditEl) {
      const creditText = fldImageCredits?.value?.trim() || "";
      if (creditText) {
        creditEl.textContent = `Créditos: ${creditText}`;
        creditEl.hidden = false;
      } else {
        creditEl.textContent = "";
        creditEl.hidden = true;
      }
    }
    const contentEl = doc.getElementById("article-content");
    if (contentEl && editor) {
      syncSource();
      contentEl.innerHTML = srcArea?.value || "";
      const text = editor.innerText || "";
      const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
      const minutes = Math.max(1, Math.ceil(words / 200));
      const timeDisplay = doc.getElementById("article-time");
      if (timeDisplay)
        timeDisplay.textContent = `· Tempo de leitura: ${minutes} minutos`;
    }
    const navEl = doc.getElementById("article-nav");
    const catSelect = $("#pub-tags", scope);
    if (navEl && catSelect) {
      const catVal = catSelect.value || "";
      const slugMap = {
        Games: "games",
        "Mundo Tech": "mundo-tech",
        Filmes: "filmes",
        Séries: "series",
        Nerd: "nerd",
      };
      const label = catVal;
      const slug = slugMap[catVal] || "";
      let navHtml = `<a href="./index.html">Início</a>`;
      if (catVal === "Filmes" || catVal === "Séries" || catVal === "Nerd") {
        navHtml += `<span>></span><a href="./index.html?cat=cultura-pop">Cultura Pop</a>`;
        navHtml += `<span>></span><a href="./index.html?cat=cultura-pop&sub=${slug}">${label}</a>`;
      } else if (slug) {
        navHtml += `<span>></span><a href="./index.html?cat=${slug}">${label}</a>`;
      }
      navEl.innerHTML = navHtml;
    }
  }

  const fldFeatured = $("#pub-featured", scope);
  if (fldFeatured) {
    fldFeatured.addEventListener("change", () => {
      const file = fldFeatured.files && fldFeatured.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        selectedImageUrl = reader.result;
        // Update the small preview image next to the file input
        if (imgFeaturedPreview) {
          imgFeaturedPreview.src = selectedImageUrl;
          imgFeaturedPreview.style.display = "";
        }
        updatePreview();
      };
      reader.readAsDataURL(file);
    });
  }

  const btnPreview = $("#btn-preview-publication", scope);
  if (btnPreview) btnPreview.addEventListener("click", showPreviewSection);
  const btnEdit = $("#btn-edit-publication", scope);
  if (btnEdit) btnEdit.addEventListener("click", showEditorSection);

  const btnPreviewPreview = $("#btn-preview-publication-preview", scope);
  if (btnPreviewPreview)
    btnPreviewPreview.addEventListener("click", updatePreview);
  const btnEditPreview = $("#btn-edit-publication-preview", scope);
  if (btnEditPreview)
    btnEditPreview.addEventListener("click", showEditorSection);
  const btnBackPreview = $("#btn-back-publication-preview", scope);
  if (btnBackPreview)
    btnBackPreview.addEventListener("click", () => toggleSections(false));
  const btnSavePreview = $("#btn-save-publication-preview", scope);
  if (btnSavePreview)
    btnSavePreview.addEventListener("click", () => {
      $("#btn-save-publication", scope)?.click();
    });
  const btnPublishPreview = $("#btn-public-publication-preview", scope);
  if (btnPublishPreview)
    btnPublishPreview.addEventListener("click", () => {
      $("#btn-public-publication", scope)?.click();
    });

  const titleInput = $("#pub-title", scope);
  if (titleInput) titleInput.addEventListener("input", updatePreview);
  if (editor) editor.addEventListener("input", updatePreview);
  const authorInput = $("#pub-author", scope);
  if (authorInput) authorInput.addEventListener("input", updatePreview);
  const dateInput = $("#pub-date", scope);
  if (dateInput) dateInput.addEventListener("input", updatePreview);

  const btnPublish = $("#btn-public-publication", scope);
  async function publishArticle() {
    const isAdminUser =
      window.currentUser && window.currentUser.role === "admin";

    showLoadingModal(
      isAdminUser ? "Publicando..." : "Enviando para análise..."
    );

    const formVals = getFormValues(
      editMode === "publication" || editMode === "draft" ? editId : null
    );
    const payload = {
      title: formVals.title,
      date: formVals.dateISO,
      category: formVals.category,
      description: formVals.description,
      image: formVals.cover || null,
      image_credit: formVals.imageCredit || null,
      content: formVals.content,
      slug: formVals.slug || undefined, // <-- NOVO
      status: isAdminUser ? "published" : "review",
      views: formVals.views || 0,
    };
    const isEditing = editMode === "publication" || editMode === "draft";
    const url = isEditing
      ? `/api/publications/${formVals.id}`
      : "/api/publications";
    const method = isEditing ? "PUT" : "POST";
    let returned = null;
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao publicar");
      }
      returned = await res.json().catch(() => null);
    } catch (e) {
      console.error(e);
      showStatusModal(
        "error",
        e?.message || "Erro ao publicar.",
        ERROR_DURATION
      );
      return;
    }

    if (isAdminUser) {
      showStatusModal("success", "Publicação publicada.");
    } else {
      showStatusModal("success", "Sua publicação foi enviada para análise.");
    }

    if (!isAdminUser) {
      try {
        const created = {
          id: (returned && returned.id) || formVals.id,
          title: $("#pub-title")?.value?.trim() || "Publicação",
          slug: (returned && returned.slug) || formVals.slug || null, // <-- NOVO
        };
        if (window.__notify?.toCurrentUserSubmitted) {
          await window.__notify.toCurrentUserSubmitted(created);
        }
      } catch (e) {
        console.error(e);
      }
    }

    await fetchPublished();
    await fetchDrafts();
    if (window.__notify?.refresh) await window.__notify.refresh();

    resetEditorForm();
    toggleSections(false);
  }
  if (btnPublish) btnPublish.addEventListener("click", publishArticle);

  const btnSave = $("#btn-save-publication", scope);
  async function saveDraft() {
    showLoadingModal("Salvando...");

    const formVals = getFormValues(editMode === "draft" ? editId : null);
    const payload = {
      title: formVals.title,
      date: formVals.dateISO,
      category: formVals.category,
      description: formVals.description,
      image: formVals.cover || null,
      image_credit: formVals.imageCredit || null,
      content: formVals.content,
      slug: formVals.slug || undefined, // <-- NOVO
      status: "draft",
      views: formVals.views || 0,
    };
    const isEditingDraft = editMode === "draft";
    const url = isEditingDraft
      ? `/api/publications/${formVals.id}`
      : "/api/publications";
    const method = isEditingDraft ? "PUT" : "POST";
    let returned = null;
    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao salvar rascunho");
      }
      returned = await res.json().catch(() => null);
    } catch (e) {
      console.error(e);
      showStatusModal(
        "error",
        e?.message || "Erro ao salvar publicação.",
        ERROR_DURATION
      );
      return;
    }

    if (returned && (returned.id || formVals.id)) {
      const item = {
        id: returned.id || formVals.id,
        slug: (returned.slug ?? formVals.slug) || null,
        title: returned.title ?? formVals.title,
        author:
          (returned.author && (returned.author.name || returned.author.nome)) ||
          returned.author_name ||
          returned.author ||
          window.currentUser?.nome ||
          window.currentUser?.name ||
          "",
        authorId:
          (returned.author && returned.author.id) || returned.author_id || null,
        category: returned.category ?? formVals.category,
        dateISO: returned.date ?? formVals.dateISO,
        status: "draft",
        views: returned.views ?? formVals.views ?? 0,
        cover: returned.image ?? formVals.cover ?? "",
        description: returned.description ?? formVals.description ?? "",
        content: returned.content ?? formVals.content ?? "",
      };
      const idx = drafts.findIndex((d) => String(d.id) === String(item.id));
      if (idx >= 0) drafts[idx] = item;
      else drafts.unshift(item);
      renderDrafts();
      hydrateDraftFilters();
      if (!isEditingDraft && window.__notify?.toAuthorDraftSaved) {
        try {
          await window.__notify.toAuthorDraftSaved(item);
        } catch (err) {
          console.error(err);
        }
      }
    }

    await fetchDrafts();
    await fetchPublished();
    if (window.__notify?.refresh) await window.__notify.refresh();

    showStatusModal("success", "Publicação salva.");

    resetEditorForm();
    toggleSections(false);

    const draftTabBtn = document.querySelector(
      "button[data-section='rascunhos']"
    );
    if (draftTabBtn) draftTabBtn.click();
    else {
      const viewDraft = document.querySelector("#view-rascunhos");
      const viewPub = document.querySelector("#view-publicacoes");
      if (viewDraft && viewPub) {
        viewPub.style.display = "none";
        viewDraft.style.display = "";
      }
      renderDrafts();
    }
  }
  if (btnSave) btnSave.addEventListener("click", saveDraft);

  function autoSaveDraft() {
    if (editMode === "publication") return;
    const title = $("#pub-title", scope)?.value.trim();
    const desc = fldDesc?.value.trim();
    const content = editor?.innerText.trim();
    if (!title && !desc && !content) return;
    const formVals = getFormValues(editMode === "draft" ? editId : null);
    const payload = {
      title: formVals.title,
      date: formVals.dateISO,
      category: formVals.category,
      description: formVals.description,
      image: formVals.cover || null,
      image_credit: formVals.imageCredit || null,
      content: formVals.content,
      slug: formVals.slug || undefined,
      status: "draft",
      views: formVals.views || 0,
    };
    const isEditingDraft = editMode === "draft";
    const url = isEditingDraft
      ? `/api/publications/${formVals.id}`
      : "/api/publications";
    const method = isEditingDraft ? "PUT" : "POST";
    fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((resp) => {
        if (resp && resp.id) {
          editMode = "draft";
          editId = resp.id;
          const idx = drafts.findIndex((d) => String(d.id) === String(resp.id));
          const authorName =
            (resp.author && (resp.author.name || resp.author.nome)) ||
            resp.author_name ||
            resp.author ||
            window.currentUser?.nome ||
            window.currentUser?.name ||
            "";
          const item = {
            id: resp.id,
            slug: resp.slug || formVals.slug || null,
            title: resp.title,
            author: authorName,
            authorId: (resp.author && resp.author.id) || resp.author_id || null,
            category: resp.category,
            dateISO: resp.date,
            status: "draft",
            views: resp.views ?? 0,
            cover: resp.image ?? "",
            description: resp.description ?? "",
            imageCredit:
              resp.image_credit ??
              resp.imageCredit ??
              formVals.imageCredit ??
              "",
            content: resp.content ?? "",
          };
          if (idx >= 0) drafts[idx] = item;
          else drafts.unshift(item);
          renderDrafts();
          if (!isEditingDraft && window.__notify?.toAuthorDraftSaved) {
            window.__notify
              .toAuthorDraftSaved(item)
              .catch((err) => console.error(err));
          }
        }
      })
      .catch((err) => console.error(err));
  }

  window.addEventListener("beforeunload", () => {
    autoSaveDraft();
  });

  function applyFiltersDrafts(rows) {
    const q = draftState.query.trim().toLowerCase();
    let out = rows.filter((r) => {
      const matchQ =
        !q ||
        r.title.toLowerCase().includes(q) ||
        (r.subtitle || "").toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q);
      const matchA =
        draftState.author === "__all__" || r.author === draftState.author;
      const matchC =
        draftState.category === "__all__" || r.category === draftState.category;
      return matchQ && matchA && matchC;
    });
    switch (draftState.sort) {
      case "recent":
        out.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
        break;
      case "old":
        out.sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
        break;
      case "title_asc":
        out.sort((a, b) => a.title.localeCompare(a.title));
        break;
      case "title_desc":
        out.sort((a, b) => b.title.localeCompare(b.title));
        break;
      default:
        break;
    }
    return out;
  }

  const paginateDrafts = (rows) =>
    draftEls.pagination
      ? rows.slice(
          (draftState.page - 1) * draftState.pageSize,
          draftState.page * draftState.pageSize
        )
      : rows;

  function renderDraftPagination(total) {
    if (!draftEls.pagination) return;
    const pages = Math.max(1, Math.ceil(total / draftState.pageSize));
    draftEls.pagination.innerHTML = Array.from({ length: pages }, (_, i) => {
      const n = i + 1;
      const active = n === draftState.page ? " is-active" : "";
      return `<button class="publication__page-btn${active}" data-page="${n}">${n}</button>`;
    }).join("");
    draftEls.pagination.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        draftState.page = Number(btn.dataset.page);
        renderDrafts();
      });
    });
  }

  function renderDrafts() {
    if (window.currentUser) {
      draftState.currentUser =
        window.currentUser.name ||
        window.currentUser.nome ||
        draftState.currentUser;
    }
    const filtered = applyFiltersDrafts(drafts);
    const rows = paginateDrafts(filtered);
    if (draftEls.tbody)
      draftEls.tbody.innerHTML = rows.map(buildDraftRow).join("");
    if (draftEls.kpiTotal)
      draftEls.kpiTotal.textContent = String(filtered.length);
    if (draftEls.kpiMine)
      draftEls.kpiMine.textContent = String(
        filtered.filter((p) => p.author === draftState.currentUser).length
      );
    if (draftEls.kpiOther)
      draftEls.kpiOther.textContent = String(filtered.length);
    const now = new Date();
    if (draftEls.kpiMonth)
      draftEls.kpiMonth.textContent = String(
        filtered.filter((p) => {
          const d = new Date(p.dateISO);
          return (
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        }).length
      );
    renderDraftPagination(filtered.length);
  }

  function focusDraftRow(draftId) {
    if (!draftId && draftId !== 0) return;
    const idStr = String(draftId);
    draftState.query = "";
    hydrateDraftFilters();
    const currentAuthor =
      window.currentUser?.nome ||
      window.currentUser?.name ||
      window.currentUser?.fullName ||
      "";
    draftState.author = currentAuthor || "__all__";
    draftState.category = "__all__";
    if (draftEls.search) draftEls.search.value = "";
    if (draftEls.author)
      draftEls.author.value = currentAuthor || "__all__";
    if (draftEls.category) draftEls.category.value = "__all__";
    const index = drafts.findIndex((d) => String(d.id) === idStr);
    if (index >= 0 && draftState.pageSize > 0) {
      draftState.page = Math.floor(index / draftState.pageSize) + 1;
    }
    renderDrafts();
    setTimeout(() => {
      const row = document.querySelector(
        `#view-rascunhos tr[data-id="${idStr}"]`
      );
      if (!row) return;
      row.classList.add("draft-highlight");
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => row.classList.remove("draft-highlight"), 2400);
    }, 200);
  }

  function hydrateDraftFilters() {
    const authors = [...new Set(drafts.map((d) => d.author))].sort();
    const cats = [...new Set(drafts.map((d) => d.category))].sort();
    if (draftEls.author)
      draftEls.author.innerHTML =
        `<option value="__all__">Todos os autores</option>` +
        authors.map((a) => `<option value="${a}">${a}</option>`).join("");
    if (draftEls.category)
      draftEls.category.innerHTML =
        `<option value="__all__">Todas as categorias</option>` +
        cats.map((c) => `<option value="${c}">${c}</option>`).join("");
  }

  if (draftEls.search)
    draftEls.search.addEventListener("input", (e) => {
      draftState.query = e.target.value;
      draftState.page = 1;
      renderDrafts();
    });
  if (draftEls.author)
    draftEls.author.addEventListener("change", (e) => {
      draftState.author = e.target.value;
      draftState.page = 1;
      renderDrafts();
    });
  if (draftEls.category)
    draftEls.category.addEventListener("change", (e) => {
      draftState.category = e.target.value;
      draftState.page = 1;
      renderDrafts();
    });
  if (draftEls.sort)
    draftEls.sort.addEventListener("change", (e) => {
      draftState.sort = e.target.value;
      draftState.page = 1;
      renderDrafts();
    });
  if (draftEls.tbody)
    draftEls.tbody.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const tr = ev.target.closest("tr");
      const id = tr ? Number(tr.dataset.id) : null;
      const item = drafts.find((d) => d.id === id);
      if (!item) return;
      if (btn.classList.contains("js-edit-draft")) {
        try {
          const pubTabBtn = document.querySelector(
            "button[data-section='publicacoes']"
          );
          pubTabBtn?.click();
        } catch (_) {}
        resetEditorForm();
        fillEditorForm(item, "draft");
        toggleSections(true);
        try {
          const editSection = document.querySelector(
            "#view-publicacoes .publication-edit"
          );
          editSection?.scrollIntoView({ behavior: "smooth", block: "start" });
          const titleField = document.querySelector("#pub-title");
          titleField?.focus();
        } catch (_) {}
      } else if (btn.classList.contains("js-delete-draft")) {
        openModal({
          title: "Excluir rascunho",
          bodyHTML: `<p class="btn-sm" style="margin:0 0 8px;">Tem certeza que deseja excluir o rascunho abaixo?</p>
            <div style="border:1px solid var(--color-stroke);padding:10px;border-radius:10px;">
              <div class="btn-sm" style="font-weight:600;margin-bottom:6px;">${item.title}</div>
              <div class="btn-sm" style="opacity:.8;">Autor: ${item.author} | Categoria: ${item.category}</div>
            </div>`,
          confirmText: "Excluir",
          cancelText: "Cancelar",
          onConfirm: async ({ close }) => {
            showLoadingModal("Excluindo rascunho...");
            try {
              await fetch(`/api/publications/${item.id}`, {
                method: "DELETE",
                credentials: "include",
              });
              showStatusModal("success", "Rascunho excluído.");
            } catch (e) {
              console.error(e);
              showStatusModal(
                "error",
                e?.message || "Erro ao excluir rascunho.",
                ERROR_DURATION
              );
            }
            await fetchDrafts();
            close();
          },
        });
      }
    });

  (function waitForUserAndInit() {
    if (window.currentUser) {
      (async () => {
        try {
          await fetchExcluded();
          await fetchPublished();
          await fetchDrafts();
          if (window.__notify?.refresh) await window.__notify.refresh();
        } catch (e) {
          console.error(e);
        }
      })();
    } else {
      setTimeout(waitForUserAndInit, 150);
    }
  })();
})();

function normalizeMediaInside(element) {
  element.querySelectorAll("video").forEach((v) => {
    v.controls = true;
    v.style.display = "block";
    if (!v.style.width) v.style.width = "100%";
  });
  element.querySelectorAll("audio").forEach((a) => {
    a.controls = true;
    a.style.display = "block";
    if (!a.style.width) a.style.width = "100%";
  });
}
if (editor) {
  normalizeMediaInside(editor);
  editor.addEventListener("input", () => normalizeMediaInside(editor));
  editor.addEventListener("mouseup", () => normalizeMediaInside(editor));
}

function sweepParagraphColors() {
  if (!editor) return;
  editor.querySelectorAll("p").forEach((p) => cleanupInlineColorInParagraph(p));
}













