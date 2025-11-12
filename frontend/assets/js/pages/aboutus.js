(function () {
  const btns = document.querySelectorAll(".help-us-copy");
  const ORIGINAL = "Copiar chave PIX";
  const OK = "A chave PIX foi copiada! :)";
  const ERROR = "Falhou :(";
  const SUCCESS_CLASS = "is-success";

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (!ok) throw new Error("execCommand falhou");
  }

  btns.forEach((btn) => {
    let timer = null;
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.classList.remove(SUCCESS_CLASS);
      try {
        await copyText(text);
        btn.textContent = OK;
        btn.setAttribute("aria-label", "Chave copiada");
        btn.classList.add(SUCCESS_CLASS);
      } catch {
        btn.textContent = ERROR;
        btn.setAttribute("aria-label", "Erro ao copiar");
      } finally {
        clearTimeout(timer);
        timer = setTimeout(() => {
          btn.textContent = ORIGINAL || prev;
          btn.disabled = false;
          btn.removeAttribute("aria-label");
          btn.classList.remove(SUCCESS_CLASS);
        }, 1800);
      }
    });
  });
})();

(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const slider = document.getElementById("team-slider");
    const btnPrev = document.querySelector(".team-nav--prev");
    const btnNext = document.querySelector(".team-nav--next");
    if (!slider || !btnPrev || !btnNext) return;

    function getScrollAmount() {
      const card = slider.querySelector(".team-card");
      if (!card) return slider.clientWidth;
      const cardRect = card.getBoundingClientRect();
      const style = window.getComputedStyle(slider);
      let gap = 24;
      if (style.gap) {
        const parsed = parseFloat(style.gap);
        if (!Number.isNaN(parsed)) gap = parsed;
      }
      return cardRect.width + gap;
    }

    btnPrev.addEventListener("click", () => {
      slider.scrollBy({ left: -getScrollAmount(), behavior: "smooth" });
    });
    btnNext.addEventListener("click", () => {
      slider.scrollBy({ left: getScrollAmount(), behavior: "smooth" });
    });
  });
})();

(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const slider = document.getElementById("team-slider");
    const hint = document.querySelector(".team-slider-hint");
    if (!slider) return;

    const MOBILE_MAX = 980;
    let observer = null;

    function destroyObserver() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    function removeActive() {
      const cards = slider.querySelectorAll(".team-card");
      cards.forEach((c) => c.classList.remove("is-active"));
    }

    function initTeamObserver() {
      destroyObserver();
      const cards = Array.from(slider.querySelectorAll(".team-card"));
      if (!cards.length) return;
      cards.forEach((c) => c.classList.remove("is-active"));
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.intersectionRatio >= 0.6) {
              cards.forEach((c) =>
                c.classList.toggle("is-active", c === entry.target)
              );
            }
          });
        },
        { root: slider, threshold: [0.6] }
      );
      cards.forEach((card) => observer.observe(card));
    }

    function updateTeamBehaviour() {
      const isMobile = window.innerWidth <= MOBILE_MAX;
      if (isMobile) {
        initTeamObserver();
      } else {
        destroyObserver();
        removeActive();
      }
      updateHintVisibility();
    }

    function updateHintVisibility() {
      if (!hint) return;
      const show = window.innerWidth <= MOBILE_MAX;
      hint.style.display = show ? "flex" : "none";
    }

    updateTeamBehaviour();
    window.addEventListener("resize", updateTeamBehaviour);
    slider.addEventListener("team:updated", () => {
      requestAnimationFrame(updateTeamBehaviour);
    });
  });
})();

