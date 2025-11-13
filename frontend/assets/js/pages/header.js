window.responsiveLogoHandler = window.responsiveLogoHandler || function () {};
document.addEventListener("DOMContentLoaded", () => {
  const wrap = document.querySelector("[data-search]");
  // input de busca global (barra de busca no cabeçalho)
  const input = document.getElementById("search-bar");
  // contêiner para as sugestões do autocomplete
  const suggestionsBox = document.getElementById("search-suggestions");
  // backdrop para escurecer a página durante o autocomplete (modo mobile)
  const overlayEl = document.getElementById("search-backdrop");

  // Busca via API: não utilizamos dados locais ou fallback para autocomplete.

  /**
   * Renderiza as sugestões de busca dentro do contêiner do autocomplete.
   * Cada item exibe thumbnail, título, categoria e data com ícone.
   * Se não houver itens, mostra uma mensagem de “Nenhum resultado”.
   *
   * @param {Array} items
   */
  function renderSuggestions(items) {
    if (!suggestionsBox) return;
    if (!Array.isArray(items) || !items.length) {
      suggestionsBox.innerHTML = `<div class="suggestion-item" aria-disabled="true" style="grid-template-columns:1fr;"><div class="suggestion-title">Nenhum resultado</div></div>`;
      suggestionsBox.hidden = false;
      // exibe o overlay mesmo quando não há resultados (lista vazia) para evitar conflito visual
      if (overlayEl) overlayEl.hidden = false;
      return;
    }
    const rows = items
      .map((item) => {
        const imageSrc = item.image || "../assets/img/placeholder.jpg";
        // Tenta formatar a data para pt-BR curto (DD/MM/AAAA). Se houver util disponível, usa-o.
        let dateLabel = "";
        const rawDate = item.date || "";
        try {
          if (window.formatDatePtBrShort) {
            dateLabel = window.formatDatePtBrShort(rawDate);
          } else if (rawDate) {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) {
              dateLabel = d.toLocaleDateString("pt-BR");
            } else {
              dateLabel = rawDate;
            }
          }
        } catch (_) {
          dateLabel = rawDate;
        }
        const urlSlug = item.slug
          ? encodeURIComponent(item.slug)
          : encodeURIComponent(item.id);
        const href = item.slug
          ? `/noticia/${urlSlug}`
          : `/noticia?id=${urlSlug}`;
        return `
      <a class="suggestion-item" role="option" href="${href}">
        <img class="suggestion-thumb" src="${imageSrc}" alt="">
        <div class="suggestion-content">
          <div class="suggestion-title">${item.title || ""}</div>
          <div class="suggestion-meta">
            <span class="suggestion-category">${item.category || ""}</span>
            <span class="suggestion-date">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
                <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1.5" />
                <line x1="8" y1="3" x2="8" y2="7" stroke="currentColor" stroke-width="1.5" />
                <line x1="16" y1="3" x2="16" y2="7" stroke="currentColor" stroke-width="1.5" />
              </svg>
              ${dateLabel}
            </span>
          </div>
        </div>
      </a>
    `;
      })
      .join("");
    suggestionsBox.innerHTML = rows;
    suggestionsBox.hidden = false;
    // mostra o overlay quando há sugestões
    if (overlayEl) overlayEl.hidden = false;
  }

  /**
   * Executa a busca de publicações via API para o termo fornecido e renderiza
   * até 6 resultados. Quando o termo tem menos de 2 caracteres, limpa o
   * contêiner e o esconde.
   *
   * @param {string} q
   */
  async function doSearch(q) {
    if (!suggestionsBox || !input) return;
    const term = String(q || "").trim();
    if (!term || term.length < 2) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = "";
      // esconde o overlay quando o termo não é suficiente
      if (overlayEl) overlayEl.hidden = true;
      return;
    }
    try {
      const url = `/api/busca?q=${encodeURIComponent(term)}&limit=6`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Falha na busca");
      const data = await response.json();
      renderSuggestions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = "";
      if (overlayEl) overlayEl.hidden = true;
    }
  }

  let searchDebounce;
  input?.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      doSearch(value);
    }, 150);
  });

  // Fecha o autocomplete ao clicar fora do campo de busca ou da lista
  document.addEventListener("click", (e) => {
    if (!suggestionsBox) return;
    if (!wrap?.contains(e.target)) {
      suggestionsBox.hidden = true;
      if (overlayEl) overlayEl.hidden = true;
    }
  });

  // Trata teclas especiais: Escape fecha a lista; Enter envia para a página de resultados
  input?.addEventListener("keydown", (e) => {
    if (!suggestionsBox) return;
    if (e.key === "Escape") {
      suggestionsBox.hidden = true;
      input.blur();
      if (overlayEl) overlayEl.hidden = true;
    } else if (e.key === "Enter") {
      // Redireciona para a página de busca completa
      e.preventDefault();
      const term = String(input.value || "").trim();
      if (term) {
        const url = `/busca?q=${encodeURIComponent(term)}`;
        window.location.href = url;
      }
    }
  });

  const root = document.documentElement;
  const KEY = "theme";

  const saved = localStorage.getItem(KEY);
  if (saved === "light") {
    root.setAttribute("data-theme", "light");
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="toggle-theme"]');
    if (!btn) return;
    const isLight = root.getAttribute("data-theme") === "light";
    if (isLight) {
      root.removeAttribute("data-theme");
      localStorage.removeItem(KEY);
      btn.setAttribute("aria-pressed", "false");
    } else {
      root.setAttribute("data-theme", "light");
      localStorage.setItem(KEY, "light");
      btn.setAttribute("aria-pressed", "true");
    }
  });

  const updateThemeLogos = () => {
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    document.querySelectorAll("img[data-light][data-dark]").forEach((img) => {
      const target = isLight
        ? img.getAttribute("data-light")
        : img.getAttribute("data-dark");
      if (target) img.setAttribute("src", target);
    });
  };

  updateThemeLogos();

  const mo = new MutationObserver(() => updateThemeLogos());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="toggle-theme"]')) {
      setTimeout(updateThemeLogos, 0);
    }
  });

  responsiveLogoHandler();
  window.addEventListener("resize", responsiveLogoHandler);

  const menuToggle = document.querySelector('[data-action="toggle-menu"]');
  const headerNav = document.querySelector(".header-nav");
  const navList = document.getElementById("header-menu-list");
  const mq = window.matchMedia("(max-width: 1280px)");
  let submenuTrigger = document.querySelector(".submenu-btn");
  let submenuPanel = document.querySelector(".submenu");
  let submenuItem = submenuTrigger?.closest(".menu-item.has-submenu") || null;

  const syncSubmenuHeight = () => {
    if (!submenuPanel) return;
    if (!mq.matches) {
      submenuPanel.style.removeProperty("max-height");
      submenuPanel.style.removeProperty("opacity");
      submenuPanel.style.removeProperty("transform");
      submenuPanel.style.removeProperty("pointer-events");
      return;
    }
    const expanded = submenuItem?.classList.contains("is-open");
    const readHeight = () => {
      const prev = submenuPanel.style.maxHeight;
      submenuPanel.style.maxHeight = "none";
      const size = submenuPanel.scrollHeight;
      submenuPanel.style.maxHeight = prev;
      return size;
    };
    if (expanded) {
      submenuPanel.style.maxHeight = `${readHeight()}px`;
      submenuPanel.style.opacity = "1";
      submenuPanel.style.transform = "translateY(0)";
      submenuPanel.style.pointerEvents = "auto";
    } else {
      submenuPanel.style.maxHeight = "0px";
      submenuPanel.style.opacity = "0";
      submenuPanel.style.transform = "translateY(-8px)";
      submenuPanel.style.pointerEvents = "none";
    }
  };

  const closeMobileSubmenu = () => {
    if (submenuItem) submenuItem.classList.remove("is-open");
    if (submenuTrigger) submenuTrigger.setAttribute("aria-expanded", "false");
    syncSubmenuHeight();
  };

  const closeMenu = () => {
    if (!menuToggle || !headerNav) return;
    menuToggle.setAttribute("aria-expanded", "false");
    headerNav.classList.remove("header-nav--open");
    document.body.classList.remove("header-menu-open");
    closeMobileSubmenu();
  };

  const openMenu = () => {
    if (!menuToggle || !headerNav) return;
    menuToggle.setAttribute("aria-expanded", "true");
    headerNav.classList.add("header-nav--open");
    document.body.classList.add("header-menu-open");
  };

  menuToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    if (isOpen) closeMenu();
    else openMenu();
  });

  navList?.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link) closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!menuToggle || !headerNav) return;
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    if (!isOpen) return;
    if (
      !headerNav.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const handleBreakpointChange = (event) => {
    if (!event.matches) {
      closeMenu();
    } else {
      closeMobileSubmenu();
    }
    syncSubmenuHeight();
  };

  if (mq.addEventListener)
    mq.addEventListener("change", handleBreakpointChange);
  else if (mq.addListener) mq.addListener(handleBreakpointChange);

  document.addEventListener("header:close-menu", closeMenu);

  function updateMenuTop() {
    const headerBg = document.querySelector(".header-bg");
    const nav = document.querySelector(".header-nav");
    if (!headerBg || !nav) return;

    const computed = window.getComputedStyle(nav);
    if (computed.position !== "fixed") {
      nav.style.top = "";
      return;
    }
    const rect = headerBg.getBoundingClientRect();

    const offset = rect.bottom + 16;
    nav.style.top = offset + "px";
  }

  updateMenuTop();
  window.addEventListener("resize", updateMenuTop);
  window.addEventListener("resize", syncSubmenuHeight);

  closeMobileSubmenu();

  const handleSubmenuToggle = (event) => {
    if (!submenuTrigger || !submenuItem) return;
    if (!mq.matches) return;
    event.preventDefault();
    const isOpen = submenuItem.classList.toggle("is-open");
    submenuTrigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (!isOpen) {
      submenuTrigger.blur();
    }
    syncSubmenuHeight();
  };

  const setDesktopSubmenuState = (expanded) => {
    if (!submenuTrigger) return;
    if (mq.matches) return;
    submenuTrigger.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const initResponsiveSubmenu = () => {
    const trigger = document.querySelector(".submenu-btn");
    const item = trigger?.closest(".menu-item.has-submenu") || null;
    const panel = item?.querySelector(".submenu") || null;
    if (!trigger || !panel || !item) return false;

    submenuTrigger = trigger;
    submenuPanel = panel;
    submenuItem = item;

    if (!trigger.dataset.submenuReady) {
      trigger.dataset.submenuReady = "true";
      trigger.addEventListener("click", handleSubmenuToggle);
      trigger.addEventListener("focus", () => setDesktopSubmenuState(true));
      trigger.addEventListener("blur", () => setDesktopSubmenuState(false));
      panel.addEventListener("mouseenter", () =>
        setDesktopSubmenuState(true)
      );
      panel.addEventListener("mouseleave", () =>
        setDesktopSubmenuState(false)
      );
    }

    syncSubmenuHeight();
    return true;
  };

  if (!initResponsiveSubmenu()) {
    const observer = new MutationObserver(() => {
      if (initResponsiveSubmenu()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
});

(function () {
  function handleToggle(event) {
    const btn = event.target.closest('[data-action="toggle-menu"]');
    if (!btn) return;

    event.preventDefault();
    const nav = document.querySelector(".header-nav");
    if (!nav) return;
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      btn.setAttribute("aria-expanded", "false");
      nav.classList.remove("header-nav--open");
      document.body.classList.remove("header-menu-open");
    } else {
      btn.setAttribute("aria-expanded", "true");
      nav.classList.add("header-nav--open");
      document.body.classList.add("header-menu-open");

      const computed = window.getComputedStyle(nav);
      if (computed.position === "fixed") {
        const headerBg = document.querySelector(".header-bg");
        if (headerBg) {
          const rect = headerBg.getBoundingClientRect();
          const offset = rect.bottom + 16;
          nav.style.top = offset + "px";
        }
      }
    }
  }

  function handleDocumentClick(event) {
    const nav = document.querySelector(".header-nav");
    const btn = document.querySelector('[data-action="toggle-menu"]');
    if (!nav || !btn) return;
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    if (!isOpen) return;

    if (event.target.closest("#header-menu-list a")) {
      btn.setAttribute("aria-expanded", "false");
      nav.classList.remove("header-nav--open");
      document.body.classList.remove("header-menu-open");
      return;
    }

    if (!nav.contains(event.target) && !btn.contains(event.target)) {
      btn.setAttribute("aria-expanded", "false");
      nav.classList.remove("header-nav--open");
      document.body.classList.remove("header-menu-open");
    }
  }

  function handleKeyDown(event) {
    if (event.key !== "Escape") return;
    const nav = document.querySelector(".header-nav");
    const btn = document.querySelector('[data-action="toggle-menu"]');
    if (!nav || !btn) return;
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    if (!isOpen) return;
    btn.setAttribute("aria-expanded", "false");
    nav.classList.remove("header-nav--open");
    document.body.classList.remove("header-menu-open");
  }

  function handleResize() {
    const nav = document.querySelector(".header-nav");
    const btn = document.querySelector('[data-action="toggle-menu"]');
    if (!nav || !btn) return;

    if (window.innerWidth >= 1280) {
      btn.setAttribute("aria-expanded", "false");
      nav.classList.remove("header-nav--open");
      document.body.classList.remove("header-menu-open");
    }
  }

  document.addEventListener("click", handleToggle);
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", handleResize);
})();

// Inicialização assíncrona da barra de busca com autocomplete
// -----------------------------------------------------------
// O cabeçalho (incluindo o campo de busca) é injetado via include.js de
// maneira assíncrona. Isso significa que quando este script é executado
// inicialmente, #search-bar e #search-suggestions podem não existir no
// documento. Para garantir que o autocomplete funcione mesmo assim,
// definimos uma rotina que tenta ligar os eventos assim que os
// elementos estiverem presentes. Se eles não forem encontrados de
// imediato, um intervalo temporário é utilizado para verificar
// periodicamente por até 5 segundos.
(() => {
  function initSearchAutocomplete() {
    const wrap = document.querySelector("[data-search]");
    const input = document.getElementById("search-bar");
    const suggestionsBox = document.getElementById("search-suggestions");
    const overlay = document.getElementById("search-backdrop");
    if (!wrap || !input || !suggestionsBox) return false;
    // Evita registrar handlers múltiplos no mesmo elemento
    if (input._autocompleteInit) return true;
    input._autocompleteInit = true;

    function renderSuggestions(items) {
      if (!suggestionsBox) return;
      if (!Array.isArray(items) || !items.length) {
        suggestionsBox.innerHTML = `<div class="suggestion-item" aria-disabled="true" style="grid-template-columns:1fr;"><div class="suggestion-title">Nenhum resultado</div></div>`;
        suggestionsBox.hidden = false;
        // Exibe o backdrop quando há lista de resultados (mesmo "Nenhum resultado")
        if (overlay) overlay.hidden = false;
        return;
      }
      const rows = items
        .map((item) => {
          const imageSrc = item.image || "../assets/img/placeholder.jpg";
          let dateLabel = "";
          const rawDate = item.date || "";
          try {
            if (window.formatDatePtBrShort) {
              dateLabel = window.formatDatePtBrShort(rawDate);
            } else if (rawDate) {
              const d = new Date(rawDate);
              if (!isNaN(d.getTime())) {
                dateLabel = d.toLocaleDateString("pt-BR");
              } else {
                dateLabel = rawDate;
              }
            }
          } catch (_) {
            dateLabel = rawDate;
          }
          const urlSlug = item.slug
            ? encodeURIComponent(item.slug)
            : encodeURIComponent(item.id);
          const href = item.slug
            ? `/noticia/${urlSlug}`
            : `/noticia?id=${urlSlug}`;
          return `
      <a class="suggestion-item" role="option" href="${href}">
        <img class="suggestion-thumb" src="${imageSrc}" alt="">
        <div class="suggestion-content">
          <div class="suggestion-title">${item.title || ""}</div>
          <div class="suggestion-meta">
            <span class="suggestion-category">${item.category || ""}</span>
            <span class="suggestion-date">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"></rect>
                <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1.5"></line>
                <line x1="8" y1="3" x2="8" y2="7" stroke="currentColor" stroke-width="1.5"></line>
                <line x1="16" y1="3" x2="16" y2="7" stroke="currentColor" stroke-width="1.5"></line>
              </svg>
              ${dateLabel}
            </span>
          </div>
        </div>
      </a>
    `;
        })
        .join("");
      suggestionsBox.innerHTML = rows;
      suggestionsBox.hidden = false;
      // Exibe o backdrop para escurecer o restante da página
      if (overlay) overlay.hidden = false;
    }

    async function doSearch(q) {
      if (!suggestionsBox || !input) return;
      const term = String(q || "").trim();
      if (!term || term.length < 2) {
        suggestionsBox.hidden = true;
        suggestionsBox.innerHTML = "";
        if (overlay) overlay.hidden = true;
        return;
      }
      try {
        const url = `/api/busca?q=${encodeURIComponent(term)}&limit=6`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Falha na busca");
        const data = await response.json();
        renderSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        suggestionsBox.hidden = true;
        suggestionsBox.innerHTML = "";
        if (overlay) overlay.hidden = true;
      }
    }

    let searchDebounce;
    input.addEventListener("input", (e) => {
      clearTimeout(searchDebounce);
      const value = e.target.value;
      searchDebounce = setTimeout(() => {
        doSearch(value);
      }, 150);
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) {
        suggestionsBox.hidden = true;
        if (overlay) overlay.hidden = true;
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        suggestionsBox.hidden = true;
        input.blur();
        if (overlay) overlay.hidden = true;
      } else if (e.key === "Enter") {
        e.preventDefault();
        const term = String(input.value || "").trim();
        if (term) {
          const url = `/busca?q=${encodeURIComponent(term)}`;
          window.location.href = url;
        }
      }
    });
    return true;
  }
  if (!initSearchAutocomplete()) {
    const intervalId = setInterval(() => {
      if (initSearchAutocomplete()) {
        clearInterval(intervalId);
      }
    }, 100);
    setTimeout(() => clearInterval(intervalId), 5000);
  }
})();
