import { calcularTempoLeitura } from "../utils/calcularTempoLeitura.js";
import { createCardAnimator } from "../utils/cardAnimator.js";
import { createShowingCounter } from "../utils/showingCounter.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const READING_ICON_VIEWBOX = "0 0 24 24";

function createReadingIconElement() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", READING_ICON_VIEWBOX);
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "1.5");
  svg.appendChild(circle);

  const hand = document.createElementNS(SVG_NS, "path");
  hand.setAttribute("d", "M12 7v5l3 2");
  hand.setAttribute("stroke", "currentColor");
  hand.setAttribute("stroke-width", "1.5");
  hand.setAttribute("stroke-linecap", "round");
  hand.setAttribute("stroke-linejoin", "round");
  svg.appendChild(hand);

  return svg;
}

function buildReadingTimeBadge(minutes, options = {}) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 1) return null;

  const { wrapperClasses = [], textClass = "" } = options;
  const wrapper = document.createElement("span");
  if (Array.isArray(wrapperClasses)) {
    wrapperClasses.forEach((cls) => {
      if (cls) wrapper.classList.add(cls);
    });
  }
  wrapper.dataset.readingMinutes = String(value);
  wrapper.setAttribute(
    "aria-label",
    `Tempo de leitura estimado: ${value} minuto${value > 1 ? "s" : ""}`
  );

  const icon = createReadingIconElement();
  wrapper.appendChild(icon);

  const textSpan = document.createElement("span");
  if (textClass) textSpan.classList.add(textClass);
  textSpan.textContent = `${value} min`;
  wrapper.appendChild(textSpan);

  return wrapper;
}

function applyReadingBadge(cardEl, minutes) {
  if (!cardEl) return;
  const existing = cardEl.querySelector(".post-card__reading-time");
  if (existing) existing.remove();
  if (!Number.isFinite(minutes) || minutes < 1) {
    delete cardEl.dataset.readingMinutes;
    return;
  }
  const badge = buildReadingTimeBadge(minutes, {
    wrapperClasses: ["card__category", "post-card__reading-time"],
    textClass: "post-card__reading-text",
  });
  if (!badge) return;
  cardEl.dataset.readingMinutes = String(minutes);
  cardEl.insertBefore(badge, cardEl.firstChild || null);
}

function extractExcerpt(content = "", maxWords = 20) {
  const plain = String(content)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const words = plain.split(/\s+/);
  const excerptWords = words.slice(0, maxWords);
  return excerptWords.join(" ") + (words.length > maxWords ? "…" : "");
}