(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const MOBILE_MAX = 980;
    const targets = [
      document.querySelector(".about-us-text"),
      document.querySelector(".help-us-text"),
    ].filter(Boolean);
    let obs = null;

    function destroy() {
      if (obs) {
        obs.disconnect();
        obs = null;
      }
    }

    function removeActive() {
      targets.forEach((el) => el.classList.remove("is-active"));
    }

    function initObserver() {
      destroy();
      if (!targets.length) return;
      obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const el = entry.target;
            if (entry.intersectionRatio >= 0.6) {
              el.classList.add("is-active");
            } else {
              el.classList.remove("is-active");
            }
          });
        },
        { root: null, threshold: [0.6] }
      );
      targets.forEach((el) => obs.observe(el));
    }

    function updateBehaviour() {
      const isMobile = window.innerWidth <= MOBILE_MAX;
      if (isMobile) {
        initObserver();
      } else {
        destroy();
        removeActive();
      }
    }

    updateBehaviour();
    window.addEventListener("resize", updateBehaviour);
  });
})();
(function () {
  const TEAM_ENDPOINT = "/api/public/team";
  const DEFAULT_AVATAR_LIGHT = "/assets/img/avatares/avatar_lightMode.png";
  const DEFAULT_AVATAR_DARK = "/assets/img/avatares/avatar_darkMode.png";

  const renderedKeys = new Set();
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
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

  function buildJournalistUrl(name, id) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "";
    const params = new URLSearchParams();
    params.set("name", trimmed);
    if (id != null && id !== "") {
      params.set("id", String(id));
    }
    return `/jornalista?${params.toString()}`;
  }

  function isLightTheme() {
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) return theme === "light";
    const bodyTheme = document.body?.dataset?.theme;
    return bodyTheme ? bodyTheme === "light" : true;
  }

  function sanitizeSocialUrl(value, prefix) {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    return trimmed.toLowerCase().startsWith(prefix) ? trimmed : "";
  }

  function sanitizeEmail(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    return EMAIL_REGEX.test(trimmed) ? trimmed : "";
  }

  function normalizeMember(raw) {
    if (!raw) return null;
    const id = raw.id != null ? Number(raw.id) : null;
    const rawName = (raw.nome || raw.name || "").trim();
    const key =
      raw.key ||
      (id != null
        ? `member-${id}`
        : `member-${Math.random().toString(16).slice(2)}`);
    const nome = rawName || "Membro";
    const roles =
      (raw.o_que_faz ?? raw.oQueFaz ?? raw.roles ?? "").toString().trim() ||
      "Fun\u00e7\u00e3o n\u00e3o cadastrada";
    const about =
      (raw.about ?? raw.bio ?? "").toString().trim() ||
      "Sem biografia cadastrada.";
    const avatarLight = raw.avatar_light || raw.avatar || DEFAULT_AVATAR_LIGHT;
    const avatarDark = raw.avatar_dark || raw.avatar || DEFAULT_AVATAR_DARK;
    const instagram = sanitizeSocialUrl(raw.instagram, "https://instagram.com/");
    const linkedin = sanitizeSocialUrl(
      raw.linkedin,
      "https://linkedin.com/in/"
    );
    const twitter = sanitizeSocialUrl(raw.twitter, "https://twitter.com/");
    const emailSocial = sanitizeEmail(raw.email_social ?? raw.emailSocial);
    const journalistUrl =
      (raw.author_url ?? raw.authorUrl ?? raw.profile_url ?? "").trim() ||
      buildJournalistUrl(rawName, id);
    return {
      id,
      key,
      nome,
      roles,
      about,
      avatarLight,
      avatarDark,
      socials: {
        instagram,
        linkedin,
        twitter,
        email: emailSocial,
      },
      domId: id != null ? `card-membro-${id}` : key,
      journalistUrl,
    };
  }

  function createTeamCard(member) {
    const article = document.createElement("article");
    article.className = "team-card hover-card";
    article.id = member.domId;
    if (member.id != null) {
      article.dataset.id = String(member.id);
    } else {
      article.dataset.id = member.key;
    }

    const img = document.createElement("img");
    img.className = "team-card__image";
    img.alt = `Foto de ${member.nome}`;
    img.setAttribute("data-light", member.avatarLight);
    img.setAttribute("data-dark", member.avatarDark || member.avatarLight);
    img.src = isLightTheme()
      ? member.avatarLight || member.avatarDark || DEFAULT_AVATAR_LIGHT
      : member.avatarDark || member.avatarLight || DEFAULT_AVATAR_DARK;

    const nameEl = document.createElement("h3");
    nameEl.className = "team-card__name btn-lg";
    nameEl.textContent = member.nome;

    const rolesEl = document.createElement("p");
    rolesEl.className = "team-card__roles btn-md";
    rolesEl.textContent = member.roles;

    const divider = document.createElement("div");
    divider.className = "team-card__divider";

    const bioEl = document.createElement("p");
    bioEl.className = "team-card__bio btn-md";
    bioEl.textContent = member.about;

    const social = document.createElement("div");
    social.className = "team-card__social";
    renderSocialIcons(social, member.socials);

    const cta = document.createElement("a");
    cta.className = "team-card__cta btn-md";
    cta.href = member.journalistUrl || "#";
    cta.textContent = "Ver publicações";
    if (!member.journalistUrl) {
      cta.setAttribute("aria-disabled", "true");
      cta.tabIndex = -1;
    }

    article.appendChild(img);
    article.appendChild(nameEl);
    article.appendChild(rolesEl);
    article.appendChild(divider);
    article.appendChild(bioEl);
    article.appendChild(social);
    article.appendChild(cta);

    return article;
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
      // Substitua o conteúdo abaixo pelo seu SVG se desejar.
      icon.innerHTML = SOCIAL_ICON_MARKUP[key] || SOCIAL_ICON_MARKUP.instagram;
      link.appendChild(icon);
      container.appendChild(link);
      hasLinks = true;
    });
    container.hidden = !hasLinks;
  }

  function updateCardContent(card, member) {
    if (!card) return;
    card.id = member.domId;
    card.dataset.id = member.id != null ? String(member.id) : member.key;
    const img = card.querySelector(".team-card__image");
    if (img) {
      img.alt = `Foto de ${member.nome}`;
      img.setAttribute("data-light", member.avatarLight);
      img.setAttribute("data-dark", member.avatarDark || member.avatarLight);
      img.src = isLightTheme()
        ? member.avatarLight || member.avatarDark || DEFAULT_AVATAR_LIGHT
        : member.avatarDark || member.avatarLight || DEFAULT_AVATAR_DARK;
    }
    const nameEl = card.querySelector(".team-card__name");
    if (nameEl) nameEl.textContent = member.nome;
    const rolesEl = card.querySelector(".team-card__roles");
    if (rolesEl) rolesEl.textContent = member.roles;
    const bioEl = card.querySelector(".team-card__bio");
    if (bioEl) bioEl.textContent = member.about;
    const social = card.querySelector(".team-card__social");
    if (social) {
      renderSocialIcons(social, member.socials);
    }
    const cta = card.querySelector(".team-card__cta");
    if (cta) {
      if (member.journalistUrl) {
        cta.href = member.journalistUrl;
        cta.removeAttribute("aria-disabled");
        cta.tabIndex = 0;
      } else {
        cta.href = "#";
        cta.setAttribute("aria-disabled", "true");
        cta.tabIndex = -1;
      }
    }
  }

  function appendMember(slider, member) {
    if (!member) return;
    const existing =
      member.id != null
        ? slider.querySelector(`[data-id="${member.id}"]`)
        : slider.querySelector(`#${member.domId}`);
    if (existing) {
      updateCardContent(existing, member);
      renderedKeys.add(member.key);
      return;
    }
    if (renderedKeys.has(member.key)) return;
    const card = createTeamCard(member);
    slider.appendChild(card);
    renderedKeys.add(member.key);
  }

  function renderMembers(slider, items) {
    if (!Array.isArray(items)) return;
    items.forEach((raw) => {
      const normalized = normalizeMember(raw);
      appendMember(slider, normalized);
    });
  }

  function notifyUpdate(slider) {
    slider.dispatchEvent(
      new CustomEvent("team:updated", { bubbles: false, cancelable: false })
    );
  }

  async function fetchTeam(slider) {
    try {
      const response = await fetch(TEAM_ENDPOINT, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) return;
      // Ordena os membros por ID crescente antes de renderizar. O valor de ID
      // pode vir como string; convertemos para número para comparação.
      const sorted = [...data].sort((a, b) => {
        const idA = a?.id != null ? Number(a.id) : 0;
        const idB = b?.id != null ? Number(b.id) : 0;
        return idA - idB;
      });
      renderMembers(slider, sorted);
    } catch (err) {
      console.warn(err?.message || "Falha ao carregar equipe din\u00e2mica.");
    } finally {
      notifyUpdate(slider);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const slider = document.getElementById("team-slider");
    if (!slider) return;
    slider.innerHTML = "";
    renderMembers(slider);
    notifyUpdate(slider);
    fetchTeam(slider);
  });
})();
