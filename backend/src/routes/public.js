const { Router } = require("express");
const db = require("../db/sqlite");
const PublicationRepository = require("../repositories/publicationRepository");
const MemberRepository = require("../repositories/memberRepository");

const router = Router();
const DEFAULT_YOUTUBE_CHANNEL_ID = (
  process.env.YOUTUBE_CHANNEL_ID || ""
).trim();
const YOUTUBE_API_KEY = (process.env.YOUTUBE_API_KEY || "").trim();
const MAX_YOUTUBE_LIMIT = 5;

const MAX_YOUTUBE_LIST_LIMIT = 50;

function parseIsoDuration(isoDuration) {
  if (typeof isoDuration !== "string") {
    return { seconds: 0, display: "0:00" };
  }
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return { seconds: 0, display: "0:00" };
  }
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  let display;
  if (hours > 0) {
    display = `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  } else {
    display = `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  return { seconds: totalSeconds, display };
}

async function fetchYoutubeVideoList(channelId, limit = 20) {
  const maxResults = Math.min(
    Math.max(parseInt(limit, 10) || 1, 1),
    MAX_YOUTUBE_LIST_LIMIT
  );
  if (!YOUTUBE_API_KEY || !channelId) return [];
  try {
    const searchParams = new URLSearchParams({
      part: "snippet",
      channelId,
      maxResults: String(maxResults),
      order: "date",
      type: "video",
      key: YOUTUBE_API_KEY,
    });
    const searchResp = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`
    );
    if (!searchResp.ok) return [];
    const searchData = await searchResp.json();
    const searchItems = Array.isArray(searchData.items) ? searchData.items : [];
    const videoIds = [];
    const metaById = {};
    searchItems.forEach((item) => {
      const vid = item?.id?.videoId;
      if (!vid) return;
      videoIds.push(vid);
      const snippet = item.snippet || {};
      metaById[vid] = {
        id: vid,
        title: decodeHtmlEntities(snippet.title || ""),
        publishedAt: snippet.publishedAt || null,
        thumbnailSource:
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          fallbackThumbnail(vid),
        url: `https://www.youtube.com/watch?v=${vid}`,
      };
    });
    if (!videoIds.length) return [];
    const videosParams = new URLSearchParams({
      part: "contentDetails,statistics",
      id: videoIds.join(","),
      key: YOUTUBE_API_KEY,
    });
    const videosResp = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`
    );
    if (!videosResp.ok) return [];
    const videosData = await videosResp.json();
    const videoItems = Array.isArray(videosData.items) ? videosData.items : [];
    const results = [];
    videoItems.forEach((item) => {
      const vid = item?.id;
      if (!vid || !metaById[vid]) return;
      const content = item.contentDetails || {};
      const stats = item.statistics || {};
      const { seconds, display } = parseIsoDuration(content.duration || "");
      const isShort = seconds <= 60;
      results.push({
        id: vid,
        videoId: vid,
        title: metaById[vid].title,
        publishedAt: metaById[vid].publishedAt,
        url: metaById[vid].url,
        thumbnail: `/api/public/youtube/thumbnail/${vid}`,
        thumbnailSource: metaById[vid].thumbnailSource,
        durationSeconds: seconds,
        durationDisplay: display,
        viewCount: parseInt(stats.viewCount || stats.view_count || "0", 10),
        type: isShort ? "short" : "video",
      });
    });
    return results;
  } catch (err) {
    console.error("youtube-video-list", err);
    return [];
  }
}

function sanitizeYoutubeLimit(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), MAX_YOUTUBE_LIMIT);
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function fallbackThumbnail(videoId) {
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
}

function parseYoutubeFeed(xmlText, limit) {
  if (typeof xmlText !== "string") return [];
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xmlText)) && items.length < limit) {
    const entry = match[1];
    const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!videoIdMatch) continue;
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const linkMatch = entry.match(
      /<link[^>]+rel="alternate"[^>]+href="([^"]+)"/
    );
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const thumbMatch = entry.match(/media:thumbnail[^>]+url="([^"]+)"/i);
    const videoId = videoIdMatch[1];
    const thumbnailSource = thumbMatch
      ? thumbMatch[1]
      : fallbackThumbnail(videoId);
    items.push({
      videoId,
      title: decodeHtmlEntities(titleMatch ? titleMatch[1] : ""),
      url: linkMatch
        ? linkMatch[1]
        : `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: publishedMatch ? publishedMatch[1] : null,
      thumbnail: `/api/public/youtube/thumbnail/${videoId}`,
      thumbnailSource,
    });
  }
  return items;
}

function coerceToNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMemberActive(member) {
  if (!member) return false;
  if (member.active != null) return !!member.active;
  if (member.is_active != null) {
    return Number(member.is_active) !== 0;
  }
  return !member.deleted_at;
}

function buildJournalistProfileUrl(member) {
  if (!member || member.id == null) return null;
  const params = new URLSearchParams();
  const displayName = (member.nome || member.name || "").trim();
  params.set("name", displayName);
  params.set("id", String(member.id));
  return `/jornalista?${params.toString()}`;
}

function sanitizeMemberForPublic(member) {
  if (!member) return null;
  const active = isMemberActive(member);
  const publicacoesTotal = coerceToNumber(
    member.total_publicacoes ?? member.publicacoes,
    member.publicacoes
  );
  return {
    id: member.id,
    nome: member.nome,
    role: member.role,
    team_member: member.team_member ? 1 : 0,
    about: member.about || "",
    o_que_faz: member.o_que_faz || "",
    instagram: member.instagram || "",
    linkedin: member.linkedin || "",
    twitter: member.twitter || "",
    email_social: member.email_social || "",
    avatar_light: member.avatar_light || "",
    avatar_dark: member.avatar_dark || "",
    cidade: member.cidade || "",
    publicacoes: coerceToNumber(member.publicacoes, publicacoesTotal),
    total_publicacoes: publicacoesTotal,
    total_exclusoes: coerceToNumber(member.total_exclusoes, 0),
    created_at: member.created_at || null,
    updated_at: member.updated_at || null,
    deleted_at: member.deleted_at || null,
    is_active: active ? 1 : 0,
    active,
    profile_url: buildJournalistProfileUrl(member),
  };
}

function sanitizeMemberDetails(details) {
  if (!details || !details.member) return null;
  const member = sanitizeMemberForPublic(details.member);
  const stats = {
    publicacoes: coerceToNumber(
      details.stats?.publicacoes,
      member ? member.publicacoes : 0
    ),
    exclusoes: coerceToNumber(details.stats?.exclusoes, 0),
  };
  const latest = Array.isArray(details.latestPublicacoes)
    ? details.latestPublicacoes.map((item) => ({
        id: item.id,
        titulo: item.titulo,
        categoria: item.categoria,
        slug: item.slug,
        created_at: item.created_at,
      }))
    : [];
  return {
    member,
    stats,
    latestPublicacoes: latest,
  };
}

function filterMembersByActive(members, includeInactive) {
  if (!Array.isArray(members)) return [];
  if (includeInactive) return members;
  return members.filter((member) => isMemberActive(member));
}

async function fetchYoutubeFromOfficial(channelId, limit) {
  if (!YOUTUBE_API_KEY) return [];
  try {
    const params = new URLSearchParams({
      part: "snippet",
      channelId,
      maxResults: String(limit),
      order: "date",
      type: "video",
      key: YOUTUBE_API_KEY,
    });
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );
    if (!response.ok) return [];
    const body = await response.json();
    if (!Array.isArray(body.items)) return [];
    return body.items
      .map((item) => {
        const videoId = item?.id?.videoId;
        if (!videoId) return null;
        const snippet = item.snippet || {};
        const thumbs = snippet.thumbnails || {};
        const thumbnailSource =
          thumbs.high?.url ||
          thumbs.medium?.url ||
          thumbs.default?.url ||
          fallbackThumbnail(videoId);
        const thumbnail = `/api/public/youtube/thumbnail/${videoId}`;
        return {
          videoId,
          title: decodeHtmlEntities(snippet.title || ""),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt: snippet.publishedAt || null,
          thumbnail,
          thumbnailSource,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("youtube-official", error);
    return [];
  }
}

async function fetchYoutubeFromFeed(channelId, limit) {
  try {
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    if (!response.ok) return [];
    const xml = await response.text();
    return parseYoutubeFeed(xml, limit);
  } catch (error) {
    console.error("youtube-feed", error);
    return [];
  }
}

function mapArticleRow(row, extra = {}) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    category: row.category,
    description: row.description || "",
    image: row.image || "",
    image_credit: row.image_credit || "",
    content: row.content ?? undefined,
    views: row.views || 0,
    unique_views: row.visitas_unicas || row.unique_views || 0,
    // A coluna de cliques foi removida. Não retornamos mais esse dado.
    updated_at: row.updated_at || null,
    author: {
      id: row.author_id,
      name: row.author_name || "",
      avatarUrl: row.avatar_light || row.avatar_dark || "",
    },
    slug: row.slug || null,
    ...extra,
  };
}

