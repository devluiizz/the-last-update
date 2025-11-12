const db = require("../db/sqlite");

const RANGE_MAP = {
  all: null,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

function parseRange(value) {
  const key = String(value || "30d").toLowerCase();
  if (RANGE_MAP.hasOwnProperty(key)) return { key, days: RANGE_MAP[key] };
  return { key: "30d", days: RANGE_MAP["30d"] };
}

function parseDateInput(value, { fallbackToToday = false } = {}) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      return fallbackToToday ? new Date() : null;
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      12,
      0,
      0,
      0
    );
  }
  if (value === null || value === undefined) {
    return fallbackToToday ? new Date() : null;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split("-").map((part) => Number(part));
    if (
      !Number.isNaN(year) &&
      !Number.isNaN(month) &&
      !Number.isNaN(day) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return fallbackToToday ? new Date() : null;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0
  );
}

function toDateOnly(input) {
  const date = parseDateInput(input);
  if (!date) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function toDateTime(input, endOfDay) {
  const date = parseDateInput(input);
  if (!date) return null;
  const clone = new Date(date);
  if (endOfDay) clone.setHours(23, 59, 59, 999);
  else clone.setHours(0, 0, 0, 0);
  return `${toDateOnly(clone)} ${String(clone.getHours()).padStart(
    2,
    "0"
  )}:${String(clone.getMinutes()).padStart(2, "0")}:${String(
    clone.getSeconds()
  ).padStart(2, "0")}`;
}

function getRangeBounds(rangeKey) {
  const { key, days } = parseRange(rangeKey);
  if (!days) {
    return {
      key,
      current: { startDate: null, endDate: null },
      previous: { startDate: null, endDate: null },
      spanDays: null,
    };
  }
  const endDate = parseDateInput(new Date(), { fallbackToToday: true });
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (days - 1));
  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return {
    key,
    current: { startDate, endDate },
    previous: { startDate: prevStart, endDate: prevEnd },
    spanDays: days,
  };
}

function percentageChange(current, previous) {
  if (previous === null || previous === undefined) return null;
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / previous) * 100;
}

