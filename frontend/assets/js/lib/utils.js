(function () {
  if (!window.__SITE_BASE_URL__) {
    window.__SITE_BASE_URL__ = "https://www.thelastupdate.com.br";
  }
  const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DATE_TIME_NO_TZ_RE =
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/;
  const LONG_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const SHORT_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  function parseISODatePreservingUTC(iso) {
    if (!iso && iso !== 0) return null;
    if (iso instanceof Date && !Number.isNaN(iso.getTime())) return iso;

    if (typeof iso === "number") {
      const fromNumber = new Date(iso);
      return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
    }

    if (typeof iso !== "string") return null;

    const value = iso.trim();
    if (!value) return null;

    let match = DATE_ONLY_RE.exec(value);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }

    match = DATE_TIME_NO_TZ_RE.exec(value);
    if (match) {
      const [, year, month, day, hour, minute, second = "0"] = match;
      return new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        )
      );
    }

    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      const fallback = new Date(value);
      return Number.isNaN(fallback.getTime()) ? null : fallback;
    }
    return parsed;
  }

  function formatDatePtBr(iso) {
    const date = parseISODatePreservingUTC(iso);
    return date ? LONG_FORMATTER.format(date) : iso || "";
  }

  function formatDatePtBrShort(iso) {
    const date = parseISODatePreservingUTC(iso);
    return date ? SHORT_FORMATTER.format(date) : iso || "";
  }

  function clampToLines(el, maxLines = 3) {
    if (!el) return;
    const original = el.dataset.fulltext ?? el.textContent ?? "";
    el.dataset.fulltext = original;
    el.textContent = original.trim();
    const style = getComputedStyle(el);
    const lh = parseFloat(style.lineHeight);
    if (!lh || !original) return;
    const lines = () => Math.round(el.getBoundingClientRect().height / lh);
    if (lines() <= maxLines) return;
    const text = original.trim();
    let lo = 0,
      hi = text.length,
      best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      el.textContent = text.slice(0, mid) + "…";
      if (lines() <= maxLines) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    let clipped = text.slice(0, best).replace(/\s+\S*$/, "");
    el.textContent = clipped + "…";
  }

  window.TLU_LOADING_MS = 3000;

  const modalController = (function () {
    const ICONS = {
      success:
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5L9.5 17L19 7.5" stroke="var(--color-darkwhite)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error:
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 8L16 16M16 8L8 16" stroke="var(--color-darkwhite)" stroke-width="2" stroke-linecap="round"/></svg>',
      info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 7.5V7.6M12 10.5V16.5" stroke="var(--color-darkwhite)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="var(--color-darkwhite)" stroke-width="1.5"/></svg>',
    };

    let elements = null;
    let hideTimer = null;
    let hideTransitionTimer = null;

    function ensureElements() {
      if (elements) return elements;
      if (!document || !document.body) return null;

      const overlay = document.createElement("div");
      overlay.className = "tl-modal";
      overlay.dataset.variant = "";
      overlay.setAttribute("aria-hidden", "true");
      overlay.setAttribute("role", "presentation");
      overlay.innerHTML = `
        <div class="tl-modal__box" role="dialog" aria-modal="true">
          <div class="tl-modal__icon">
            <span class="tl-modal__spinner" aria-hidden="true"></span>
            <span class="tl-modal__symbol" aria-hidden="true"></span>
          </div>
          <p class="tl-modal__message btn-md"></p>
          <div class="tl-modal__progress"><span></span></div>
        </div>
      `;
      document.body.appendChild(overlay);

      const spinner = overlay.querySelector(".tl-modal__spinner");
      const symbol = overlay.querySelector(".tl-modal__symbol");
      const message = overlay.querySelector(".tl-modal__message");
      const progress = overlay.querySelector(".tl-modal__progress span");

      elements = { overlay, spinner, symbol, message, progress };
      return elements;
    }

    function iconMarkup(type) {
      if (type && ICONS[type]) return ICONS[type];
      return ICONS.info;
    }

    function startProgress(duration, loop) {
      const refs = elements || ensureElements();
      if (!refs || !refs.progress) return;
      const bar = refs.progress;
      bar.style.animation = "none";
      void bar.offsetWidth;
      if (loop) {
        bar.style.animation = "tl-modal-progress-loop 1400ms linear infinite";
      } else {
        bar.style.animation = `tl-modal-progress ${duration}ms linear forwards`;
      }
    }

    function showModal(config) {
      const refs = ensureElements();
      if (!refs || !refs.overlay) return;

      const options = config || {};
      const type = options.type || "info";
      const message = options.message || "";
      const normalizedDuration = Number(options.duration);
      const duration =
        Number.isFinite(normalizedDuration) && normalizedDuration > 0
          ? normalizedDuration
          : 3600;
      const autoClose = options.autoClose !== false;
      const spinner = Boolean(options.spinner);

      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      if (hideTransitionTimer) {
        clearTimeout(hideTransitionTimer);
        hideTransitionTimer = null;
      }

      refs.overlay.dataset.variant = type;
      refs.overlay.setAttribute("aria-hidden", "false");
      refs.overlay.classList.add("is-visible");
      refs.overlay.classList.remove("is-hiding");

      if (refs.message) refs.message.textContent = message;

      if (refs.spinner) {
        refs.spinner.hidden = !spinner;
        refs.spinner.classList.toggle("is-active", spinner);
      }

      if (refs.symbol) {
        refs.symbol.hidden = spinner;
        if (!spinner) refs.symbol.innerHTML = iconMarkup(type);
      }

      startProgress(duration, !autoClose);

      if (autoClose) {
        hideTimer = window.setTimeout(() => hideModal(), duration);
      }
    }

    function hideModal(immediate) {
      if (!elements || !elements.overlay) return;

      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      if (hideTransitionTimer) {
        clearTimeout(hideTransitionTimer);
        hideTransitionTimer = null;
      }

      const finish = () => {
        if (!elements || !elements.overlay) return;
        elements.overlay.classList.remove("is-visible");
        elements.overlay.classList.remove("is-hiding");
        elements.overlay.setAttribute("aria-hidden", "true");
        elements.overlay.dataset.variant = "";
        if (elements.spinner) {
          elements.spinner.hidden = true;
          elements.spinner.classList.remove("is-active");
        }
        if (elements.symbol) elements.symbol.innerHTML = "";
        if (elements.progress) elements.progress.style.animation = "none";
      };

      if (immediate) {
        finish();
        return;
      }

      elements.overlay.classList.add("is-hiding");
      hideTransitionTimer = window.setTimeout(finish, 220);
    }

    return {
      showLoading(message, opts) {
        const options = opts || {};
        const duration = options.duration ?? window.TLU_LOADING_MS;
        showModal({
          type: "loading",
          message: message || "Carregando...",
          duration,
          autoClose: options.autoClose ?? true,
          spinner: true,
        });
      },
      showStatus(opts) {
        const options = opts || {};
        showModal({
          type: options.type || "success",
          message: options.message || "",
          duration: options.duration,
          autoClose: options.autoClose ?? true,
          spinner: false,
        });
      },
      hide(immediate) {
        hideModal(Boolean(immediate));
      },
    };
  })();

  window.formatDatePtBr = formatDatePtBr;
  window.formatDatePtBrShort = formatDatePtBrShort;
  window.clampToLines = clampToLines;
  window.appModal = modalController;
})();