function createCard(item) {
  const art = document.createElement("article");
  art.className = "post-card hover-card";
  if (item.id != null) art.dataset.articleId = item.id;
  if (item.category) art.dataset.category = item.category;

  // Determina URL da notícia
  const slugEncoded = item.slug
    ? encodeURIComponent(item.slug)
    : encodeURIComponent(item.id);
  const href = item.slug
    ? `/noticia/${slugEncoded}`
    : `/noticia?id=${slugEncoded}`;

  const imageSrc = item.image || "../assets/img/placeholder.jpg";
  const title = item.title || "";
  const dateISO = item.date || "";
  let dateLabel = dateISO;
  try {
    if (window.formatPublicationDate) {
      dateLabel = window.formatPublicationDate(dateISO, { style: "long" });
    } else if (window.formatDatePtBr) {
      dateLabel = window.formatDatePtBr(dateISO);
    }
  } catch (_) {}

  const excerpt = extractExcerpt(item.content || "", 25);
  const authorName = (item.author && item.author.name) || "";
  // Usa avatar_light como padrão; se estiver em modo claro/escuro, o CSS trocará as cores.
  const avatarUrl =
    (item.author && (item.author.avatar_light || item.author.avatar_dark)) ||
    "";

  art.innerHTML = `
    <a class="post-card__image-link" href="${href}">
      <img loading="lazy" alt="${title}" src="${imageSrc}">
    </a>
    <div class="post-card__topline">
      <time class="post-card__date btn-sm" datetime="${dateISO}">${dateLabel}</time>
      <span class="post-card__category btn-sm box-grad">${
        item.category || ""
      }</span>
    </div>
    <h5 class="post-card__title"><a href="${href}">${title}</a></h5>
    <p class="post-card__excerpt body-lg">${excerpt}</p>
    <div class="post-card__meta">
      <div class="post-card__perfil">
        <img class="post-card__avatar" loading="lazy" alt="Foto de ${authorName}" src="${avatarUrl}">
        <span class="post-card__author btn-sm">${authorName}</span>
      </div>
      <a class="post-card__cta btn-lg" href="${href}">
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
  // Aplica o badge de tempo de leitura usando a propriedade retornada pela API
  applyReadingBadge(art, item.readingMinutes);

  // Torna o nome do autor clicável, redirecionando para a página do jornalista
  try {
    const authorEl = art.querySelector(".post-card__author");
    if (authorEl) {
      authorEl.style.cursor = "pointer";
      authorEl.addEventListener("click", (event) => {
        event.preventDefault();
        const name = item && item.author && item.author.name;
        const id = item && item.author && (item.author.id ?? item.author_id);
        if (!name) return;
        const params = new URLSearchParams();
        params.set("name", name);
        if (id != null) params.set("id", id);
        window.location.href = `/jornalista?${params.toString()}`;
      });
    }
  } catch (err) {
    // falha silenciosa caso haja algum problema ao anexar o evento
  }
  return art;
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const term = params.get("q") || "";
  const termDisplay = document.getElementById("busca-termo");
  const termEmpty = document.getElementById("busca-empty-term");
  const listEl = document.getElementById("busca-list");
  const emptyEl = document.getElementById("busca-empty");
  const backBtn = document.getElementById("busca-back");
  const footerEl = document.getElementById("busca-footer");
  const counterEl = document.getElementById("busca-counter");
  const loadMoreBtn = document.getElementById("busca-load-more");
  const cardAnimator = createCardAnimator(listEl, {
    mediaQuery: "(max-width: 1199px)",
  });
  const updateCounter = createShowingCounter(counterEl);
  updateCounter(0, 0);
  const state = {
    items: [],
    page: 1,
    pageSize: 9,
  };

  const hideResults = () => {
    if (listEl) listEl.innerHTML = "";
    state.items = [];
    state.page = 1;
    updateCounter(0, 0);
    if (footerEl) footerEl.hidden = true;
    if (loadMoreBtn) {
      loadMoreBtn.hidden = true;
      loadMoreBtn.disabled = true;
    }
    if (cardAnimator) cardAnimator.refresh();
  };

  const showEmpty = () => {
    if (emptyEl) emptyEl.hidden = false;
    hideResults();
  };

  const hideEmpty = () => {
    if (emptyEl) emptyEl.hidden = true;
  };

  const renderResults = (append = false) => {
    if (!listEl) return;
    const total = state.items.length;
    if (!append) {
      listEl.innerHTML = "";
    }
    if (!total) {
      updateCounter(0, 0);
      if (footerEl) footerEl.hidden = true;
      if (loadMoreBtn) {
        loadMoreBtn.hidden = true;
        loadMoreBtn.disabled = true;
      }
      return;
    }
    const end = Math.min(state.page * state.pageSize, total);
    const startSlice = append ? (state.page - 1) * state.pageSize : 0;
    const fragment = document.createDocumentFragment();
    state.items.slice(startSlice, end).forEach((item) => {
      const card = createCard(item);
      fragment.appendChild(card);
    });
    listEl.appendChild(fragment);
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
  };

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      state.page += 1;
      renderResults(true);
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }
  if (termDisplay) termDisplay.textContent = term;
  if (termEmpty) termEmpty.textContent = term;
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) {
    showEmpty();
    return;
  }
  try {
    const url = `/api/busca?q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Erro na busca");
    const data = await res.json();
    const items = Array.isArray(data) ? data : [];
    if (!items.length) {
      showEmpty();
      return;
    }
    hideEmpty();
    state.items = items.map((item) => {
      if (!item.readingMinutes && item.content) {
        item.readingMinutes = calcularTempoLeitura(item.content);
      }
      return item;
    });
    state.page = 1;
    renderResults(false);
  } catch (err) {
    console.error(err);
    showEmpty();
  }
});