function buildPublicationFilter({ start, end, authorId }) {
  const conditions = ["p.status = 'published'"];
  const params = [];
  if (start) {
    const startValue = toDateTime(start, false);
    if (startValue) {
      conditions.push("datetime(p.created_at) >= datetime(?)");
      params.push(startValue);
    }
  }
  if (end) {
    const endValue = toDateTime(end, true);
    if (endValue) {
      conditions.push("datetime(p.created_at) <= datetime(?)");
      params.push(endValue);
    }
  }
  if (authorId) {
    conditions.push("p.author_id = ?");
    params.push(authorId);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function buildPublicationFilterByDate({ start, end, authorId }) {
  const conditions = ["p.status = 'published'"];
  const params = [];
  if (start) {
    const startValue = toDateOnly(start);
    if (startValue) {
      conditions.push("date(p.date) >= date(?)");
      params.push(startValue);
    }
  }
  if (end) {
    const endValue = toDateOnly(end);
    if (endValue) {
      conditions.push("date(p.date) <= date(?)");
      params.push(endValue);
    }
  }
  if (authorId) {
    conditions.push("p.author_id = ?");
    params.push(authorId);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function getMetricSet({ start, end, authorId }) {
  const filter = buildPublicationFilter({ start, end, authorId });
  const sql = `
    SELECT
      COUNT(*) AS total_publications,
      COALESCE(SUM(p.views), 0) AS total_views,
      COALESCE(SUM(p.visitas_unicas), 0) AS total_unique_views
    FROM publications p
    ${filter.where}
  `;
  return db.prepare(sql).get(...filter.params);
}

function getMemberCount({ start, end }) {
  const conditions = ["m.deleted_at IS NULL"];
  const params = [];
  if (start) {
    const startValue = toDateTime(start, false);
    if (startValue) {
      conditions.push("datetime(m.created_at) >= datetime(?)");
      params.push(startValue);
    }
  }
  if (end) {
    const endValue = toDateTime(end, true);
    if (endValue) {
      conditions.push("datetime(m.created_at) <= datetime(?)");
      params.push(endValue);
    }
  }
  const sql = `
    SELECT COUNT(*) AS total
    FROM members m
    WHERE ${conditions.join(" AND ")}
  `;
  return db.prepare(sql).get(...params).total || 0;
}

function getMetrics({ range, userId, role }) {
  const { current, previous, key } = getRangeBounds(range);
  const authorId = role === "admin" ? null : userId;
  const currentSet = getMetricSet({
    start: current.startDate,
    end: current.endDate,
    authorId,
  });
  const previousSet =
    current.startDate && previous.startDate
      ? getMetricSet({
          start: previous.startDate,
          end: previous.endDate,
          authorId,
        })
      : {
          total_publications: null,
          total_views: null,
          total_unique_views: null,
        };
  const metrics = [];
  if (role === "admin") {
    const memberCount = getMemberCount({
      start: current.startDate,
      end: current.endDate,
    });
    const prevMembers =
      current.startDate && previous.startDate
        ? getMemberCount({
            start: previous.startDate,
            end: previous.endDate,
          })
        : null;
    metrics.push(
      {
        id: "total-publications",
        label: "Total de Publicações",
        value: currentSet.total_publications || 0,
        delta: percentageChange(
          currentSet.total_publications || 0,
          previousSet.total_publications
        ),
      },
      {
        id: "total-views",
        label: "Visualizações Totais",
        value: currentSet.total_views || 0,
        delta: percentageChange(
          currentSet.total_views || 0,
          previousSet.total_views
        ),
      },
      {
        id: "total-unique-views",
        label: "Visualizações Únicas",
        value: currentSet.total_unique_views || 0,
        delta: percentageChange(
          currentSet.total_unique_views || 0,
          previousSet.total_unique_views
        ),
      },
      {
        id: "total-members",
        label: "Total de Membros",
        value: memberCount,
        delta: percentageChange(memberCount, prevMembers),
      }
    );
  } else {
    metrics.push(
      {
        id: "my-publications",
        label: "Minhas Publicações",
        value: currentSet.total_publications || 0,
        delta: percentageChange(
          currentSet.total_publications || 0,
          previousSet.total_publications
        ),
      },
      {
        id: "my-views",
        label: "Minhas Visualizações",
        value: currentSet.total_views || 0,
        delta: percentageChange(
          currentSet.total_views || 0,
          previousSet.total_views
        ),
      },
      {
        id: "my-unique-views",
        label: "Minhas Visualizações Únicas",
        value: currentSet.total_unique_views || 0,
        delta: percentageChange(
          currentSet.total_unique_views || 0,
          previousSet.total_unique_views
        ),
      }
    );
  }
  return { range: key, metrics };
}

function getWeekStart(date) {
  const copy = parseDateInput(date, { fallbackToToday: true });
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  return copy;
}

function formatWeekLabel(startDate) {
  const start = parseDateInput(startDate, { fallbackToToday: true });
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const format = (date) =>
    `${String(date.getDate()).padStart(2, "0")}/${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
  return `${format(start)} - ${format(end)}`;
}

function listAvailableWeeks({ authorId }) {
  const filter = buildPublicationFilterByDate({
    start: null,
    end: null,
    authorId,
  });
  const sql = `
    SELECT MIN(date) AS min_date, MAX(date) AS max_date
    FROM publications p
    ${filter.where}
  `;
  const result = db.prepare(sql).get(...filter.params);
  const today = parseDateInput(new Date(), { fallbackToToday: true });
  const maxDate =
    result && result.max_date
      ? parseDateInput(result.max_date, { fallbackToToday: true })
      : today;
  const minDate =
    result && result.min_date
      ? parseDateInput(result.min_date, { fallbackToToday: true })
      : today;
  const currentWeekStart = getWeekStart(today);
  const minWeekStart = getWeekStart(minDate);
  const weeks = [];
  let cursor = getWeekStart(maxDate > today ? today : maxDate);
  const limit = 26;
  while (weeks.length < limit && cursor.getTime() >= minWeekStart.getTime()) {
    weeks.push({
      value: toDateOnly(cursor),
      label: `Semana ${formatWeekLabel(cursor)}`,
    });
    const previous = new Date(cursor);
    previous.setDate(cursor.getDate() - 7);
    cursor = previous;
  }
  if (!weeks.length) {
    weeks.push({
      value: toDateOnly(currentWeekStart),
      label: `Semana ${formatWeekLabel(currentWeekStart)}`,
    });
  }
  return weeks;
}

function getChart({ authorId, weekStart }) {
  let reference = weekStart
    ? parseDateInput(weekStart, { fallbackToToday: true })
    : parseDateInput(new Date(), { fallbackToToday: true });
  const start = getWeekStart(reference);
  const days = Array.from({ length: 7 }).map((_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return d;
  });
  const filter = buildPublicationFilterByDate({
    start,
    end: days[6],
    authorId,
  });
  const sql = `
    SELECT date(p.date) AS day, COUNT(*) AS total
    FROM publications p
    ${filter.where}
    GROUP BY day
  `;
  const rows = db.prepare(sql).all(...filter.params);
  const map = new Map(rows.map((row) => [row.day, row.total]));
  const labels = [];
  const values = [];
  const tooltip = [];
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  days.forEach((date) => {
    const key = toDateOnly(date);
    labels.push(dayNames[date.getDay()]);
    const value = map.get(key) || 0;
    values.push(value);
    tooltip.push({ date: key, value });
  });
  return {
    weekStart: toDateOnly(start),
    labels,
    values,
    points: tooltip,
  };
}

function getPublicationUrl(row) {
  if (row.slug) return `/noticia/${encodeURIComponent(row.slug)}`;
  return `/pages/noticia.html?id=${encodeURIComponent(row.id)}`;
}

function getTopPublications({ range, userId, role }) {
  const { current } = getRangeBounds(range);
  const authorId = role === "admin" ? null : userId;
  const filter = buildPublicationFilter({
    start: current.startDate,
    end: current.endDate,
    authorId,
  });
  const sql = `
    SELECT
      p.id,
      p.title,
      p.slug,
      p.date,
      p.category,
      p.views,
      p.visitas_unicas AS unique_views,
      p.author_id,
      m.nome AS author_name
    FROM publications p
    JOIN members m ON m.id = p.author_id
    ${filter.where}
    ORDER BY p.views DESC, datetime(p.created_at) DESC
    LIMIT 3
  `;
  const rows = db.prepare(sql).all(...filter.params);
  return rows.map((row, index) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    url: getPublicationUrl(row),
    date: row.date,
    category: row.category,
    views: row.views || 0,
    uniqueViews: row.unique_views || 0,
    authorId: row.author_id,
    authorName: row.author_name,
    rank: index + 1,
  }));
}

function getTopMembers({ range, sort, limit, offset }) {
  const { current } = getRangeBounds(range);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const order =
    sort === "views"
      ? "total_views DESC, total_publications DESC, m.nome COLLATE NOCASE ASC"
      : "total_publications DESC, total_views DESC, m.nome COLLATE NOCASE ASC";
  const joinConditions = ["p.status = 'published'"];
  const params = [];
  if (current.startDate) {
    joinConditions.push("datetime(p.created_at) >= datetime(?)");
    params.push(toDateTime(current.startDate, false));
  }
  if (current.endDate) {
    joinConditions.push("datetime(p.created_at) <= datetime(?)");
    params.push(toDateTime(current.endDate, true));
  }
  const sql = `
    SELECT
      m.id,
      m.nome,
      m.avatar_light,
      m.avatar_dark,
      COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS total_publications,
      COALESCE(SUM(p.views), 0) AS total_views,
      COALESCE(SUM(p.visitas_unicas), 0) AS total_unique_views
    FROM members m
    LEFT JOIN publications p
      ON p.author_id = m.id
      AND ${joinConditions.join(" AND ")}
    WHERE m.deleted_at IS NULL
      AND (m.role = 'jornalista' OR m.role = 'admin')
      AND m.id != -1
    GROUP BY m.id
    HAVING total_publications > 0 OR total_views > 0
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(...params, safeLimit, safeOffset);
  const totalSql = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT m.id
      FROM members m
      LEFT JOIN publications p
        ON p.author_id = m.id
        AND ${joinConditions.join(" AND ")}
      WHERE m.deleted_at IS NULL
        AND (m.role = 'jornalista' OR m.role = 'admin')
        AND m.id != -1
      GROUP BY m.id
      HAVING COUNT(p.id) > 0 OR COALESCE(SUM(p.views), 0) > 0
    )
  `;
  const totalRow = db.prepare(totalSql).get(...params);
  return {
    total: totalRow ? totalRow.total || 0 : 0,
    items: rows.map((row, index) => ({
      id: row.id,
      name: row.nome,
      avatarLight: row.avatar_light,
      avatarDark: row.avatar_dark,
      publications: row.total_publications || 0,
      views: row.total_views || 0,
      uniqueViews: row.total_unique_views || 0,
      rank: safeOffset + index + 1,
    })),
  };
}

function getOverviewPayload({
  range,
  weekStart,
  userId,
  role,
  membersSort,
  membersLimit,
  membersOffset,
}) {
  const metrics = getMetrics({ range, userId, role });
  const authorId = role === "admin" ? null : userId;
  const weeks = listAvailableWeeks({ authorId });
  const selectedWeek =
    weekStart && weeks.some((week) => week.value === weekStart)
      ? weekStart
      : weeks[0]?.value;
  const chart = getChart({ authorId, weekStart: selectedWeek });
  const topPublications = getTopPublications({ range, userId, role });
  let topMembers = null;
  if (role === "admin") {
    const membersData = getTopMembers({
      range,
      sort: membersSort,
      limit: membersLimit,
      offset: membersOffset,
    });
    topMembers = {
      sort: membersSort,
      limit: membersLimit,
      offset: membersOffset,
      total: membersData.total,
      items: membersData.items,
      hasMore: membersData.total > membersOffset + membersData.items.length,
    };
  }
  return {
    range: metrics.range,
    metrics: metrics.metrics,
    chart,
    topPublications,
    topMembers,
    weeks,
    selectedWeek: chart.weekStart,
  };
}

module.exports = {
  getOverviewPayload,
  getMetrics,
  getChart,
  getTopPublications,
  getTopMembers,
  listAvailableWeeks,
};