const selectBySlug = db.prepare(`
  SELECT
    p.id,
    p.slug,
    p.title,
    p.date,
    p.category,
    p.description,
    p.image,
    p.image_credit,
    p.content,
    p.views,
    p.visitas_unicas,
    p.updated_at,
    p.author_id,
    m.nome AS author_name,
    m.avatar_light,
    m.avatar_dark
  FROM publications p
  JOIN members m ON m.id = p.author_id
  WHERE p.slug = ? AND p.status = 'published'
  LIMIT 1
`);

const incrementViewsById = db.prepare(
  "UPDATE publications SET views = views + 1 WHERE id = ? AND status = 'published'"
);

// Incrementa o contador de visualizações únicas (visitas_unicas) para uma publicação específica.
const incrementUniqueViewsById = db.prepare(
  "UPDATE publications SET visitas_unicas = visitas_unicas + 1 WHERE id = ? AND status = 'published'"
);

// O contador de cliques foi removido; não há necessidade de incrementar cliques.

const fetchBySlugWithIncrement = db.transaction((slug) => {
  const current = selectBySlug.get(slug);
  if (!current) return null;
  incrementViewsById.run(current.id);
  return selectBySlug.get(slug) || current;
});

router.get("/highlights", (req, res) => {
  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 3)
    : 3;
  try {
    const explicitHighlights = PublicationRepository.listHighlights();
    const hasExplicit = Object.keys(explicitHighlights).length > 0;
    const buildPayload = (rows, cardResolver) =>
      rows.map((row, index) => {
        if (!row) return null;
        const normalized = mapArticleRow(
          {
            ...row,
            avatar_light: row.author_avatar_light,
            avatar_dark: row.author_avatar_dark,
          },
          {
            is_highlighted: row.is_highlighted ? 1 : 0,
          }
        );
        const cardNumber = cardResolver(row, index);
        normalized.cardNumber = cardNumber;
        return normalized;
      });

    if (hasExplicit) {
      const ordered = [];
      for (let card = 1; card <= limit; card += 1) {
        ordered.push(explicitHighlights[card] || null);
      }
      const payload = buildPayload(
        ordered,
        (row, index) =>
          row?.cardNumber || row?.card_number || index + 1
      );
      return res.json(payload);
    }

    const fallbackRows = PublicationRepository.listPublishedHighlights(limit);
    const payload = buildPayload(
      fallbackRows,
      (row, index) =>
        row?.cardNumber || row?.card_number || index + 1
    );
    return res.json(payload);
  } catch (error) {
    console.error("public-highlights", error);
    return res.status(500).json({ error: "Erro ao listar destaques" });
  }
});

router.get("/team", (_req, res) => {
  try {
    const members = MemberRepository.listTeamMembers();
    const payload = members.map((member) => sanitizeMemberForPublic(member));
    return res.json(payload);
  } catch (error) {
    console.error("public-team", error);
    return res.status(500).json({ error: "Erro ao listar equipe" });
  }
});

router.get("/journalists", (req, res) => {
  const includeInactiveParam = String(
    req.query.includeInactive ?? "true"
  ).toLowerCase();
  const includeInactive =
    includeInactiveParam !== "false" && includeInactiveParam !== "0";
  try {
    const members = MemberRepository.listAll();
    const filtered = filterMembersByActive(members, includeInactive);
    const payload = filtered.map((member) => sanitizeMemberForPublic(member));
    return res.json(payload);
  } catch (error) {
    console.error("public-journalists", error);
    return res.status(500).json({ error: "Erro ao listar jornalistas" });
  }
});

