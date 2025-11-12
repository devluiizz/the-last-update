import { calcularTempoLeitura } from "../utils/calcularTempoLeitura.js";
import { createShowingCounter } from "../utils/showingCounter.js";

const API_BASE = (window.__API_BASE__ || "/api").replace(/\/$/, "");

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

function createDurationIconElement() {
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

function setTruncatedAuthorName(el, fullName) {
  if (!el) return;
  const name = String(fullName || "").trim();
  // Split into parts (names) on spaces and filter out empty strings.
  const parts = name.split(/\s+/).filter(Boolean);
  // Determine candidate names: first + surname and then just first name.
  const firstName = parts[0] || "";
  const firstSurname = parts[1] || "";
  const candidates = [];
  if (firstName && firstSurname) {
    candidates.push(`${firstName} ${firstSurname}`);
  }
  if (firstName) {
    candidates.push(firstName);
  }
  // Always include the full name as the last fallback.
  if (name) candidates.push(name);
  // Try assigning each candidate and test for overflow. Once one fits, stop.
  function applyCandidate(index) {
    const candidate = candidates[index] || "";
    el.textContent = candidate;
    // Wait for layout to update before checking overflow.
    requestAnimationFrame(() => {
      const overflow = el.scrollWidth > el.clientWidth;
      if (!overflow || index === candidates.length - 1) {
        return;
      }
      // Try the next candidate
      applyCandidate(index + 1);
    });
  }
  applyCandidate(0);
}

function buildDurationBadge(durationStr) {
  if (!durationStr) return null;
  const wrapper = document.createElement("span");
  wrapper.classList.add("post-card__duration");
  // create clock icon
  const icon = createDurationIconElement();
  wrapper.appendChild(icon);
  // text
  const textSpan = document.createElement("span");
  textSpan.classList.add("duration-text");
  textSpan.textContent = durationStr;
  wrapper.appendChild(textSpan);
  return wrapper;
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

function normalizeReadingChunk(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.includes("<")) {
    const tmp = document.createElement("div");
    tmp.innerHTML = trimmed;
    const text = (tmp.textContent || tmp.innerText || "").trim();
    return text;
  }
  return trimmed;
}

function extractReadingText(source) {
  if (!source) return "";
  const candidates = [
    source.content,
    source.contentHtml,
    source.content_html,
    source.contentPlain,
    source.content_plain,
    source.body,
    source.body_text,
    source.fullContent,
    source.full_text,
    source.description,
    source.resume,
    source.excerpt,
    source.summary,
    source.text,
    source.preview,
    source.subtitle,
    source.title,
  ];
  const parts = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeReadingChunk(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    parts.push(normalized);
  }
  return parts.join(" ");
}

(() => {
  const MOCK_FEATURED = {
    main: null,
    rightTop: null,
    rightBottom: null,
    video: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  function renderFeaturedCategory(catEl, label, minutes) {
    if (!catEl) return;
    catEl.textContent = "";
    if (label) {
      const labelSpan = document.createElement("span");
      labelSpan.className = "card__category-text";
      labelSpan.textContent = label;
      catEl.appendChild(labelSpan);
      catEl.dataset.categoryLabel = label;
    } else {
      delete catEl.dataset.categoryLabel;
    }

    const badge = buildReadingTimeBadge(minutes, {
      wrapperClasses: ["card__reading-time"],
      textClass: "card__reading-text",
    });
    if (badge) {
      catEl.dataset.readingMinutes = String(minutes);
      catEl.appendChild(badge);
    } else {
      delete catEl.dataset.readingMinutes;
    }
  }

  function pickAvatarUrl(author) {
    if (!author) return "";
    const prefersDark =
      document.documentElement.classList.contains("theme-dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return (
      (prefersDark ? author.avatar_dark : author.avatar_light) ||
      author.avatar_light ||
      author.avatar_dark ||
      author.avatarUrl ||
      ""
    );
  }

  function articleLink(pub) {
    if (pub && pub.slug) return `/noticia/${encodeURIComponent(pub.slug)}`;
    if (pub && pub.id != null)
      return `/noticia?id=${encodeURIComponent(pub.id)}`;
    return "#";
  }

  function normalizeArticles(items) {
    items.forEach((it) => {
      if (!it.author) it.author = {};
      it.author._avatarLight =
        (it.author && it.author.avatar_light) || it.author_avatar_light || "";
      it.author._avatarDark =
        (it.author && it.author.avatar_dark) || it.author_avatar_dark || "";
      it.author.avatarUrl = pickAvatarUrl({
        avatar_light: it.author._avatarLight,
        avatar_dark: it.author._avatarDark,
        avatarUrl: it.author.avatarUrl,
      });
    });
    return items;
  }

  function enrichHighlightsWithAvatars(high, news) {
    const byId = new Map(news.map((n) => [String(n.id), n]));
    ["1", "2", "3"].forEach((k) => {
      const card = high[k];
      if (!card || !card.articleId) return;
      const found = byId.get(String(card.articleId));
      if (!found) return;
      if (found.author) {
        card.author = card.author || {};
        card.author.name = card.author.name || found.author.name || "";
        card.author.avatarUrl = found.author.avatarUrl || "";
      }
      const targetUrl = found.url || articleLink(found);
      if (targetUrl) card.url = targetUrl;
      if (found.slug) card.slug = found.slug;
    });
    return high;
  }

  function fillArticleCard(cardEl, data) {
    if (!cardEl || !data) return;

    cardEl.dataset.articleId = data.articleId || "";
    cardEl.dataset.category = data.category || "";

    const catEl = $('[data-field="category"]', cardEl);
    if (catEl) {
      const readingSource = extractReadingText(data);
      const minutes = calcularTempoLeitura(readingSource);
      renderFeaturedCategory(
        catEl,
        data.categoryLabel || data.category || "",
        minutes
      );
      if (Number.isFinite(minutes) && minutes > 0) {
        cardEl.dataset.readingMinutes = String(minutes);
      } else {
        delete cardEl.dataset.readingMinutes;
      }
      if (data.categoryLabel) {
        cardEl.dataset.categoryLabel = data.categoryLabel;
      } else {
        delete cardEl.dataset.categoryLabel;
      }
    }

    const img = $('[data-field="image"]', cardEl);
    const imgLink = $('[data-field="imageLink"]', cardEl);
    if (img) {
      img.src = data.imageUrl || "";
      img.alt = data.title || "";
    }
    if (imgLink) imgLink.href = data.url || "#";

    const titleLink = $('[data-field="titleLink"]', cardEl);
    if (titleLink) {
      titleLink.textContent = data.title || "";
      titleLink.href = data.url || "#";
    }

    const avatar = $('[data-field="authorAvatar"]', cardEl);
    const authorName = $('[data-field="authorName"]', cardEl);
    const dateEl = $('[data-field="date"]', cardEl);

    if (avatar) {
      avatar.src = (data.author && data.author.avatarUrl) || "";
      avatar.alt =
        data.author && data.author.name ? `Foto de ${data.author.name}` : "";
    }
    if (authorName) {
      const author = (data.author && data.author.name) || "";
      // Use a helper to truncate the author name so it doesn't break the layout.
      setTruncatedAuthorName(authorName, author);
      authorName.style.cursor = "pointer";
      authorName.addEventListener("click", (e) => {
        e.preventDefault();
        if (!author) return;
        const authorId =
          (data.author && data.author.id) ||
          data.author_id ||
          data.authorId ||
          null;
        const params = new URLSearchParams();
        params.set("name", author);
        if (authorId != null) params.set("id", authorId);
        window.location.href = `/jornalista?${params.toString()}`;
      });
    }
    if (dateEl) {
      dateEl.textContent = formatDatePtBr(data.dateISO);
      dateEl.dateTime = data.dateISO || "";
    }

    const excerptEl = $('[data-field="excerpt"]', cardEl);
    if (excerptEl) {
      excerptEl.textContent = data.excerpt || "";

      requestAnimationFrame(() => clampToLines(excerptEl, 4));
    }

    const cta = $('[data-field="cta"]', cardEl);
    if (cta) {
      const label = cta.querySelector(".card__cta-label");
      const text = data.ctaText || "Ler mais";
      if (label) {
        label.textContent = text;
      } else {
        cta.textContent = text;
      }
      cta.href = data.url || "#";
    }
  }

  async function fetchHighlights() {
    try {
      const res = await fetch("/api/public/highlights?limit=3", {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      });
      if (!res.ok) throw new Error("Erro ao carregar destaques");
      const highlights = await res.json();
      const entries = Array.isArray(highlights)
        ? highlights
        : Object.keys(highlights || {})
            .sort((a, b) => Number(a) - Number(b))
            .map((key) => {
              const value = highlights[key];
              if (!value) return null;
              return {
                cardNumber: Number(key),
                ...value,
              };
            });
      const result = {};
      entries.forEach((item, index) => {
        if (!item) return;
        const slotKey = String(
          item.cardNumber || item.card_number || index + 1
        );
        const parsed = parseCategory(item.category);
        const authorName =
          (item.author && item.author.name) || item.author_name || "";
        const authorAvatar = (item.author && item.author.avatarUrl) || "";
        const authorId =
          item.author && item.author.id != null
            ? item.author.id
            : item.author_id != null
            ? item.author_id
            : null;
        result[slotKey] = {
          articleId: item.id,
          category:
            parsed.category || parsed.categoryLabel || item.category || "",
          categoryLabel: parsed.categoryLabel || item.category || "",
          subcategory: parsed.subcategory || null,
          subcategoryLabel: parsed.subcategoryLabel || null,
          slug: item.slug || null,
          imageUrl: item.image || "",
          views: Number(item.views) || 0,
          url: articleLink(item),
          title: item.title || "",
          content: item.content || "",
          contentHtml: item.content_html || item.contentHtml || "",
          contentPlain: item.content_plain || item.contentPlain || "",
          description: item.description || "",
          excerpt: item.description || "",
          author: {
            id: authorId,
            name: authorName,
            avatarUrl: authorAvatar,
          },
          dateISO: item.date || "",
          ctaText: "Continue Lendo",
          isHighlighted: item.is_highlighted ? 1 : 0,
        };
      });
      return result;
    } catch (e) {
      console.error(e);
      return {};
    }
  }

  const API = API_BASE;
  const DEFAULT_YOUTUBE_CHANNEL_ID = "UCet4s_cF4TZ1jdagUbNoNpQ";
  function getYoutubeChannelId() {
    const configured = (window.YOUTUBE_CHANNEL_ID || "").trim();
    return configured || DEFAULT_YOUTUBE_CHANNEL_ID;
  }
  function slugifyCategory(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

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
  async function fetchNews() {
    try {
      const res = await fetch(`${API}/public/news?limit=48&_=${Date.now()}`, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      });
      if (!res.ok) throw new Error("Erro ao carregar notícias");
      const items = await res.json();
      return items.map((item) => {
        const { category, categoryLabel, subcategory, subcategoryLabel } =
          parseCategory(item.category);

        return {
          id: item.id,
          slug: item.slug || null,
          category,
          categoryLabel,
          subcategory,
          subcategoryLabel,
          title: item.title || "",
          dateISO: item.date || "",
          description: item.description || "",
          content: item.content || item.body || item.full_text || "",
          contentHtml: item.content_html || item.contentHtml || "",
          contentPlain: item.content_plain || item.contentPlain || "",
          excerpt: item.description || "",
          imageUrl: item.image || "",
          views: Number(item.views) || 0,
          uniqueViews:
            Number(item.unique_views ?? item.visitas_unicas ?? 0) || 0,
          author: {
            id:
              (item.author && item.author.id) ||
              item.author_id ||
              item.authorId ||
              null,
            name: (item.author && item.author.name) || item.author_name || "",
            avatarUrl: (item.author && item.author.avatarUrl) || "",
          },
          url: articleLink(item),
        };
      });
    } catch (e) {
      console.error(e);
      return [];
    }
  }
  async function fetchLatestVideo(channelId, limit = 1) {
    const targetId = String(channelId || "").trim();
    if (!targetId) return null;
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Number(limit), 5))
      : 1;
    try {
      const params = new URLSearchParams({
        channelId: targetId,
        limit: String(safeLimit),
      });
      const response = await fetch(
        `${API}/public/youtube/latest?${params.toString()}`,
        {
          cache: "no-store",
        }
      );
      if (!response.ok) throw new Error("Erro ao buscar videos do YouTube");
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const first = items.find((item) => item && (item.videoId || item.id));
      if (!first) return null;
      const videoId = first.videoId || first.id || "";
      const url =
        first.url ||
        (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
      return {
        videoId,
        url,
        title: first.title || "Video do Canal",
        publishedAt: first.publishedAt || null,
        thumbnailUrl: first.thumbnail || null,
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function loadHomeData() {
    try {
      const [news, highlights] = await Promise.all([
        fetchNews(),
        fetchHighlights(),
      ]);

      const normalizedNews = normalizeArticles(news);
      const highlightMap = enrichHighlightsWithAvatars(
        highlights || {},
        normalizedNews
      );
      MOCK_FEATURED.main = highlightMap[1] || null;
      MOCK_FEATURED.rightTop = highlightMap[2] || null;
      MOCK_FEATURED.rightBottom = highlightMap[3] || null;
      const channelId = getYoutubeChannelId();
      const video = await fetchLatestVideo(channelId, 1);
      MOCK_FEATURED.video = video || null;
      if (typeof window.__updateLatestNews === "function") {
        try {
          window.__updateLatestNews(normalizedNews);
        } catch (_) {}
      }
    } catch (e) {
      console.error(e);
    }
  }

  window.loadHomeData = loadHomeData;

  function fillVideoCard(cardEl, data) {
    if (!cardEl || !data) return;
    cardEl.dataset.videoId = data.videoId || "";

    const thumbUrl =
      data.thumbnailUrl ||
      (data.videoId
        ? `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`
        : "");
    const img = $('[data-field="videoThumb"]', cardEl);
    const link = $('[data-field="videoLink"]', cardEl);
    const title = $('[data-field="videoTitle"]', cardEl);

    if (img) {
      img.src = thumbUrl;
      img.alt = data.title || "Ví­deo do canal";
    }
    if (link) link.href = data.url || "#";
    if (title) {
      title.textContent = data.title || "";
      title.href = data.url || "#";
    }
  }

  function debounce(fn, ms = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function renderFeatured(data) {
    fillArticleCard($("#card-main"), data.main);
    fillVideoCard($("#card-video"), data.video);
    fillArticleCard($("#card-right-1"), data.rightTop);
    fillArticleCard($("#card-right-2"), data.rightBottom);

    const reClamp = debounce(() => {
      document
        .querySelectorAll('.card [data-field="excerpt"]')
        .forEach((el) => clampToLines(el, 4));
    }, 200);
    window.addEventListener("resize", reClamp);
  }

  function createStarfield(count = 220) {
    if (!document.body.classList.contains("space-bg")) return;
    if (document.querySelector(".starfield")) return;

    const field = document.createElement("div");
    field.className = "starfield";
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
      const star = document.createElement("span");
      star.className = "starfield__star";
      star.style.setProperty(
        "--start-x",
        `${(Math.random() * 100).toFixed(2)}%`
      );
      star.style.setProperty(
        "--start-y",
        `${(Math.random() * 100).toFixed(2)}%`
      );
      star.style.setProperty(
        "--star-size",
        `${(Math.random() * 2 + 1).toFixed(2)}px`
      );
      star.style.setProperty(
        "--twinkle-duration",
        `${(Math.random() * 3 + 3).toFixed(2)}s`
      );
      star.style.setProperty(
        "--twinkle-delay",
        `${(Math.random() * 5).toFixed(2)}s`
      );
      star.style.setProperty(
        "--drift-duration",
        `${(Math.random() * 35 + 25).toFixed(2)}s`
      );
      star.style.setProperty(
        "--drift-delay",
        `${(Math.random() * 35).toFixed(2)}s`
      );
      star.style.setProperty(
        "--drift-x",
        `${(Math.random() * 80 - 40).toFixed(2)}px`
      );
      star.style.setProperty(
        "--drift-y",
        `${(Math.random() * 160 + 60).toFixed(2)}px`
      );
      fragment.appendChild(star);
    }

    field.appendChild(fragment);
    document.body.insertBefore(field, document.body.firstChild);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.classList.contains("space-bg")) {
      createStarfield(220);
    }
    loadHomeData().then(() => {
      renderFeatured(MOCK_FEATURED);
    });
  });
})();

(function () {
  const THRESHOLD = 1200;

  let sliderObserver = null;

  const cardClickHandlers = new WeakMap();

  function enableFeaturedCardWideClick(card) {
    if (!card || cardClickHandlers.has(card)) return;
    const cta = card.querySelector(".card__cta");
    if (!cta) return;

    const clickHandler = (event) => {
      if (event.target.closest(".card__cta")) {
        return;
      }

      const interactive = event.target.closest("a, button");
      if (interactive) return;

      cta.click();
    };

    const keyHandler = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target !== card) return;
      event.preventDefault();
      cta.click();
    };

    card.addEventListener("click", clickHandler);
    card.addEventListener("keydown", keyHandler);
    cardClickHandlers.set(card, { clickHandler, keyHandler });

    card.classList.add("card--full-click");

    const prevTabindex = card.hasAttribute("tabindex")
      ? card.getAttribute("tabindex")
      : "";
    card.dataset.fullClickTabindex = prevTabindex;
    card.setAttribute("tabindex", "0");

    const prevRole = card.hasAttribute("role") ? card.getAttribute("role") : "";
    card.dataset.fullClickRole = prevRole;
    card.setAttribute("role", "link");
  }

  function disableFeaturedCardWideClick(card) {
    const handlers = cardClickHandlers.get(card);
    if (!handlers) return;

    card.removeEventListener("click", handlers.clickHandler);
    card.removeEventListener("keydown", handlers.keyHandler);
    cardClickHandlers.delete(card);
    card.classList.remove("card--full-click");

    const prevTabindex = card.dataset.fullClickTabindex;
    if (prevTabindex !== undefined) {
      if (prevTabindex === "") {
        card.removeAttribute("tabindex");
      } else {
        card.setAttribute("tabindex", prevTabindex);
      }
      delete card.dataset.fullClickTabindex;
    }

    const prevRole = card.dataset.fullClickRole;
    if (prevRole !== undefined) {
      if (prevRole === "") {
        card.removeAttribute("role");
      } else {
        card.setAttribute("role", prevRole);
      }
      delete card.dataset.fullClickRole;
    }
  }

  function initSliderObserver(container) {
    if (!container) return;
    const cards = Array.from(container.querySelectorAll(".card"));

    if (sliderObserver) {
      sliderObserver.disconnect();
      sliderObserver = null;
    }

    cards.forEach((c, i) => c.classList.toggle("is-active", i === 0));
    sliderObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio >= 0.6) {
            const current = entry.target;
            cards.forEach((c) =>
              c.classList.toggle("is-active", c === current)
            );
          }
        });
      },
      {
        root: container,
        threshold: [0.6],
      }
    );
    cards.forEach((card) => sliderObserver.observe(card));
  }

  function destroySliderObserver() {
    if (sliderObserver) {
      sliderObserver.disconnect();
      sliderObserver = null;
    }
  }

  function setupFeaturedSlider() {
    const grid = document.querySelector(".featured-grid");
    if (!grid) return;
    const colLeft = grid.querySelector(".featured-column--left");
    const colRight = grid.querySelector(".featured-column--right");
    const mainCard = document.getElementById("card-main");
    const rightTopCard = document.getElementById("card-right-1");
    const rightBottomCard = document.getElementById("card-right-2");
    const videoCard = document.getElementById("card-video");
    if (
      !colLeft ||
      !colRight ||
      !mainCard ||
      !rightTopCard ||
      !rightBottomCard ||
      !videoCard
    )
      return;

    const isMobile = window.innerWidth < THRESHOLD;
    const enabled = grid.classList.contains("slider-enabled");

    if (isMobile && !enabled) {
      grid.classList.add("slider-enabled");

      const slider = document.createElement("div");
      slider.className = "featured-slider";

      slider.appendChild(mainCard);
      slider.appendChild(rightTopCard);
      slider.appendChild(rightBottomCard);

      colRight.style.display = "none";

      colLeft.insertBefore(slider, videoCard);

      initSliderObserver(slider);
    } else if (!isMobile && enabled) {
      grid.classList.remove("slider-enabled");
      const slider = colLeft.querySelector(".featured-slider");
      if (slider) {
        colLeft.insertBefore(mainCard, videoCard);
        colRight.appendChild(rightTopCard);
        colRight.appendChild(rightBottomCard);

        slider.remove();
      }

      colRight.style.display = "";

      destroySliderObserver();
      [mainCard, rightTopCard, rightBottomCard].forEach((c) =>
        c.classList.remove("is-active")
      );
    }

    const articleCards = [mainCard, rightTopCard, rightBottomCard].filter(
      Boolean
    );

    if (isMobile) {
      articleCards.forEach(enableFeaturedCardWideClick);
    } else {
      articleCards.forEach(disableFeaturedCardWideClick);
    }
  }

  document.addEventListener("DOMContentLoaded", setupFeaturedSlider);

  window.addEventListener("resize", setupFeaturedSlider);
})();

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const LATEST_STATE = {
    cat: "all",
    sub: "all",
    sort: "recent",
    q: "",
    page: 1,
    pageSize: 9,
    // Video type filter: null/"video"/"short". Only applied when cat === 'videos'
    vtype: null,
  };

  window.__updateLatestNews = function updateLatestNews(items) {
    if (!Array.isArray(items)) return;
    MOCK_NEWS.length = 0;
    Array.prototype.push.apply(MOCK_NEWS, items);

    resetList();
    renderPage(false);
    try {
      setupLatestResponsive();
    } catch (_) {}
  };

  const MOCK_NEWS = [];
  const readingTimeCache = new Map();
  const readingTimeRequests = new Map();

  // Keep a separate store of videos returned from the API. This prevents
  // interference with article logic. The API returns videos page by page,
  // therefore this array will accumulate items when the user clicks
  // "Carregar mais" while viewing the Vídeos tab.
  const LATEST_VIDEOS = [];
  // Track the total number of videos available according to the backend.
  let LATEST_VIDEOS_TOTAL = 0;
  let LATEST_VIDEOS_PAGE = 0;
  const LATEST_VIDEO_KEYS = new Set();
  let latestVideoRequestId = 0;
  let isFetchingVideos = false;

  /**
   * Fetch a paginated list of videos from the backend. Query parameters map
   * directly to the API: `limit` defines how many items per page (default
   * matches the page size), `page` is the page number starting from 1,
   * `sort` may be "recent", "oldest" or "views", and `type` can be
   * "video" or "short" (or omitted for all). If the call fails an empty
   * result is returned.
   *
   * @param {number} page
   * @param {number} limit
   * @param {string} sort
   * @param {string|null} vtype
   * @returns {Promise<{items: Array, total: number}>}
   */
  async function fetchVideos(
    page = 1,
    limit = LATEST_STATE.pageSize,
    sort = LATEST_STATE.sort,
    vtype = LATEST_STATE.vtype
  ) {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("page", String(page));
      params.set("sort", sort || "recent");
      if (vtype) params.set("type", vtype);
      // Always include the channelId to avoid a 400 error when the backend
      // does not have YOUTUBE_CHANNEL_ID set. We determine it here rather
      // than relying on getYoutubeChannelId() because that function may not
      // be available in this scope when the file is bundled. We first
      // attempt to use the global window.YOUTUBE_CHANNEL_ID; if it is
      // undefined or empty we fall back to the same default value used in
      // getYoutubeChannelId (UCet4s_cF4TZ1jdagUbNoNpQ). Keeping the channel
      // ID logic inline ensures robustness when modules are concatenated or
      // minified.
      {
        let channelIdFromEnv = "";
        try {
          if (typeof window !== "undefined" && window.YOUTUBE_CHANNEL_ID) {
            channelIdFromEnv = String(window.YOUTUBE_CHANNEL_ID).trim();
          }
        } catch (_) {}
        const fallbackChannelId = "UCet4s_cF4TZ1jdagUbNoNpQ";
        const channelId = channelIdFromEnv || fallbackChannelId;
        params.set("channelId", channelId);
      }
      // Note: we use the public API namespace here. If API_BASE already ends
      // with /public then this still works because we trim trailing slashes.
      const res = await fetch(
        `${API_BASE}/public/youtube/videos?${params.toString()}`,
        {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        }
      );
      if (!res.ok) {
        return { items: [], total: 0 };
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number.isFinite(data.total) ? data.total : 0;
      return { items, total };
    } catch (err) {
      console.error(err);
      return { items: [], total: 0 };
    }
  }

  /**
   * Build a post card specifically for video entries. The layout mirrors the
   * existing post-card style but omits elements not relevant to videos (such
   * as the excerpt, author and CTA). It instead displays the duration of the
   * video on the corner and identifies the type (Vídeos or Shorts).
   *
   * @param {object} item – video information returned by the API
   * @returns {HTMLElement}
   */
  function createVideoCard(item) {
    const art = document.createElement("article");
    art.className = "post-card hover-card card--video";
    // Set dataset properties for potential instrumentation
    art.dataset.videoId = item.id || item.videoId || "";
    art.dataset.category = "videos";
    // Determine if the item should be considered a short. We prefer the
    // explicit `type` field returned by the API, but fall back to checking
    // the duration when available. Shorts on YouTube are typically up to 60
    // seconds in length. If neither type nor duration is available (e.g.
    // fallback items), we default to "video". Preserve the original type
    // string for dataset and label.
    let detectedType = "video";
    const rawType =
      typeof item.type === "string" ? item.type.toLowerCase() : "";
    if (rawType === "short" || rawType === "video") {
      detectedType = rawType;
    } else if (Number.isFinite(item.durationSeconds)) {
      detectedType = item.durationSeconds <= 60 ? "short" : "video";
    }
    art.dataset.type = detectedType;
    // Determine label for the category badge. Preserve accents.
    const categoryLabel = detectedType === "short" ? "Shorts" : "Vídeos";
    const dateISO = item.publishedAt || "";
    const formattedDate = formatDatePtBr(dateISO);
    // Build inner HTML for static parts. Note: we open links in a new tab.
    art.innerHTML = `
      <a class="post-card__image-link card__image" href="${
        item.url
      }" target="_blank" rel="noopener">
        <img loading="lazy" alt="${item.title || "Vídeo"}" src="${
      item.thumbnail
    }">
        <span class="card__play" aria-hidden="true">&#9654;</span>
      </a>
      <div class="post-card__topline">
        <time class="post-card__date btn-sm" datetime="${dateISO}">${formattedDate}</time>
        <span class="post-card__category btn-sm box-grad">${categoryLabel}</span>
      </div>
      <h5 class="post-card__title"><a href="${
        item.url
      }" target="_blank" rel="noopener">${item.title || ""}</a></h5>
    `;
    // Append duration badge after constructing the main structure
    const badge = buildDurationBadge(item.durationDisplay);
    if (badge) {
      art.appendChild(badge);
    }
    return art;
  }

  function getVideoItemKey(item) {
    if (!item) return null;
    if (item.id != null) return `id:${item.id}`;
    if (item.videoId) return `vid:${item.videoId}`;
    if (item.video_id) return `vid:${item.video_id}`;
    if (item.url) return `url:${item.url}`;
    if (item.title || item.publishedAt) {
      return `title:${item.title || ""}:${item.publishedAt || ""}`;
    }
    return null;
  }

  function resetVideoStore() {
    LATEST_VIDEOS.length = 0;
    LATEST_VIDEOS_TOTAL = 0;
    LATEST_VIDEOS_PAGE = 0;
    LATEST_VIDEO_KEYS.clear();
  }

  /**
   * Render video cards into the grid. When `append` is true this function
   * fetches the next page of videos from the API and appends them to the
   * existing list. When `append` is false it resets the video list and
   * populates it with the first page of results. After updating the list
   * it rebuilds the grid and toggles the "Carregar mais" button based on
   * whether more items are available.
   *
   * @param {boolean} append
   */
  async function renderVideoPage(append = false) {
    if (!grid) return;

    const requestId = ++latestVideoRequestId;
    const requestCat = LATEST_STATE.cat;
    const shouldAppend = append && LATEST_VIDEOS_PAGE > 0;
    const targetPage = shouldAppend ? LATEST_VIDEOS_PAGE + 1 : 1;

    isFetchingVideos = true;
    updateVideoLoadMoreState();

    let response;
    try {
      response = await fetchVideos(
        targetPage,
        LATEST_STATE.pageSize,
        LATEST_STATE.sort,
        LATEST_STATE.vtype
      );
    } catch (err) {
      console.error(err);
      response = { items: [], total: 0 };
    }

    let { items, total } = response;

    const q = (LATEST_STATE.q || "").trim().toLowerCase();
    if (q) {
      items = items.filter((it) => (it.title || "").toLowerCase().includes(q));
      total = items.length;
    }

    if (
      requestId !== latestVideoRequestId ||
      requestCat !== "videos" ||
      LATEST_STATE.cat !== requestCat
    ) {
      isFetchingVideos = false;
      updateVideoLoadMoreState();
      return;
    }

    if (!shouldAppend) {
      grid.innerHTML = "";
      resetVideoStore();
    }

    const fragment = document.createDocumentFragment();
    items.forEach((it) => {
      const key = getVideoItemKey(it);
      if (!key || LATEST_VIDEO_KEYS.has(key)) return;
      LATEST_VIDEO_KEYS.add(key);
      LATEST_VIDEOS.push(it);
      fragment.appendChild(createVideoCard(it));
    });

    const appendedCount = fragment.childNodes.length;
    if (appendedCount) {
      grid.appendChild(fragment);
    }

    LATEST_VIDEOS_PAGE = appendedCount
      ? targetPage
      : shouldAppend
      ? targetPage
      : 0;
    LATEST_VIDEOS_TOTAL = total;

    try {
      setupLatestResponsive();
    } catch (e) {}

    const renderedCount = grid.childElementCount;
    const counterTotal =
      LATEST_STATE.q && LATEST_STATE.q.trim()
        ? renderedCount
        : Math.max(renderedCount, LATEST_VIDEOS_TOTAL);
    updateLatestCounter(renderedCount, counterTotal);

    isFetchingVideos = false;
    updateVideoLoadMoreState();
  }

  function updateVideoLoadMoreState() {
    if (!loadMoreBtn) return;
    if (LATEST_STATE.cat !== "videos") {
      loadMoreBtn.removeAttribute("aria-busy");
      return;
    }
    const hasMore = LATEST_VIDEOS.length < LATEST_VIDEOS_TOTAL;
    loadMoreBtn.hidden = !hasMore;
    if (!hasMore) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.removeAttribute("aria-busy");
      return;
    }
    loadMoreBtn.disabled = isFetchingVideos;
    if (isFetchingVideos) {
      loadMoreBtn.setAttribute("aria-busy", "true");
    } else {
      loadMoreBtn.removeAttribute("aria-busy");
    }
  }

  function readingCacheKey(item) {
    /**
     * Generate a cache key for storing computed reading time values. To ensure
     * that changes in the article content (such as after editing) invalidate
     * any previously cached reading time, the key incorporates the
     * `updated_at` timestamp when available. When the article is edited and
     * published again, the backend updates the `updated_at` field; appending
     * this value to the cache key forces a cache miss and triggers a fresh
     * reading time calculation. If no timestamp is present we fall back to
     * an empty string so that older behaviour remains unchanged.
     *
     * We support both direct article objects (with id/slug) and objects
     * returned from other contexts (articleId, articleSlug). When only a
     * URL is available we use that as the key without a timestamp, as
     * external content is assumed immutable within our application.
     *
     * @param {object} item
     * @returns {string|null}
     */
    if (!item) return null;
    // Determine a version token from the updated timestamp when provided
    const version =
      item.updated_at || item.updatedAt || item.updated_at || null;
    const suffix = version ? `:${version}` : "";
    if (item.id != null) return `id:${item.id}${suffix}`;
    if (item.articleId != null) return `id:${item.articleId}${suffix}`;
    if (item.slug) return `slug:${item.slug}${suffix}`;
    if (item.articleSlug) return `slug:${item.articleSlug}${suffix}`;
    if (item.url) return `url:${item.url}`;
    return null;
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

  async function fetchArticleDetailForItem(item) {
    const id = item.id ?? item.articleId ?? null;
    const slug = item.slug ?? item.articleSlug ?? null;

    let url = null;
    if (id != null) {
      url = `${API_BASE}/public/news/${encodeURIComponent(id)}`;
    } else if (slug) {
      url = `${API_BASE}/public/news/by-slug/${encodeURIComponent(slug)}`;
    } else {
      return null;
    }

    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async function resolveReadingMinutes(item) {
    const key = readingCacheKey(item);
    if (!key) return null;
    if (readingTimeCache.has(key)) return readingTimeCache.get(key);
    if (readingTimeRequests.has(key)) return readingTimeRequests.get(key);

    const request = (async () => {
      try {
        const detail = await fetchArticleDetailForItem(item);
        if (!detail) return null;
        let text =
          normalizeReadingChunk(
            detail.content || detail.contentHtml || detail.content_html
          ) || extractReadingText(detail);
        const minutes = calcularTempoLeitura(text);
        const ensured = Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
        readingTimeCache.set(key, ensured);
        return ensured;
      } catch (err) {
        console.error(err);
        return null;
      } finally {
        readingTimeRequests.delete(key);
      }
    })();

    readingTimeRequests.set(key, request);
    return request;
  }

  async function hydrateCardReadingTime(cardEl, item) {
    if (!cardEl || !cardEl.classList.contains("post-card")) return;
    try {
      const minutes = await resolveReadingMinutes(item);
      if (Number.isFinite(minutes) && minutes > 0) {
        applyReadingBadge(cardEl, minutes);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function createCard(item) {
    const art = document.createElement("article");
    art.className = "post-card hover-card";
    art.dataset.articleId = item.id;
    art.dataset.category = item.category;
    if (item.subcategory) art.dataset.subcategory = item.subcategory;

    const categoryLabel = item.categoryLabel || labelFromCat(item.category);
    if (categoryLabel) {
      art.dataset.categoryLabel = categoryLabel;
    } else {
      delete art.dataset.categoryLabel;
    }

    const readingSource = extractReadingText(item);
    const readingMinutes = calcularTempoLeitura(readingSource);

    art.innerHTML = `
      <a class="post-card__image-link" href="${item.url}">
        <img loading="lazy" alt="${item.title}" src="${item.imageUrl}">
      </a>

      <div class="post-card__topline">
        <time class="post-card__date btn-sm" datetime="${
          item.dateISO
        }">${formatDatePtBr(item.dateISO)}</time>
        <span class="post-card__category btn-sm box-grad">${categoryLabel}</span>
      </div>

      <h5 class="post-card__title"><a href="${item.url}">${item.title}</a></h5>

      <p class="post-card__excerpt body-lg">${item.excerpt}</p>

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

    applyReadingBadge(art, readingMinutes);
    hydrateCardReadingTime(art, item);

    requestAnimationFrame(() => {
      clampToLines($(".post-card__excerpt", art), 3);
    });

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
    } catch (_) {}

    return art;
  }

  const LATEST_MOBILE_MAX = 1199;

  const latestCardHandlers = new WeakMap();

  let latestObserver = null;

  function enableLatestCardWideClick(card) {
    if (!card || latestCardHandlers.has(card)) return;
    const cta = card.querySelector(".post-card__cta");
    if (!cta) return;

    const clickHandler = (event) => {
      if (event.target.closest(".post-card__cta")) return;

      const interactive = event.target.closest("a, button");
      if (interactive) return;

      cta.click();
    };

    const keyHandler = (event) => {
      if (event.target !== card) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      cta.click();
    };
    card.addEventListener("click", clickHandler);
    card.addEventListener("keydown", keyHandler);
    latestCardHandlers.set(card, { clickHandler, keyHandler });

    card.classList.add("post-card--full-click");

    const prevTabindex = card.hasAttribute("tabindex")
      ? card.getAttribute("tabindex")
      : "";
    card.dataset.fullClickTabindexLatest = prevTabindex;
    card.setAttribute("tabindex", "0");
    const prevRole = card.hasAttribute("role") ? card.getAttribute("role") : "";
    card.dataset.fullClickRoleLatest = prevRole;
    card.setAttribute("role", "link");
  }

  function disableLatestCardWideClick(card) {
    const handlers = latestCardHandlers.get(card);
    if (!handlers) return;
    card.removeEventListener("click", handlers.clickHandler);
    card.removeEventListener("keydown", handlers.keyHandler);
    latestCardHandlers.delete(card);
    card.classList.remove("post-card--full-click");

    const prevTabindex = card.dataset.fullClickTabindexLatest;
    if (prevTabindex !== undefined) {
      if (prevTabindex === "") {
        card.removeAttribute("tabindex");
      } else {
        card.setAttribute("tabindex", prevTabindex);
      }
      delete card.dataset.fullClickTabindexLatest;
    }

    const prevRole = card.dataset.fullClickRoleLatest;
    if (prevRole !== undefined) {
      if (prevRole === "") {
        card.removeAttribute("role");
      } else {
        card.setAttribute("role", prevRole);
      }
      delete card.dataset.fullClickRoleLatest;
    }
  }

  function initLatestObserver() {
    if (latestObserver) {
      latestObserver.disconnect();
      latestObserver = null;
    }
    const cards = Array.from(
      document.querySelectorAll("#latest-grid .post-card")
    );
    if (!cards.length) return;
    latestObserver = new IntersectionObserver(
      (entries) => {
        let mostVisible = null;
        let maxRatio = 0;
        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            mostVisible = entry.target;
            maxRatio = entry.intersectionRatio;
          }
        });
        if (mostVisible && maxRatio >= 0.6) {
          cards.forEach((c) => {
            if (c === mostVisible) c.classList.add("is-active");
            else c.classList.remove("is-active");
          });
        }
      },
      {
        root: null,
        threshold: [0.6],
      }
    );
    cards.forEach((card) => latestObserver.observe(card));
  }

  function destroyLatestObserver() {
    if (latestObserver) {
      latestObserver.disconnect();
      latestObserver = null;
    }
  }

  function setupLatestResponsive() {
    const cards = Array.from(
      document.querySelectorAll("#latest-grid .post-card")
    );
    const isMobile = window.innerWidth <= LATEST_MOBILE_MAX;
    if (isMobile) {
      cards.forEach(enableLatestCardWideClick);
      initLatestObserver();
    } else {
      cards.forEach(disableLatestCardWideClick);
      destroyLatestObserver();
      cards.forEach((c) => c.classList.remove("is-active"));
    }
  }

  function labelFromCat(cat) {
    switch (cat) {
      case "mundo-tech":
        return "Mundo Tech";
      case "games":
        return "Games";
      case "cultura-pop":
        return "Cultura Pop";
      case "videos":
        return "Ví­deos";
      default:
        return "Notícia";
    }
  }

  function filterNews(data, state = LATEST_STATE) {
    let out = data;

    if (state.cat !== "all") out = out.filter((n) => n.category === state.cat);

    if (state.cat === "cultura-pop" && state.sub !== "all") {
      out = out.filter((n) => n.subcategory === state.sub);
    }

    if (state.q) {
      const q = state.q.trim().toLowerCase();
      out = out.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.excerpt.toLowerCase().includes(q)
      );
    }

    if (state.sort === "recent") {
      out.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
    } else if (state.sort === "oldest") {
      out.sort((a, b) => (a.dateISO > b.dateISO ? 1 : -1));
    } else if (state.sort === "views") {
      out.sort((a, b) => b.views - a.views);
    }

    return out;
  }

  const latestSection = $("#latest");
  const grid = $("#latest-grid");
  const loadMoreBtn = $("#latest-load-more");
  const counterEl = $("#latest-counter");
  const updateLatestCounter = createShowingCounter(counterEl);
  updateLatestCounter(0, 0);
  const tabs = $$(".latest__tabs .tab");
  const searchInput = $("#latest-search");
  const sortSelect = $("#latest-sort");
  const subfilterBox = $("#latest-subfilter");

  // Filtro para selecionar tipos de vídeo/short. Visível apenas quando a aba "Vídeos" está selecionada.
  const videoFilterBox = $("#latest-video-filter");

  // Conjunto de vídeos retornados pela API. Mantemos este array separado de MOCK_NEWS para
  // que a lógica de artigos continue funcionando sem interferência.
  // (declarado anteriormente near the top of this module)

  const culturaPopTab = tabs.find((tab) => tab.dataset.cat === "cultura-pop");
  const CP_VALID_SUBS = ["all", "filmes", "nerd", "series"];

  function syncSubfilterState(nextSub) {
    if (!subfilterBox) return;

    const isSelected = culturaPopTab?.getAttribute("aria-selected") === "true";

    subfilterBox.hidden = !isSelected;

    if (!isSelected) {
      LATEST_STATE.sub = "all";
    } else {
      let targetSub =
        typeof nextSub === "string" && CP_VALID_SUBS.includes(nextSub)
          ? nextSub
          : LATEST_STATE.sub;

      if (!CP_VALID_SUBS.includes(targetSub)) targetSub = "all";
      LATEST_STATE.sub = targetSub;
    }

    const radios = $$('input[name="cp-sub"]', subfilterBox);
    radios.forEach((radio) => {
      radio.checked = radio.value === LATEST_STATE.sub;
    });
  }
  function resetList() {
    LATEST_STATE.page = 1;
    grid.innerHTML = "";
    updateLatestCounter(0, 0);
    // When viewing videos, also clear the accumulated video list. This ensures
    // that changing filters or categories does not append new results onto
    // outdated items.
    if (LATEST_STATE.cat === "videos") {
      resetVideoStore();
      updateVideoLoadMoreState();
    }
  }

  function renderPage(append = false) {
    // If the selected category is "videos" we delegate rendering to the
    // specialized video renderer. This function handles fetching and
    // paginating video results separately from article logic.
    if (LATEST_STATE.cat === "videos") {
      renderVideoPage(append);
      return;
    }

    // Otherwise render standard news items.
    const filtered = filterNews(MOCK_NEWS, LATEST_STATE);
    const total = filtered.length;

    const start = 0;
    const end = Math.min(LATEST_STATE.page * LATEST_STATE.pageSize, total);
    const slice = filtered.slice(0, end);

    if (!append) grid.innerHTML = "";
    slice.forEach((item, idx) => {
      if (!append || idx >= (LATEST_STATE.page - 1) * LATEST_STATE.pageSize) {
        grid.appendChild(createCard(item));
      }
    });

    if (end >= total) {
      loadMoreBtn.hidden = true;
      loadMoreBtn.disabled = true;
    } else {
      loadMoreBtn.hidden = false;
      loadMoreBtn.disabled = false;
    }

    updateLatestCounter(end, total);

    try {
      setupLatestResponsive();
    } catch (e) {}
  }

  function setActiveTab(cat, nextSub) {
    if (!cat) return;
    LATEST_STATE.cat = cat;

    tabs.forEach((tab) => {
      const isSelected = tab.dataset.cat === cat;
      tab.setAttribute("aria-selected", String(isSelected));
    });

    syncSubfilterState(nextSub);

    // Show or hide the vídeo/shorts filter based on the selected category. When
    // entering the videos tab, reset the video type filter and clear any
    // previously selected checkboxes. Otherwise hide the filter and reset
    // the vtype to null to avoid affecting other categories.
    if (videoFilterBox) {
      const isVideoTab = cat === "videos";
      videoFilterBox.hidden = !isVideoTab;
      if (!isVideoTab) {
        LATEST_STATE.vtype = null;
        // reset checkboxes
        const checks = Array.from(
          videoFilterBox.querySelectorAll('input[name="video-type"]')
        );
        checks.forEach((cb) => {
          cb.checked = false;
        });
      }
    }

    resetList();
    renderPage(false);
    updateURL();
  }

  function debounce(fn, ms = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const onSearch = debounce(() => {
    LATEST_STATE.q = searchInput.value;
    resetList();
    renderPage(false);
    updateURL();
  }, 300);

  function onSortChange() {
    LATEST_STATE.sort = sortSelect.value;
    resetList();
    renderPage(false);
    updateURL();
  }

  function onSubfilterChange(e) {
    if (e.target.name !== "cp-sub") return;
    LATEST_STATE.sub = e.target.value;
    resetList();
    renderPage(false);
    updateURL();
  }

  function onLoadMore() {
    // Incrementa a paginação apenas para as categorias textuais; vídeos usam paginador próprio.
    if (LATEST_STATE.cat === "videos") {
      renderVideoPage(true);
      return;
    }
    LATEST_STATE.page += 1;
    renderPage(true);
  }

  /**
   * Handler for changes to the Vídeos/Shorts filter. It examines all
   * checkboxes in the video filter box and determines whether the user has
   * selected "Vídeos", "Shorts" or both/none. When exactly one option is
   * selected the state is updated to filter by that type; otherwise the
   * filter is cleared (showing all types). After updating the state it
   * resets pagination and reloads the first page of video results.
   */
  function onVideoFilterChange(e) {
    if (!videoFilterBox || e.target.name !== "video-type") return;
    const checkboxes = Array.from(
      videoFilterBox.querySelectorAll('input[name="video-type"]')
    );
    const selected = checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
    if (selected.length === 1) {
      LATEST_STATE.vtype = selected[0];
    } else {
      LATEST_STATE.vtype = null;
    }
    LATEST_STATE.page = 1;
    // Reload the first page of videos when the filter changes
    renderVideoPage(false);
    updateURL();
  }

  tabs.forEach((btn) =>
    btn.addEventListener("click", () => setActiveTab(btn.dataset.cat))
  );
  searchInput.addEventListener("input", onSearch);
  sortSelect.addEventListener("change", onSortChange);
  subfilterBox.addEventListener("change", onSubfilterChange);
  loadMoreBtn.addEventListener("click", onLoadMore);

  // Attach change handler for vídeo/short filters. Only executed when the
  // videos tab is active, but adding the listener here is inexpensive.
  if (videoFilterBox) {
    videoFilterBox.addEventListener("change", onVideoFilterChange);
  }

  function handleHeaderNavClick(e) {
    const trigger = e.target.closest(".header-nav [data-cat]");
    if (!trigger) return;
    const cat = trigger.dataset.cat;
    if (!cat) return;

    e.preventDefault();

    const sub = trigger.dataset.sub;
    setActiveTab(cat, sub);

    const menuWrapper = trigger.closest(".menu-item");
    if (menuWrapper) {
      const toggleBtn = menuWrapper.querySelector(".submenu-btn");
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
    }

    if (latestSection) {
      latestSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  document.addEventListener("click", handleHeaderNavClick);

  function readURL() {
    const url = new URL(window.location.href);
    const cat = url.searchParams.get("cat");
    const q = url.searchParams.get("q");
    const sort = url.searchParams.get("sort");
    const sub = url.searchParams.get("sub");

    if (
      cat &&
      ["all", "mundo-tech", "games", "cultura-pop", "videos"].includes(cat)
    ) {
      LATEST_STATE.cat = cat;
    }
    if (typeof q === "string") {
      LATEST_STATE.q = q;
      searchInput.value = q;
    }
    if (sort && ["recent", "oldest", "views"].includes(sort)) {
      LATEST_STATE.sort = sort;
      sortSelect.value = sort;
    }
    if (sub && CP_VALID_SUBS.includes(sub)) {
      LATEST_STATE.sub = sub;
    }

    tabs.forEach((t) =>
      t.setAttribute(
        "aria-selected",
        String(t.dataset.cat === LATEST_STATE.cat)
      )
    );

    syncSubfilterState(LATEST_STATE.sub);
  }

  function updateURL() {
    const url = new URL(window.location.href);
    url.searchParams.set("cat", LATEST_STATE.cat);
    if (LATEST_STATE.q) url.searchParams.set("q", LATEST_STATE.q);
    else url.searchParams.delete("q");
    url.searchParams.set("sort", LATEST_STATE.sort);
    if (LATEST_STATE.cat === "cultura-pop") {
      url.searchParams.set("sub", LATEST_STATE.sub);
    } else {
      url.searchParams.delete("sub");
    }
    history.replaceState(null, "", url.toString());
  }

  document.addEventListener("DOMContentLoaded", () => {
    readURL();
    resetList();
    renderPage(false);

    setupLatestResponsive();
    window.addEventListener("resize", setupLatestResponsive);

    const reClamp = debounce(() => {
      $$(".post-card__excerpt", grid).forEach((el) => clampToLines(el, 3));
    }, 200);
    window.addEventListener("resize", reClamp);
  });
})();

// -----------------------------------------------------------------------------
// Push Notification Modal Setup
//
// Este módulo implementa um modal para solicitar permissão de notificações push
// na página inicial. Ele reutiliza o visual do modal de troca de senha na
// dashboard, persistindo a decisão do usuário em localStorage para que o
// modal nunca mais apareça após ser aceito ou recusado. Quando aceito e o
// usuário concede permissão, o script faz polling periódico no backend para
// detectar novas publicações e emite uma notificação via API de
// Notification do navegador. Ao clicar na notificação, o usuário é
// redirecionado para a página da notícia correspondente.
// -----------------------------------------------------------------------------

(() => {
  const PREF_KEY = "tlu.notifications.preference";
  const LAST_POST_KEY = "tlu.notifications.lastPost";
  let pollingInterval = null;

  /**
   * Lê a preferência salva do usuário para notificações. Os valores possíveis
   * são "accepted", "denied" ou null quando nenhuma escolha foi feita.
   * @returns {string|null}
   */
  function getPreference() {
    try {
      return localStorage.getItem(PREF_KEY);
    } catch (_) {
      return null;
    }
  }

  /**
   * Armazena a preferência do usuário para notificações.
   * @param {string} value
   */
  function setPreference(value) {
    try {
      localStorage.setItem(PREF_KEY, value);
    } catch (_) {}
  }

  /**
   * Obtém o identificador (ID ou slug) da última publicação para a qual
   * notificamos o usuário.
   * @returns {string|null}
   */
  function getLastNotifiedPost() {
    try {
      return localStorage.getItem(LAST_POST_KEY);
    } catch (_) {
      return null;
    }
  }

  /**
   * Atualiza o identificador da última publicação notificada.
   * @param {string} id
   */
  function setLastNotifiedPost(id) {
    try {
      localStorage.setItem(LAST_POST_KEY, id);
    } catch (_) {}
  }

  /**
   * Recupera referências aos elementos do modal para manipulação.
   */
  function getModalRefs() {
    const modal = document.getElementById("notificationModal");
    if (!modal) return null;
    return {
      modal,
      overlay: modal.querySelector(".notification-alert__overlay"),
      acceptBtn: modal.querySelector('[data-notification-action="accept"]'),
      denyBtn: modal.querySelector('[data-notification-action="deny"]'),
    };
  }

  /**
   * Verifica se o modal está aberto analisando o atributo data-active.
   */
  function isModalOpen() {
    const refs = getModalRefs();
    if (!refs) return false;
    return refs.modal.getAttribute("data-active") === "true";
  }

  /**
   * Exibe o modal de notificações. Remove o atributo hidden e aplica
   * transição definindo data-active como true em um frame posterior.
   */
  function openModal() {
    const refs = getModalRefs();
    if (!refs) return;
    if (isModalOpen()) return;
    refs.modal.removeAttribute("hidden");
    requestAnimationFrame(() => {
      refs.modal.setAttribute("data-active", "true");
    });
    const target = refs.acceptBtn || refs.denyBtn;
    if (target) {
      setTimeout(() => {
        if (isModalOpen()) target.focus();
      }, 260);
    }
  }

  /**
   * Fecha o modal suavemente. Quando immediate é true, oculta instantaneamente.
   * @param {boolean} [immediate]
   */
  function closeModal(immediate = false) {
    const refs = getModalRefs();
    if (!refs) return;
    if (!isModalOpen() && !immediate) return;
    const hide = () => {
      refs.modal.setAttribute("hidden", "");
    };
    refs.modal.removeAttribute("data-active");
    if (immediate) {
      hide();
      return;
    }
    const onTransitionEnd = (event) => {
      if (event.target !== refs.modal) return;
      refs.modal.removeEventListener("transitionend", onTransitionEnd);
      hide();
    };
    refs.modal.addEventListener("transitionend", onTransitionEnd);
    // Fallback para navegadores sem supporte a transitionend
    setTimeout(onTransitionEnd, 260);
  }

  /**
   * Recupera a publicação mais recente do backend. Retorna null em caso de erro.
   * @returns {Promise<Object|null>}
   */
  async function fetchLatestPost() {
    try {
      const res = await fetch(
        `${API_BASE}/public/news?limit=1&_=${Date.now()}`,
        {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      return null;
    } catch (err) {
      console.error(
        "Erro ao buscar publicação mais recente para notificações",
        err
      );
      return null;
    }
  }

  /**
   * Constrói e emite uma notificação para a publicação fornecida.
   * Define um manipulador de clique que abre a notícia em nova aba.
   * @param {Object} post
   */
  function showNotificationForPost(post) {
    if (!post) return;
    const title = "Nova publicação disponível!";
    const body = post.title || "";
    // Caminho absoluto para o ícone da aplicação; utiliza localização atual
    const icon = `${location.origin}/assets/img/favicon.svg`;
    try {
      const notif = new Notification(title, { body, icon });
      notif.onclick = () => {
        try {
          const url = post.slug
            ? `/noticia/${encodeURIComponent(post.slug)}`
            : post.id != null
            ? `/noticia?id=${encodeURIComponent(post.id)}`
            : "/";
          window.open(url, "_blank");
        } catch (_) {}
      };
    } catch (e) {
      console.error("Falha ao exibir notificação", e);
    }
  }

  /**
   * Verifica se há novas publicações e emite notificação quando necessário.
   */
  async function checkForNewPosts() {
    const pref = getPreference();
    if (pref !== "accepted") return;
    if (Notification.permission !== "granted") return;
    const latest = await fetchLatestPost();
    if (!latest) return;
    // Utiliza id ou slug como chave única. Alguns registros podem ter slug
    const currentId =
      latest.id != null
        ? String(latest.id)
        : latest.slug
        ? String(latest.slug)
        : null;
    if (!currentId) return;
    const lastId = getLastNotifiedPost();
    if (lastId === currentId) return;
    setLastNotifiedPost(currentId);
    showNotificationForPost(latest);
  }

  /**
   * Inicia o polling periódico por novas publicações. Se já estiver ativo
   * (pollingInterval definido), não faz nada. O polling ocorre a cada 60s.
   */
  function startPolling() {
    if (pollingInterval) return;
    // Realiza uma verificação inicial imediata
    checkForNewPosts();
    pollingInterval = setInterval(checkForNewPosts, 60000);
  }

  /**
   * Manipulador de clique para o botão Aceitar. Salva preferência, fecha
   * modal, solicita permissão do navegador e inicia polling se concedido.
   */
  function handleAccept() {
    setPreference("accepted");
    closeModal();
    try {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          startPolling();
        } else {
          // Se o usuário negar permissão, marcamos como negado
          setPreference("denied");
        }
      });
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Manipulador de clique para o botão Cancelar. Salva preferência como
   * "denied" e fecha o modal.
   */
  function handleDeny() {
    setPreference("denied");
    closeModal();
  }

  /**
   * Configura os eventos e decide se o modal deve ser exibido. Se o usuário
   * já tiver escolhido uma opção anteriormente, apenas inicia o polling
   * (quando aplicável) ou retorna.
   */
  function initNotificationModal() {
    const pref = getPreference();
    // Se já aceitou anteriormente, inicia polling caso a permissão esteja
    // concedida. Se a permissão ainda for "default" (não concedida nem
    // negada), não solicitamos novamente automaticamente.
    if (pref === "accepted") {
      if (Notification.permission === "granted") {
        startPolling();
      }
      return;
    }
    // Se já recusou, não faz nada
    if (pref === "denied") return;
    const refs = getModalRefs();
    if (!refs) return;
    // Impede múltiplas associações de evento
    if (!refs.acceptBtn.__bound) {
      refs.acceptBtn.addEventListener("click", (event) => {
        event.preventDefault();
        handleAccept();
      });
      refs.acceptBtn.__bound = true;
    }
    if (!refs.denyBtn.__bound) {
      refs.denyBtn.addEventListener("click", (event) => {
        event.preventDefault();
        handleDeny();
      });
      refs.denyBtn.__bound = true;
    }
    // Clique na camada de overlay não fecha o modal; apenas previne propagação
    if (refs.overlay && !refs.overlay.__bound) {
      refs.overlay.addEventListener("click", (event) => {
        event.preventDefault();
      });
      refs.overlay.__bound = true;
    }
    // Exibe o modal para a primeira decisão
    openModal();
  }

  // Aguarda o carregamento do DOM para inicializar o modal
  document.addEventListener("DOMContentLoaded", initNotificationModal);
})();

// -----------------------------------------------------------------------------
// Cookie Banner
// -----------------------------------------------------------------------------
(() => {
  const COOKIE_KEY = "tlu.cookies.consent";
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
  const NOTIFICATION_PREF_KEY = "tlu.notifications.preference";
  const banner = document.getElementById("cookie-banner");
  if (!banner) return;

  const acceptBtn = banner.querySelector('[data-cookie-action="accept"]');
  const denyBtn = banner.querySelector('[data-cookie-action="deny"]');

  function getConsent() {
    const cookies = document.cookie.split(";").map((entry) => entry.trim());
    const match = cookies.find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
    return match ? match.split("=")[1] : null;
  }

  function setConsent(value) {
    const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toUTCString();
    document.cookie = `${COOKIE_KEY}=${value};path=/;max-age=${COOKIE_MAX_AGE};expires=${expires};SameSite=Lax`;
  }

  function hideBanner() {
    if (banner.dataset.visible !== "true") return;
    banner.classList.remove("cookie-banner--visible");
    const onEnd = () => {
      banner.hidden = true;
      banner.removeEventListener("transitionend", onEnd);
    };
    banner.addEventListener("transitionend", onEnd);
    setTimeout(onEnd, 320);
    banner.dataset.visible = "false";
  }

  function showBanner() {
    if (banner.dataset.visible === "true") return;
    banner.hidden = false;
    requestAnimationFrame(() => {
      banner.classList.add("cookie-banner--visible");
    });
    banner.dataset.visible = "true";
  }

  function handleDecision(value) {
    setConsent(value);
    hideBanner();
  }

  function bindButtons() {
    if (acceptBtn && !acceptBtn.__cookieBound) {
      acceptBtn.addEventListener("click", () => handleDecision("accepted"));
      acceptBtn.__cookieBound = true;
    }
    if (denyBtn && !denyBtn.__cookieBound) {
      denyBtn.addEventListener("click", () => handleDecision("denied"));
      denyBtn.__cookieBound = true;
    }
  }

  function waitForNotificationInteraction() {
    const buttons = document.querySelectorAll("[data-notification-action]");
    if (!buttons.length) {
      setTimeout(waitForNotificationInteraction, 200);
      return;
    }
    buttons.forEach((btn) => {
      if (btn.__cookieHooked) return;
      btn.addEventListener("click", () => {
        setTimeout(() => {
          if (!getConsent()) showBanner();
        }, 350);
      });
      btn.__cookieHooked = true;
    });
  }

  function initCookieBanner() {
    if (getConsent()) {
      banner.parentElement && banner.parentElement.removeChild(banner);
      return;
    }
    bindButtons();
    const hasNotificationDecision = (() => {
      try {
        return !!localStorage.getItem(NOTIFICATION_PREF_KEY);
      } catch (_) {
        return false;
      }
    })();

    if (hasNotificationDecision) {
      showBanner();
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", waitForNotificationInteraction);
      return;
    }
    waitForNotificationInteraction();
  }

  initCookieBanner();
})();

// -----------------------------------------------------------------------------
// Service Worker registration
//
// To enable support for push notifications on mobile devices and allow the
// application to function offline, we register a service worker when the
// page loads. The service worker is defined in `/service-worker.js` at the
// root of the web application. Registration is wrapped in a feature check
// against `navigator.serviceWorker` to avoid errors on browsers that do not
// support service workers. Any errors during registration are logged to the
// console for debugging purposes.
//
(() => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch((err) => {
        console.error("Service worker registration failed", err);
      });
    });
  }
})();