(() => {
  function initLegalAccordions() {
    const sections = Array.from(
      document.querySelectorAll(".legal-section .open")
    );
    if (!sections.length) return;

    const resizeObservers = [];

    function collapse(section, panel, header) {
      section.classList.remove("is-open");
      panel.style.maxHeight = "0px";
      panel.setAttribute("aria-hidden", "true");
      header.setAttribute("aria-expanded", "false");
    }

    function expand(section, panel, header) {
      section.classList.add("is-open");
      panel.style.maxHeight = `${panel.scrollHeight}px`;
      panel.setAttribute("aria-hidden", "false");
      header.setAttribute("aria-expanded", "true");
    }

    sections.forEach((section) => {
      const header = section.querySelector("h4");
      if (!header) return;

      let panel = section.querySelector(".open__content");
      if (!panel) {
        panel = document.createElement("div");
        panel.className = "open__content";
        const fragment = document.createDocumentFragment();
        let node = header.nextSibling;
        while (node) {
          const next = node.nextSibling;
          fragment.appendChild(node);
          node = next;
        }
        panel.appendChild(fragment);
        section.appendChild(panel);
      }

      panel.style.maxHeight = "0px";
      panel.setAttribute("aria-hidden", "true");

      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", "false");

      const toggle = () => {
        const isOpen = section.classList.contains("is-open");
        if (isOpen) {
          collapse(section, panel, header);
        } else {
          expand(section, panel, header);
        }
      };

      header.addEventListener("click", (event) => {
        event.preventDefault();
        toggle();
      });

      header.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });

      resizeObservers.push({ section, panel, header });
    });

    window.addEventListener("resize", () => {
      resizeObservers.forEach(({ section, panel }) => {
        if (!section.classList.contains("is-open")) return;
        panel.style.maxHeight = `${panel.scrollHeight}px`;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLegalAccordions);
  } else {
    initLegalAccordions();
  }
})();