router.get("/journalists/:id", (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }
  try {
    const details = MemberRepository.getDetails(id, { includeInactive: true });
    if (!details) {
      return res.status(404).json({ error: "Jornalista não encontrado" });
    }
    return res.json(sanitizeMemberDetails(details));
  } catch (error) {
    console.error("public-journalist", error);
    return res.status(500).json({ error: "Erro ao carregar jornalista" });
  }
});
router.get("/journalist", (req, res) => {
  const requestedName = String(req.query.name ?? "").trim();
  const rawId = req.query.id ?? req.query.member_id;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inv�lido" });
  }
  try {
    const details = MemberRepository.getDetails(id, { includeInactive: true });
    if (!details) {
      return res.status(404).json({ error: "Jornalista n�o encontrado" });
    }
    const payload = sanitizeMemberDetails(details);
    if (payload?.member) {
      payload.member.profile_url =
        payload.member.profile_url || buildJournalistProfileUrl(payload.member);
      payload.member.requested_name = requestedName;
      if (requestedName) {
        const storedName = String(payload.member.nome || "").trim();
        payload.member.name_matches_request =
          storedName.toLowerCase() === requestedName.toLowerCase();
      }
    }
    return res.json(payload);
  } catch (error) {
    console.error("public-journalist-query", error);
    return res
      .status(500)
      .json({ error: "Erro ao carregar jornalista (consulta)" });
  }
});

