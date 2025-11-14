import { calcularTempoLeitura } from "../utils/calcularTempoLeitura.js";

(function () {
  function getSlugFromPath() {
    const m = location.pathname.match(/^\/noticia\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function ensureMeta(name, content) {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content || "");
  }

  const SITE_BASE_URL = (
    window.__SITE_BASE_URL__ ||
    window.location.origin ||
    "https://www.thelastupdate.com.br"
  ).replace(/\/$/, "");

  function ensureMetaProperty(property, content) {
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("property", property);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content || "");
  }

  function ensureCanonical(url) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", url);
  }

  function absoluteUrl(value) {
    if (!value) return `${SITE_BASE_URL}/`;
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith("//")) {
      return `${window.location.protocol}${value}`;
    }
    const normalized = value.startsWith("/") ? value : `/${value}`;
    return `${SITE_BASE_URL}${normalized}`;
  }

  function stripHtml(html) {
    if (!html) return "";
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent ? temp.textContent.trim() : "";
  }

  function updateNewsArticleLd(payload) {
    const scriptId = "newsarticle-ld";
    let script = document.getElementById(scriptId);
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(payload, null, 2);
  }

  function formatLabel(slug) {
    switch (slug) {
      case "mundo-tech":
        return "Mundo Tech";
      case "games":
        return "Games";
      case "cultura-pop":
        return "Cultura Pop";
      case "nerd":
        return "Nerd";
      case "filmes":
        return "Filmes";
      case "series":
        return "Séries";
      default:
        return slug;
    }
  }

  function parseDatabaseTimestamp(raw) {
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value) return null;
    const isoCandidate = value.includes("T") ? value : value.replace(" ", "T");
    const withZone = /Z$/i.test(isoCandidate)
      ? isoCandidate
      : `${isoCandidate}Z`;
    let parsed = new Date(withZone);
    if (Number.isNaN(parsed.getTime())) {
      parsed = new Date(value);
    }
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatRelativeUpdated(date, now = new Date()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "";

    const diffSeconds = Math.floor(diffMs / 1000);
    if (diffSeconds < 60) {
      const seconds = Math.max(diffSeconds, 1);
      return `${seconds} segundo${seconds === 1 ? "" : "s"} atrás`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes} minuto${diffMinutes === 1 ? "" : "s"} atrás`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hora${diffHours === 1 ? "" : "s"} atrás`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
      return `${diffDays} dia${diffDays === 1 ? "" : "s"} atrás`;
    }

    let months =
      (now.getFullYear() - date.getFullYear()) * 12 +
      (now.getMonth() - date.getMonth());
    if (now.getDate() < date.getDate()) months -= 1;
    if (months < 1) months = 1;
    return `${months} mês${months === 1 ? "" : "es"} atrás`;
  }
  function formatDateTimeTooltip(date) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date);
    } catch (_err) {
      return date.toISOString();
    }
  }

  function formatHourMinute(date) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (_err) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    }
  }

  function updateBreadcrumb(category, sub) {
    const nav = document.getElementById("article-nav");
    if (!nav) return;
    const parts = [];
    parts.push(`<a href="/">Início</a>`);
    if (category === "nerd") {
      parts.push(
        `<a href="/?cat=${category.toLowerCase()}&sort=recent">${formatLabel(
          category
        )}</a>`
      );
    }
    if (category === "nerd" && sub) {
      parts.push(
        `<a href="/?cat=cultura-pop&sort=recent&sub=${category.toLowerCase()}${sub}">${formatLabel(
          sub
        )}</a>`
      );
    }
    nav.innerHTML = parts.filter(Boolean).join(`<span>></span>`);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const slug = getSlugFromPath();

    if (!id && !slug) return;

    try {
      const API = (window.__API_BASE__ || "/api").replace(/\/$/, "");
      const url = slug
        ? `${API}/public/news/by-slug/${encodeURIComponent(slug)}`
        : `${API}/public/news/${encodeURIComponent(id)}`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar artigo");
      const item = await res.json();
      // Armazena a publicação atual globalmente para acesso em outros contextos (ex: contagem de cliques)
      try {
        window.__currentArticle = item;
      } catch (_) {}

      const defaultDescription =
        "Confira as últimas notícias e análises do The Last Update.";
      const descSource =
        item && (item.description || item.subtitle || item.excerpt || "");
      const normalizedDescription =
        (descSource && descSource.trim()) || defaultDescription;
      const articleTitle = item?.title || "TLU - Artigo";
      const pageTitle = `${articleTitle} | The Last Update`;
      document.title = pageTitle;
      ensureMeta("description", normalizedDescription);
      ensureMetaProperty("og:title", articleTitle);
      ensureMetaProperty("og:description", normalizedDescription);
      ensureMeta("twitter:title", articleTitle);
      ensureMeta("twitter:description", normalizedDescription);

      const canonicalUrl = item
        ? item.slug
          ? `${SITE_BASE_URL}/noticia/${encodeURIComponent(item.slug)}`
          : `${SITE_BASE_URL}/noticia?id=${item.id}`
        : `${SITE_BASE_URL}/noticia`;
      ensureCanonical(canonicalUrl);
      ensureMetaProperty("og:url", canonicalUrl);
      ensureMeta("twitter:url", canonicalUrl);

      const featuredImage = item?.image ? absoluteUrl(item.image) : "";
      const heroImage =
        featuredImage || `${SITE_BASE_URL}/assets/img/og-default.png`;
      ensureMetaProperty("og:image", heroImage);
      ensureMeta("twitter:image", heroImage);

      if (!item) return;

      const publishedAt = parseDatabaseTimestamp(item.date);
      const updatedAt = parseDatabaseTimestamp(
        item.updated_at || item.updatedAt || item.date
      );
      if (publishedAt) {
        ensureMetaProperty("article:published_time", publishedAt.toISOString());
      }
      if (updatedAt) {
        ensureMetaProperty("article:modified_time", updatedAt.toISOString());
      }

      updateNewsArticleLd({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        mainEntityOfPage: canonicalUrl,
        headline: articleTitle,
        datePublished: publishedAt ? publishedAt.toISOString() : undefined,
        dateModified: updatedAt ? updatedAt.toISOString() : undefined,
        image: [heroImage],
        author: item.author?.name
          ? { "@type": "Person", name: item.author.name }
          : { "@type": "Organization", name: "The Last Update" },
        publisher: {
          "@type": "NewsMediaOrganization",
          name: "The Last Update",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_BASE_URL}/assets/img/logo/tlu-logo.svg`,
          },
        },
        description: normalizedDescription,
        articleSection: item.category || undefined,
        articleBody: stripHtml(item.content || normalizedDescription),
      });

      const titleEl = document.getElementById("article-title");
      if (titleEl) titleEl.textContent = item.title || "";
      const descEl = document.getElementById("article-description");
      if (descEl) {
        const rawDesc = item?.description || "";
        if (rawDesc && rawDesc.trim()) {
          descEl.textContent = rawDesc;
          descEl.hidden = false;
        } else {
          descEl.textContent = "";
          descEl.hidden = true;
        }
      }
      const authorEl = document.getElementById("author-name");
      if (authorEl) {
        const authorName = item.author?.name || "";
        const authorId = item.author?.id ?? item.author_id ?? null;
        authorEl.textContent = authorName;
        // Deixa o nome do autor clicável e adiciona redirecionamento para a página do jornalista
        authorEl.style.cursor = "pointer";
        authorEl.addEventListener("click", (e) => {
          e.preventDefault();
          if (!authorName) return;
          const params = new URLSearchParams();
          params.set("name", authorName);
          if (authorId != null) params.set("id", authorId);
          window.location.href = `/jornalista?${params.toString()}`;
        });
      }
      const dateEl = document.querySelector(".article-date");
      if (dateEl) {
        dateEl.dateTime = item.date || "";
        if (window.formatDatePtBr) {
          dateEl.textContent = window.formatDatePtBr(item.date);
        } else {
          dateEl.textContent = item.date || "";
        }
      }

      const articleTimeEl = document.getElementById("article-time");
      const writerTimeEl = document.getElementById("writer-time");
      let relativeUpdatedLabel = updatedAt
        ? formatRelativeUpdated(updatedAt)
        : "";
      let readingLabel = "";

      function renderArticleTime() {
        if (!articleTimeEl) return;
        const parts = [];
        if (readingLabel) parts.push(readingLabel);
        articleTimeEl.textContent = parts.join(" | ");
        if (updatedAt) {
          try {
            articleTimeEl.dataset.updatedAt = updatedAt.toISOString();
          } catch (_err) {
            articleTimeEl.dataset.updatedAt = "";
          }
          try {
            articleTimeEl.title = formatDateTimeTooltip(updatedAt);
          } catch (_err) {
            articleTimeEl.removeAttribute("title");
          }
        } else {
          articleTimeEl.removeAttribute("title");
          if (articleTimeEl.dataset) delete articleTimeEl.dataset.updatedAt;
        }
      }

      if (writerTimeEl) {
        if (relativeUpdatedLabel) {
          writerTimeEl.textContent = relativeUpdatedLabel;
          try {
            writerTimeEl.title = formatDateTimeTooltip(updatedAt);
          } catch (_err) {
            writerTimeEl.removeAttribute("title");
          }
        } else if (updatedAt) {
          writerTimeEl.textContent = formatHourMinute(updatedAt);
          try {
            writerTimeEl.title = formatDateTimeTooltip(updatedAt);
          } catch (_err) {
            writerTimeEl.removeAttribute("title");
          }
        } else {
          writerTimeEl.textContent = "";
          writerTimeEl.removeAttribute("title");
        }
      }

      renderArticleTime();
      const pictureEl = document.getElementById("article-picture");
      const imgEl = document.getElementById("article-image");
      const imageCreditEl = document.getElementById("article-image-credit");

      if (imgEl) {
        if (featuredImage) {
          imgEl.src = featuredImage;
          imgEl.alt = item.title || "Imagem";
        } else {
          imgEl.removeAttribute("src");
        }
      }
      if (imageCreditEl) {
        const creditText = String(item.image_credit || "").trim();
        if (creditText) {
          imageCreditEl.textContent = `Créditos: ${creditText}`;
          imageCreditEl.hidden = false;
        } else {
          imageCreditEl.textContent = "";
          imageCreditEl.hidden = true;
        }
      }
      const contentEl = document.getElementById("article-content");
      if (contentEl) {
        contentEl.innerHTML = item.content || "";
        contentEl.style.overflowWrap = "break-word";
      }
      if (articleTimeEl && contentEl) {
        const rawText = contentEl.innerText || contentEl.textContent || "";
        const estimated = calcularTempoLeitura(rawText);
        readingLabel = estimated
          ? `Tempo de leitura: ${estimated} minuto${estimated > 1 ? "s" : ""}`
          : "";
        renderArticleTime();
      }
      let sub = null;
      let catSlug = item.category || "";
      if (catSlug.includes("/")) {
        const parts = catSlug.split("/");
        catSlug = parts[0];
        sub = parts[1];
      }
      updateBreadcrumb(catSlug, sub);
    } catch (e) {
      console.error(e);
    }
  });

  window.onscroll = function () {
    const scrollTop =
      document.documentElement.scrollTop || document.body.scrollTop;
    const scrollHeight =
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight;
    const progress = (scrollTop / scrollHeight) * 100;
    const bar = document.getElementById("progress-bar");
    if (bar) bar.style.width = progress + "%";
  };

  // [TLU] Social share handlers
  function getMetaDescription() {
    const el = document.querySelector('meta[name="description"]');
    return el ? el.getAttribute("content") || "" : "";
  }

  function openPopup(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_err) {
      location.href = url;
    }
  }

  function buildShareData() {
    const title = document.title || "The Last Update";
    const url = location.href;
    const text = getMetaDescription() || title;
    return { title, url, text };
  }

  function wireShareButtons() {
    const btnWhats =
      document.getElementById("btn-whats") ||
      document.getElementById("btn-what");
    const btnX = document.getElementById("btn-x");
    const btnComp = document.getElementById("btn-comp");

    const { title, url, text } = buildShareData();

    // Identificador da publicação atual. Pode ser definido após carregamento do artigo.
    const pubId = (function () {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get("id");
      if (pid) return pid;
      const slugFromPath = getSlugFromPath && getSlugFromPath();
      // Quando acessada via slug, o endpoint retorna o objeto contendo id; salvamos no atributo global
      try {
        const art = window.__currentArticle;
        if (art && art.id) return art.id;
      } catch (_) {}
      return null;
    })();

    // A funcionalidade de registrar cliques foi removida. Não é necessário enviar requisição ao servidor.

    if (btnWhats) {
      btnWhats.addEventListener("click", (e) => {
        e.preventDefault();
        const msg = encodeURIComponent(`${title} — ${url}`);
        const wa = `https://wa.me/?text=${msg}`;
        openPopup(wa);
      });
    }

    if (btnX) {
      btnX.addEventListener("click", (e) => {
        e.preventDefault();
        const u = encodeURIComponent(url);
        const t = encodeURIComponent(title);
        const tw = `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
        openPopup(tw);
      });
    }

    if (btnComp) {
      btnComp.addEventListener("click", async (e) => {
        e.preventDefault();
        const data = buildShareData();

        if (navigator.share) {
          try {
            await navigator.share({
              title: data.title,
              text: data.text,
              url: data.url,
            });
          } catch (_err) {
            // user canceled or share failed — no-op
          }
          return;
        }

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(data.url);
          } else {
            const ta = document.createElement("textarea");
            ta.value = data.url;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
          }
          showCopyToast("Link copiado");
        } catch (_err) {
          window.prompt("Copie o link:", data.url);
        }
      });
    }
  }

  function showCopyToast(message) {
    const el = document.createElement("div");
    el.textContent = message || "Copiado";
    el.setAttribute("role", "status");
    el.style.position = "fixed";
    el.style.bottom = "24px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 14px";
    el.style.border = "1px solid var(--color-stroke)";
    el.style.background = "var(--color-card)";
    el.style.color = "var(--color-text-primary)";
    el.style.borderRadius = "var(--bdr-primary)";
    el.style.boxShadow = "var(--box-shadow-soft)";
    el.style.zIndex = "9999";
    el.style.fontSize = "14px";
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity 200ms ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 220);
    }, 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireShareButtons);
  } else {
    wireShareButtons();
  }
})();
