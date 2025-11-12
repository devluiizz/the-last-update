import { createCardAnimator } from "../utils/cardAnimator.js";
import { createShowingCounter } from "../utils/showingCounter.js";
/*
 * Script da página do jornalista
 *
 * Esta página exibe as informações detalhadas de um jornalista (ou autor) e
 * lista todas as publicações assinadas por ele. Permite filtrar por categoria
 * (Todas, Games, Mundo Tech, Cultura Pop) e ordenar por data (mais recentes ou
 * mais antigas) ou por número de visualizações.
 */

(function () {
  const SOCIAL_ICON_MARKUP = {
    instagram: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.6" fill="none"/>
        <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6" fill="none"/>
        <circle cx="17.5" cy="6.5" r="1.4" fill="currentColor"/>
      </svg>
    `,
    linkedin: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2.4" stroke="currentColor" stroke-width="1.4" fill="none"/>
        <path d="M7.25 10.25V16.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        <path d="M7.25 7.5H7.26" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M11 16.5V10.9C11 9.85 11.85 9 12.9 9C13.95 9 14.8 9.85 14.8 10.9V16.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        <path d="M11 12.25C11 11.56 11.56 11 12.25 11H15.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      </svg>
    `,
    twitter: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 3.5H8.4L13.2 9.7L18.4 3.5H20L14.3 10.4L20 20.5H15.6L11.2 13.7L6.3 20.5H4.8L10.8 12.8L4 3.5Z" fill="currentColor"/>
      </svg>
    `,
    email: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5.5" width="18" height="13" rx="2.2" stroke="currentColor" stroke-width="1.6" fill="none"/>
        <path d="M4 7l7.5 6a1 1 0 0 0 1.3 0L20 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    `,
  };

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  function sanitizeSocialUrl(value, prefix) {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    const normalized = trimmed.toLowerCase();
    const direct = prefix.toLowerCase();
    const withWww = direct.replace("://", "://www.");
    if (normalized.startsWith(direct) || normalized.startsWith(withWww)) {
      return trimmed;
    }
    return "";
  }

  function sanitizeEmail(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    return EMAIL_REGEX.test(trimmed) ? trimmed : "";
  }

  function normalizeMemberSocials(member) {
    return {
      instagram: sanitizeSocialUrl(member?.instagram, "https://instagram.com/"),
      linkedin: sanitizeSocialUrl(member?.linkedin, "https://linkedin.com/in/"),
      twitter: sanitizeSocialUrl(member?.twitter, "https://twitter.com/"),
      email: sanitizeEmail(member?.email_social),
    };
  }

  function renderSocialIcons(container, socials) {
    if (!container) return;
    container.innerHTML = "";
    const safeSocials = socials || {};
    const entries = [
      {
        key: "instagram",
        url: safeSocials.instagram,
        label: "Instagram",
      },
      {
        key: "linkedin",
        url: safeSocials.linkedin,
        label: "LinkedIn",
      },
      {
        key: "twitter",
        url: safeSocials.twitter,
        label: "Twitter",
      },
      {
        key: "email",
        url: safeSocials.email ? `mailto:${safeSocials.email}` : "",
        label: "E-mail",
      },
    ];
    let hasLinks = false;
    entries.forEach(({ key, url, label }) => {
      if (!url) return;
      const link = document.createElement("a");
      link.className = "team-card__social-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", label);
      const icon = document.createElement("span");
      icon.className = "icon-social";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = SOCIAL_ICON_MARKUP[key] || SOCIAL_ICON_MARKUP.instagram;
      link.appendChild(icon);
      container.appendChild(link);
      hasLinks = true;
    });
    container.hidden = !hasLinks;
  }

  /**
   * Obtém os parâmetros da URL atual.
   * @returns {{ id: string|null, name: string|null }}
   */
  function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      id: params.get("id"),
      name: params.get("name"),
    };
  }

  /**
   * Formata uma data ISO (YYYY-MM-DD HH:mm:ss) para o formato extenso em
   * português do Brasil. Exemplo: "2023-09-07" -> "7 de setembro de 2023".
   * Caso não seja possível formatar, retorna a própria string.
   * @param {string} isoDate
   */
  function formatFullDatePtBr(isoDate) {
    if (!isoDate) return "";
    try {
      const date = new Date(isoDate);
      return new Intl.DateTimeFormat("pt-BR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
    } catch (err) {
      return isoDate;
    }
  }

  /**
   * Busca os detalhes de um membro a partir do ID.
   * @param {string|number} id
   */
  async function fetchMemberDetails(id) {
    const API = (window.__API_BASE__ || "/api").replace(/\/$/, "");
    const url = `${API}/public/journalists/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error("Erro ao buscar dados do jornalista");
    return res.json();
  }

  /**
   * Busca a lista completa de membros cadastrados. Usado para procurar um membro
   * pelo nome quando o ID não é fornecido.
   */
  async function fetchAllMembers() {
    const API = (window.__API_BASE__ || "/api").replace(/\/$/, "");
    const endpoint = `${API}/public/journalists?includeInactive=true`;
    const res = await fetch(endpoint, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error("Erro ao carregar membros");
    return res.json();
  }

  /**
   * Busca notícias públicas. Usa um limite alto para garantir todas as
   * publicações necessárias. Por padrão limita a 100 itens.
   */
  async function fetchPublicNews(limit = 100) {
    const API = (window.__API_BASE__ || "/api").replace(/\/$/, "");
    const res = await fetch(
      `${API}/public/news?limit=${limit}&_=${Date.now()}`,
      {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      }
    );
    if (!res.ok) throw new Error("Erro ao carregar notícias públicas");
    return res.json();
  }

  /**
   * Cria o elemento de cartão completo para membros da equipe, reutilizando
   * estilos semelhantes aos cartões da seção "Nossa Equipe".
   */
  function buildFullCard(member) {
    const article = document.createElement("article");
    article.className = "team-card hover-card";
    if (member.id != null) {
      article.dataset.id = String(member.id);
    }

    const img = document.createElement("img");
    img.className = "team-card__image";
    img.alt = `Foto de ${member.nome}`;
    const prefersDark =
      document.documentElement.classList.contains("theme-dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const avatar = prefersDark
      ? member.avatar_dark || member.avatar_light
      : member.avatar_light || member.avatar_dark;
    img.src = avatar || "";

    const nameEl = document.createElement("h3");
    nameEl.className = "team-card__name btn-lg";
    nameEl.textContent = member.nome || "";

    const roleEl = document.createElement("p");
    roleEl.className = "team-card__roles btn-md";
    roleEl.textContent =
      member.o_que_faz || member.roles || member.tipo || member.role || "";

    const divider = document.createElement("div");
    divider.className = "team-card__divider";

    const bioEl = document.createElement("p");
    bioEl.className = "team-card__bio btn-md";
    bioEl.textContent = member.about || member.bio || "";

    const social = document.createElement("div");
    social.className = "team-card__social";
    renderSocialIcons(social, normalizeMemberSocials(member));

    article.appendChild(img);
    article.appendChild(nameEl);
    article.appendChild(roleEl);
    article.appendChild(divider);
    article.appendChild(bioEl);
    article.appendChild(social);
    return article;
  }

  /**
   * Cria um cartão simplificado para autores que não fazem parte da equipe.
   */
  function buildSimplifiedCard(member) {
    /*
      Constrói uma versão simplificada do cartão utilizando a mesma base de estilização (team-card).
      Exibe apenas a foto e o nome do autor, mas preserva o tamanho e a estética do cartão.
    */
    const article = document.createElement("article");
    article.className = "team-card hover-card";
    // Foto
    const img = document.createElement("img");
    img.className = "team-card__image";
    const prefersDark =
      document.documentElement.classList.contains("theme-dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const avatar = prefersDark
      ? member.avatar_dark || member.avatar_light
      : member.avatar_light || member.avatar_dark;
    img.src = avatar || "";
    img.alt = `Foto de ${member.nome}`;
    // Nome
    const nameEl = document.createElement("h3");
    nameEl.className = "team-card__name btn-lg";
    nameEl.textContent = member.nome || "";
    article.appendChild(img);
    article.appendChild(nameEl);
    return article;
  }

  /**
   * Constrói a barra de filtros (categorias e ordenação) e retorna os elementos criados.
   * @param {Object} state Objeto de estado que será atualizado pelas interações
   * @param {Function} onChange Callback executado ao alterar filtros
   */
  function buildControls(state, onChange) {
    // Wrapper que agrupa cabeçalho e filtros adicionais
    const wrapper = document.createElement("div");
    wrapper.className = "journalist-controls";

    // Cabeçalho contendo abas de categorias e campo de busca
    const header = document.createElement("div");
    header.className = "latest__header";

    // Navegação por categorias
    const nav = document.createElement("nav");
    nav.className = "latest__tabs btn-lg";
    nav.setAttribute("aria-label", "Categorias");
    // Armazenaremos o elemento de subfiltro para uso nos manipuladores de categoria
    let subFilter;
    const categories = [
      { key: "all", label: "Todas as Notícias" },
      { key: "games", label: "Games" },
      { key: "mundo-tech", label: "Mundo Tech" },
      { key: "cultura-pop", label: "Cultura Pop" },
    ];
    categories.forEach(({ key, label }) => {
      const btn = document.createElement("button");
      btn.className = "tab";
      btn.type = "button";
      btn.dataset.cat = key;
      btn.setAttribute("aria-controls", "journalist-news");
      btn.textContent = label;
      btn.setAttribute("aria-selected", String(state.cat === key));
      btn.addEventListener("click", () => {
        state.cat = key;
        if (state.cat !== "cultura-pop") {
          state.sub = "all";
        }
        // Atualiza visual das abas
        nav.querySelectorAll("button.tab").forEach((b) => {
          b.setAttribute(
            "aria-selected",
            b.dataset.cat === state.cat ? "true" : "false"
          );
        });
        // Mostra ou oculta subfiltro
        if (subFilter) {
          subFilter.hidden = state.cat !== "cultura-pop";
        }
        onChange();
      });
      nav.appendChild(btn);
    });
    header.appendChild(nav);

    // Campo de busca
    const searchForm = document.createElement("form");
    searchForm.className = "latest__search";
    searchForm.setAttribute("role", "search");
    searchForm.setAttribute("aria-label", "Buscar Notícias");
    searchForm.onsubmit = () => false;
    const searchWrap = document.createElement("div");
    searchWrap.className = "search-wrap btn-md latest__search-wrap";
    const searchIcon = document.createElement("span");
    searchIcon.className = "search-icon";
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.innerHTML =
      '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.3333 21.3333L25.3333 25.3333M21.3333 14C21.3333 18.0501 18.05 21.3333 14 21.3333C9.94987 21.3333 6.66663 18.0501 6.66663 14C6.66663 9.94991 9.94987 6.66667 14 6.66667C18.05 6.66667 21.3333 9.94991 21.3333 14Z" stroke="var(--color-text-primary)" stroke-width="1.5" stroke-linecap="round" /></svg>';
    searchWrap.appendChild(searchIcon);
    const searchInput = document.createElement("input");
    searchInput.id = "journalist-search";
    searchInput.className = "search-input";
    searchInput.name = "q";
    searchInput.type = "search";
    searchInput.placeholder = "Buscar Notícias";
    searchInput.autocomplete = "off";
    searchInput.addEventListener("input", () => {
      state.q = searchInput.value.trim();
      onChange();
    });
    searchWrap.appendChild(searchInput);
    searchForm.appendChild(searchWrap);
    header.appendChild(searchForm);
    wrapper.appendChild(header);

    // Filtros adicionais (ordenar e subcategorias)
    const filters = document.createElement("div");
    filters.className = "latest__filters";
    filters.setAttribute("aria-label", "Filtros Adicionais");

    // Filtro de ordenação
    const sortDiv = document.createElement("div");
    sortDiv.className = "latest__sort";
    const sortLabel = document.createElement("label");
    sortLabel.setAttribute("for", "journalist-sort");
    sortLabel.textContent = "Ordenar por:";
    sortDiv.appendChild(sortLabel);
    const select = document.createElement("select");
    select.id = "journalist-sort";
    select.name = "sort";
    const sortOptions = [
      { value: "recent", label: "Mais recente" },
      { value: "oldest", label: "Mais antiga" },
      { value: "views", label: "Mais visualizadas" },
    ];
    sortOptions.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (state.sort === opt.value) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      state.sort = select.value;
      onChange();
    });
    sortDiv.appendChild(select);
    filters.appendChild(sortDiv);

    // Campo de subcategorias para Cultura Pop
    subFilter = document.createElement("fieldset");
    subFilter.id = "journalist-subfilter";
    subFilter.className = "latest__subfilter";
    subFilter.hidden = state.cat !== "cultura-pop";
    const legend = document.createElement("legend");
    legend.textContent = "Refinar Cultura Pop";
    subFilter.appendChild(legend);
    const subs = [
      { value: "all", label: "Tudo" },
      { value: "filmes", label: "Filmes" },
      { value: "nerd", label: "Nerd" },
      { value: "series", label: "Séries" },
    ];
    subs.forEach(({ value, label }) => {
      const lbl = document.createElement("label");
      lbl.className = "btn-sm";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "journalist-sub";
      radio.value = value;
      if (state.sub === value) radio.checked = true;
      radio.addEventListener("change", () => {
        state.sub = radio.value;
        onChange();
      });
      lbl.appendChild(radio);
      lbl.appendChild(document.createTextNode(" " + label));
      subFilter.appendChild(lbl);
    });
    filters.appendChild(subFilter);

    wrapper.appendChild(filters);
    return wrapper;
  }

  /**
   * Mapeia o slug da categoria para um rótulo legível.
   * Reproduz a mesma lógica usada na home.
   * @param {string} cat
   */
  function labelFromCat(cat) {
    switch (cat) {
      case "mundo-tech":
        return "Mundo Tech";
      case "games":
        return "Games";
      case "cultura-pop":
        return "Cultura Pop";
      case "videos":
        return "Vídeos";
      default:
        return "Notícias";
    }
  }

  /**
   * Converte um texto em slug, removendo acentos e caracteres especiais.
   * Utilizado para classificar categorias de forma consistente.
   * @param {string} value
   */
  function slugifyCategory(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Analisa a categoria enviada pela API e retorna a categoria principal e a subcategoria.
   * Aplica as mesmas regras da home (quando "nerd", "filmes" ou "series" são tratados como subcategorias de Cultura Pop).
   * @param {string} raw
   */
  function parseCategory(raw) {
    const safe = typeof raw === "string" ? raw : "";
    const [mainRaw = "", subRaw = ""] = safe.split("/");
    const mainLabel = mainRaw.trim();
    const subLabelRaw = subRaw.trim();
    const hasSubLabel = subLabelRaw.length > 0;
    const subLabel = hasSubLabel ? subLabelRaw : null;
    const mainSlug = mainLabel ? slugifyCategory(mainLabel) : "";
    let category = mainSlug;
    let categoryLabel = mainLabel;
    let subcategory = subLabel ? slugifyCategory(subLabel) : null;
    let subcategoryLabel = subLabel;

    if (!hasSubLabel && ["nerd", "filmes", "series"].includes(mainSlug)) {
      category = "cultura-pop";
      categoryLabel = "Cultura Pop";
      subcategory = mainSlug || null;
      subcategoryLabel = mainLabel || null;
    }
    return {
      category,
      categoryLabel,
      subcategory,
      subcategoryLabel,
    };
  }

  /**
   * Cria o cartão de notícia para exibição na listagem. Adapta-se ao modelo
   * usado na home para manter consistência visual.
   * @param {Object} item
   */
  function createNewsCard(item) {
    const art = document.createElement("article");
    art.className = "post-card hover-card";
    art.dataset.articleId = item.id;
    art.dataset.category = item.category;
    if (item.subcategory) art.dataset.subcategory = item.subcategory;

    art.innerHTML = `
      <a class="post-card__image-link" href="${item.url}">
        <img loading="lazy" alt="${item.title}" src="${item.imageUrl}">
      </a>

      <div class="post-card__topline">
        <time class="post-card__date btn-sm" datetime="${item.dateISO}">${
      window.formatDatePtBr ? window.formatDatePtBr(item.dateISO) : item.dateISO
    }</time>
        <span class="post-card__category btn-sm box-grad">${
          item.categoryLabel || labelFromCat(item.category)
        }</span>
      </div>

      <h5 class="post-card__title"><a href="${item.url}">${item.title}</a></h5>

      <p class="post-card__excerpt body-lg">${item.excerpt || ""}</p>

      <div class="post-card__meta">
        <div class="post-card__perfil">
          <img class="post-card__avatar" loading="lazy" alt="Foto de ${
            item.author.name
          }" src="${item.author.avatarUrl}">
          <span class="post-card__author btn-sm">${item.author.name}</span>
        </div>
        <a class="post-card__cta btn-lg" href="${item.url}">
          <span class="post-card__cta-label">Ler Notícia</span>
          <span class="post-card__cta-icon" aria-hidden="true">
            <svg width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
              <path d="M19.4411 4.76801C17.5437 2.9865 15.0378 1.99645 12.4351 2.00001C6.77412 2.00001 2.18512 6.58901 2.18512 12.25C2.18512 17.911 6.77412 22.5 12.4351 22.5C15.1322 22.5038 17.7213 21.4409 19.6376 19.543L12.1851 12L19.4411 4.76801Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M20.1851 14C20.7156 14 21.2243 13.7893 21.5993 13.4142C21.9744 13.0391 22.1851 12.5304 22.1851 12C22.1851 11.4696 21.9744 10.9609 21.5993 10.5858C21.2243 10.2107 20.7156 10 20.1851 10C19.6547 10 19.146 10.2107 18.7709 10.5858C18.3958 10.9609 18.1851 11.4696 18.1851 12C18.1851 12.5304 18.3958 13.0391 18.7709 13.4142C19.146 13.7893 19.6547 14 20.1851 14Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M8.68512 6.5V10.5M6.68512 8.5H10.6851" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </a>
      </div>
    `;

    // Ajusta o texto do resumo para caber em 3 linhas
    requestAnimationFrame(() => {
      const excerpt = art.querySelector(".post-card__excerpt");
      if (excerpt && typeof window.clampToLines === "function") {
        window.clampToLines(excerpt, 3);
      }
    });

    // Torna o card inteiro clicável em telas pequenas, como na home
    try {
      const widthMobileMax = 1199;
      const enableClick = () => {
        const cta = art.querySelector(".post-card__cta");
        if (!cta) return;
        art.addEventListener("click", (event) => {
          if (event.target.closest(".post-card__cta")) return;
          if (event.target.closest("a, button")) return;
          cta.click();
        });
      };
      if (window.innerWidth <= widthMobileMax) enableClick();
    } catch (_) {}
    return art;
  }

  /**
   * Filtra e ordena a lista de publicações conforme o estado atual.
   * @param {Array} list Todas as publicações do jornalista
   * @param {Object} state Objeto contendo filtros ativos
   */
  function applyFilters(list, state) {
    // Faz uma cópia para evitar mutação da lista original
    let out = Array.isArray(list) ? list.slice() : [];
    // Filtra por categoria e subcategoria
    if (state.cat && state.cat !== "all") {
      out = out.filter((item) => {
        if (!item) return false;
        if (state.cat !== "cultura-pop") {
          return item.category === state.cat;
        }
        // Se for Cultura Pop, considerar subcategoria
        if (state.sub && state.sub !== "all") {
          return (
            item.category === "cultura-pop" && item.subcategory === state.sub
          );
        }
        return item.category === "cultura-pop";
      });
    }
    // Filtro de busca por título ou descrição
    if (state.q) {
      const qLower = String(state.q || "").toLowerCase();
      out = out.filter((item) => {
        const title = (item.title || "").toLowerCase();
        const excerpt = (item.excerpt || "").toLowerCase();
        return title.includes(qLower) || excerpt.includes(qLower);
      });
    }
    // Ordenação
    if (state.sort === "recent") {
      out = out.slice().sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
    } else if (state.sort === "oldest") {
      out = out.slice().sort((a, b) => (a.dateISO > b.dateISO ? 1 : -1));
    } else if (state.sort === "views") {
      out = out.slice().sort((a, b) => b.views - a.views);
    }
    return out;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const { id, name } = getQueryParams();
    let memberDetails;
    try {
      if (id) {
        memberDetails = await fetchMemberDetails(id);
      } else if (name) {
        // Procura o membro pelo nome (case insensitive)
        const members = await fetchAllMembers();
        const target = members.find((m) => {
          return (
            m &&
            String(m.nome || "").toLowerCase() === String(name).toLowerCase()
          );
        });
        if (target) {
          memberDetails = await fetchMemberDetails(target.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
    if (!memberDetails || !memberDetails.member) {
      // Nada encontrado; não renderiza a página
      return;
    }
    const { member, stats } = memberDetails;

    // Atualiza o título da página
    const title = document.querySelector("title");
    if (title) {
      const prefix =
        member.team_member === 1 || member.team_member === true
          ? "TLU"
          : "Sobre";
      title.textContent = `${prefix} – ${member.nome}`;
    }

    // Renderiza o cartão
    const infoSection = document.getElementById("journalist-info");
    if (infoSection) {
      const cardEl =
        member.team_member === 1 || member.team_member === true
          ? buildFullCard(member)
          : buildSimplifiedCard(member);
      infoSection.appendChild(cardEl);

      // Metainformações: data de cadastro e total de publicações
      const meta = document.createElement("p");
      meta.className = "journalist-meta btn-md";
      const createdAt = member.created_at || member.createdAt || "";
      const formattedDate = formatFullDatePtBr(createdAt);
      const parts = [];
      if (formattedDate) {
        parts.push(`Desde ${formattedDate}`);
      }
      const totalPub =
        stats && typeof stats.publicacoes === "number"
          ? stats.publicacoes
          : member.publicacoes;
      if (totalPub != null) {
        parts.push(
          `<span class="destaque">Publicações: ${totalPub} notícia${
            totalPub === 1 ? "" : "s"
          }</span>`
        );
      }
      meta.innerHTML = parts.join(" • ");
      infoSection.appendChild(meta);
      if (!member.active) {
        const status = document.createElement("p");
        status.className = "journalist-status btn-md";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.textContent = "Este jornalista não faz mais parte da equipe.";
        infoSection.appendChild(status);
      }
    }

    // Busca as publicações do jornalista
    let newsList = [];
    try {
      const allNews = await fetchPublicNews(100);
      newsList = allNews
        .filter((it) => {
          return (
            it &&
            (
              (it.author && it.author.name) ||
              it.author_name ||
              ""
            ).toLowerCase() === String(member.nome || "").toLowerCase()
          );
        })
        .map((it) => {
          // Analisa categoria e subcategoria usando a mesma lógica da home
          const { category, categoryLabel, subcategory, subcategoryLabel } =
            parseCategory(it.category);
          return {
            id: it.id,
            title: it.title || "",
            dateISO: it.date || "",
            excerpt: it.description || "",
            imageUrl: it.image || "",
            views: Number(it.views) || 0,
            category,
            categoryLabel,
            subcategory,
            subcategoryLabel,
            author: {
              name:
                (it.author && it.author.name) || it.author_name || member.nome,
              avatarUrl: (it.author && it.author.avatarUrl) || "",
            },
            url: it.slug
              ? `/noticia/${encodeURIComponent(it.slug)}`
              : `/noticia?id=${encodeURIComponent(it.id)}`,
          };
        });
    } catch (err) {
      console.error(err);
    }

    // Estado de filtros
    const state = {
      cat: "all",
      sub: "all",
      sort: "recent",
      q: "",
      page: 1,
      pageSize: 9,
    };

    // Renderiza controles
    const controlsSection = document.getElementById("journalist-controls");
    if (controlsSection) {
      const controlsEl = buildControls(state, () => {
        state.page = 1;
        renderNews(false);
      });
      controlsSection.appendChild(controlsEl);
    }

    // Lista de notícias
    const newsSection = document.getElementById("journalist-news");
    const footerEl = document.getElementById("journalist-footer");
    const counterEl = document.getElementById("journalist-counter");
    const loadMoreBtn = document.getElementById("journalist-load-more");
    const updateCounter = createShowingCounter(counterEl);
    updateCounter(0, 0);
    const cardAnimator = createCardAnimator(newsSection, {
      mediaQuery: "(max-width: 1199px)",
    });

    function renderNews(append = false) {
      if (!newsSection) return;
      const list = applyFilters(newsList, state);
      const total = list.length;

      if (!append) {
        newsSection.innerHTML = "";
      }

      if (!total) {
        updateCounter(0, 0);
        if (footerEl) footerEl.hidden = true;
        if (loadMoreBtn) {
          loadMoreBtn.hidden = true;
          loadMoreBtn.disabled = true;
        }
        if (cardAnimator) cardAnimator.refresh();
        return;
      }

      const end = Math.min(state.page * state.pageSize, total);
      const startIndex = append ? (state.page - 1) * state.pageSize : 0;
      const fragment = document.createDocumentFragment();
      list.slice(startIndex, end).forEach((item) => {
        fragment.appendChild(createNewsCard(item));
      });
      newsSection.appendChild(fragment);
      if (cardAnimator) cardAnimator.refresh();
      updateCounter(end, total);

      if (footerEl) footerEl.hidden = false;
      if (loadMoreBtn) {
        if (end >= total) {
          loadMoreBtn.hidden = true;
          loadMoreBtn.disabled = true;
        } else {
          loadMoreBtn.hidden = false;
          loadMoreBtn.disabled = false;
        }
      }
    }

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => {
        state.page += 1;
        renderNews(true);
      });
    }

    renderNews(false);
  });
})();