router.get("/news", (req, res) => {
  const n = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(n) ? Math.max(1, Math.min(n, 100)) : 24;
  const cat = (req.query.cat || "").trim();

  const qslug = (req.query.slug || "").trim().toLowerCase();
  if (qslug) {
    try {
      // Quando o slug é fornecido, incrementamos as visualizações totais e únicas, se aplicável.
      const row = selectBySlug.get(qslug);
      if (!row) {
        return res.status(404).json({ error: "Publicação não encontrada" });
      }
      // Sempre incrementa o contador de visualizações totais.
      incrementViewsById.run(row.id);
      // Verifica cookie de visualizações únicas. Utiliza um cookie que armazena IDs de publicações
      // que o visitante já acessou. Se o ID atual não estiver presente, incrementa visitas_unicas
      // e atualiza o cookie.
      try {
        const cookieName = "tlu_viewed";
        const visited = Array.isArray(req.cookies?.[cookieName])
          ? req.cookies[cookieName]
          : String(req.cookies?.[cookieName] || "")
              .split(",")
              .filter(Boolean);
        const idStr = String(row.id);
        if (!visited.includes(idStr)) {
          incrementUniqueViewsById.run(row.id);
          visited.push(idStr);
        }
        // Define um cookie com expiração de 365 dias para manter o histórico de IDs vistos.
        res.cookie(cookieName, visited.join(","), {
          maxAge: 365 * 24 * 60 * 60 * 1000,
          httpOnly: false,
          sameSite: "lax",
        });
      } catch (_err) {
        // em caso de erro ao manipular cookies, ignoramos a contagem de únicas.
      }
      // Busca novamente a linha atualizada para retornar os contadores corretos.
      const updated = selectBySlug.get(qslug) || row;
      return res.json(
        mapArticleRow(updated, {
          content: updated.content || "",
        })
      );
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Falha ao buscar por slug" });
    }
  }

  let sql = `
    SELECT
      p.id,
      p.slug,
      p.title,
      p.date,
      p.category,
      p.description,
      p.image,
      p.image_credit,
      p.views,
      p.visitas_unicas,
      p.updated_at,
      p.author_id,
      m.nome AS author_name,
      m.avatar_light,
      m.avatar_dark
    FROM publications p
    JOIN members m ON m.id = p.author_id
    WHERE p.status = 'published'
  `;
  const params = [];

  if (cat) {
    sql += ` AND (p.category = ? OR p.category LIKE ? || '/%')`;
    params.push(cat, cat);
  }

  sql += ` ORDER BY datetime(p.date) DESC, p.id DESC LIMIT ?`;
  params.push(limit);

  try {
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map((r) => mapArticleRow(r)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao listar notícias" });
  }
});

router.get("/news/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  try {
    const selectArticle = db.prepare(
      `
      SELECT
        p.id,
        p.slug,
        p.title,
        p.date,
        p.category,
        p.description,
        p.image,
        p.image_credit,
        p.content,
        p.views,
        p.visitas_unicas,
        p.updated_at,
        p.author_id,
        m.nome AS author_name,
        m.avatar_light,
        m.avatar_dark
      FROM publications p
      JOIN members m ON m.id = p.author_id
      WHERE p.id = ? AND p.status = 'published'
      LIMIT 1
    `
    );
    const fetchArticle = (articleId) => {
      return selectArticle.get(articleId);
    };
    let row;
    try {
      row = fetchArticle(id);
      if (!row) throw new Error("notfound");
      // Incrementa total de visualizações
      incrementViewsById.run(row.id);
      // Controla visualizações únicas através do cookie
      try {
        const cookieName = "tlu_viewed";
        const visited = Array.isArray(req.cookies?.[cookieName])
          ? req.cookies[cookieName]
          : String(req.cookies?.[cookieName] || "")
              .split(",")
              .filter(Boolean);
        const idStr = String(row.id);
        if (!visited.includes(idStr)) {
          incrementUniqueViewsById.run(row.id);
          visited.push(idStr);
        }
        res.cookie(cookieName, visited.join(","), {
          maxAge: 365 * 24 * 60 * 60 * 1000,
          httpOnly: false,
          sameSite: "lax",
        });
      } catch (_err) {}
      // retorna a versão atualizada
      const updated = fetchArticle(id) || row;
      res.json(
        mapArticleRow(updated, {
          content: updated.content || "",
        })
      );
    } catch (err) {
      if (err.message === "notfound" || !row) {
        return res.status(404).json({ error: "Publicação não encontrada" });
      }
      console.error(err);
      res.status(500).json({ error: "Erro ao carregar a notícia" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar a notícia" });
  }
});

router.get("/youtube/latest", async (req, res) => {
  const channelId = (
    req.query.channelId ||
    DEFAULT_YOUTUBE_CHANNEL_ID ||
    ""
  ).trim();
  if (!channelId) {
    return res.status(400).json({ error: "Canal nao informado" });
  }

  const limit = sanitizeYoutubeLimit(req.query.limit, 1);

  try {
    let items = await fetchYoutubeFromOfficial(channelId, limit);
    if (!items.length) {
      items = await fetchYoutubeFromFeed(channelId, limit);
    }

    res.json({
      channelId,
      items: Array.isArray(items) ? items.slice(0, limit) : [],
    });
  } catch (error) {
    console.error("youtube-latest", error);
    res.status(500).json({ error: "Erro ao buscar videos do YouTube" });
  }
});

router.get("/youtube/videos", async (req, res) => {
  const channelId = (
    req.query.channelId ||
    DEFAULT_YOUTUBE_CHANNEL_ID ||
    ""
  ).trim();
  if (!channelId) {
    return res.status(400).json({ error: "Canal nao informado" });
  }
  // Determine limit and page for pagination
  const perPage = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(perPage)
    ? Math.min(Math.max(perPage, 1), MAX_YOUTUBE_LIST_LIMIT)
    : 9;
  const page = Number.parseInt(req.query.page, 10);
  const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
  const sort = (req.query.sort || "recent").toString().toLowerCase();
  let type = (req.query.type || "").toString().toLowerCase();
  if (!type || type === "all") type = null;
  try {
    // Fetch all available videos up to the requested limit times the page number.
    // We fetch pageNumber * limit items up front and then slice the current page.
    const fetchCount = pageNumber * limit;
    let allVideos = await fetchYoutubeVideoList(channelId, fetchCount);
    // If no videos are returned (likely due to missing API key), fall back to
    // the YouTube official API or feed. These fallbacks supply title,
    // publishedAt and thumbnail but do not include duration or viewCount.
    if (!Array.isArray(allVideos) || allVideos.length === 0) {
      let fallback = [];
      try {
        fallback = await fetchYoutubeFromOfficial(channelId, fetchCount);
        if (!fallback || fallback.length === 0) {
          fallback = await fetchYoutubeFromFeed(channelId, fetchCount);
        }
      } catch (err) {
        console.error("youtube-videos-fallback", err);
        fallback = [];
      }
      if (Array.isArray(fallback) && fallback.length) {
        allVideos = fallback.map((it) => {
          return {
            videoId: it.videoId,
            title: it.title,
            publishedAt: it.publishedAt || null,
            thumbnail: it.thumbnail || it.thumbnailSource || "",
            url: it.url || `https://www.youtube.com/watch?v=${it.videoId}`,
            durationSeconds: null,
            durationDisplay: null,
            viewCount: null,
            type: "video",
          };
        });
      } else {
        allVideos = [];
      }
    }
    // Filter by type if specified
    let filtered = allVideos;
    if (type === "video") {
      filtered = allVideos.filter((v) => v.type === "video");
    } else if (type === "short") {
      filtered = allVideos.filter((v) => v.type === "short");
    }
    // Sort items according to requested order
    if (sort === "oldest") {
      filtered.sort((a, b) => {
        // ascending by date
        return (a.publishedAt || "") > (b.publishedAt || "") ? 1 : -1;
      });
    } else if (sort === "views") {
      filtered.sort((a, b) => {
        const va = Number.isFinite(a.viewCount) ? a.viewCount : -1;
        const vb = Number.isFinite(b.viewCount) ? b.viewCount : -1;
        return vb - va;
      });
    } else {
      // default: recent first (descending by date)
      filtered.sort((a, b) => {
        return (a.publishedAt || "") < (b.publishedAt || "") ? 1 : -1;
      });
    }
    // Paginate results
    const startIndex = (pageNumber - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);
    return res.json({
      channelId,
      page: pageNumber,
      limit,
      total: filtered.length,
      items: paginated,
    });
  } catch (error) {
    console.error("youtube-videos", error);
    return res.status(500).json({ error: "Erro ao buscar videos do YouTube" });
  }
});

router.get("/youtube/thumbnail/:videoId", async (req, res) => {
  const videoId = (req.params.videoId || "").trim();
  if (!videoId) {
    return res.status(400).json({ error: "Video invalido" });
  }

  const targetUrl = "https://img.youtube.com/vi/" + videoId + "/hqdefault.jpg";

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(404).json({ error: "Thumb nao encontrada" });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "image/jpeg"
    );
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
  } catch (error) {
    console.error("youtube-thumbnail", error);
    return res.status(500).json({ error: "Falha ao obter thumbnail" });
  }
});

router.get("/news/by-slug/:slug", (req, res) => {
  const slug = String(req.params.slug || "")
    .trim()
    .toLowerCase();
  if (!slug) return res.status(400).json({ error: "slug vazio" });
  try {
    const current = selectBySlug.get(slug);
    if (!current)
      return res.status(404).json({ error: "Publicação não encontrada" });
    // Incrementa total de visualizações
    incrementViewsById.run(current.id);
    // Verifica cookie de visualizações únicas
    try {
      const cookieName = "tlu_viewed";
      const visited = Array.isArray(req.cookies?.[cookieName])
        ? req.cookies[cookieName]
        : String(req.cookies?.[cookieName] || "")
            .split(",")
            .filter(Boolean);
      const idStr = String(current.id);
      if (!visited.includes(idStr)) {
        incrementUniqueViewsById.run(current.id);
        visited.push(idStr);
      }
      res.cookie(cookieName, visited.join(","), {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        sameSite: "lax",
      });
    } catch (_err) {}
    // Busca a linha novamente para garantir que retornamos os contadores atualizados
    const updated = selectBySlug.get(slug) || current;
    return res.json(
      mapArticleRow(updated, {
        content: updated.content || "",
      })
    );
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Falha ao buscar por slug" });
  }
});

// Endpoint para incrementar contador de cliques em uma publicação.
// Qualquer interação de clique dentro de um artigo (como compartilhar ou ver mais) deve acionar este endpoint.
// O endpoint de cliques foi removido. Contadores de cliques não são mais utilizados.

// Endpoint para obter a publicação mais recente publicada.
// Esta rota serve para o sistema de notificações push no frontend. Ela
// retorna apenas informações mínimas sobre a última publicação
// publicada (ID, título, slug, data e categoria), reduzindo o
// volume de dados transferidos.
router.get("/latest-publication", (_req, res) => {
  try {
    const list = PublicationRepository.list({ status: "published" });
    const latest = Array.isArray(list) && list.length ? list[0] : null;
    if (!latest) {
      return res.json(null);
    }
    return res.json({
      id: latest.id,
      title: latest.title,
      slug: latest.slug || null,
      date: latest.date,
      category: latest.category,
    });
  } catch (error) {
    console.error("latest-publication", error);
    return res.status(500).json({ error: "Erro ao buscar publicação" });
  }
});

module.exports = router;
