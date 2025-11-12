(() => {
  const root = document.getElementById("view-visao");
  if (!root) return;

  const state = {
    user: null,
    range: "30d",
    weekStart: null,
    membersSort: "publications",
    membersLimit: 5,
    membersOffset: 0,
    membersItems: [],
    membersVisibleCount: 0,
    membersHasMore: false,
    membersTotal: 0,
    rangePeriod: null,
    topPublications: [],
    loaded: false,
    pending: false,
  };

  const elements = {
    title: document.getElementById("overviewTitle"),
    subtitle: document.getElementById("overviewSubtitle"),
    filters: Array.from(root.querySelectorAll(".overview-filter")),
    metrics: document.getElementById("overviewMetrics"),
    chart: document.getElementById("overviewChart"),
    chartCaption: document.getElementById("overviewChartCaption"),
    weekSelect: document.getElementById("overviewWeekSelect"),
    topPublicationsTitle: document.getElementById(
      "overviewTopPublicationsTitle"
    ),
    topPublications: document.getElementById("overviewTopPublications"),
    topMembersCard: document.getElementById("overviewTopMembersCard"),
    topMembersList: document.getElementById("overviewTopMembers"),
    topMembersMore: document.getElementById("overviewTopMembersMore"),
    chipGroup: root.querySelector(".overview-chip-group"),
  };

  const numberFormatter = new Intl.NumberFormat("pt-BR");
  const percentFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const subtitles = {
    all: "Dados acumulados",
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
    "90d": "Últimos 90 dias",
    "1y": "Último ano",
  };

  const metricIcons = {
    "total-publications": "📰",
    "total-views": "📈",
    "total-unique-views": "👥",
    "total-members": "🧑‍🤝‍🧑",
    "my-publications": "✍️",
    "my-views": "🔥",
    "my-unique-views": "⭐",
  };

  const medalClasses = {
    1: "overview-top-publications__rank--gold",
    2: "overview-top-publications__rank--silver",
    3: "overview-top-publications__rank--bronze",
  };

  const statIcons = {
    views: "👁️",
    date: "📅",
  };

  const chartColors = [
    "var(--chart-color-1)",
    "var(--chart-color-2)",
    "var(--chart-color-3)",
    "var(--chart-color-4)",
    "var(--chart-color-5)",
    "var(--chart-color-6)",
    "var(--chart-color-7)",
  ];

  function parseISODate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getTime());
    const parts = String(value).split("-");
    if (parts.length !== 3) return null;
    const [year, month, day] = parts.map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function computeRangePeriod(rangeKey) {
    const map = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
    const days = map[rangeKey];
    if (!days) return null;
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return {
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(start.getDate()).padStart(2, "0")}`,
      end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(end.getDate()).padStart(2, "0")}`,
    };
  }

  function formatPeriod(period) {
    if (!period || !period.start || !period.end) return "";
    const start = parseISODate(period.start);
    const end = parseISODate(period.end);
    if (!start || !end) return "";
    return `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;
  }

  function isOverviewActive() {
    return root.classList.contains("active");
  }

  function setLoading(flag) {
    root.toggleAttribute("data-loading", Boolean(flag));
  }

  function setMembersLoading(flag) {
    if (elements.topMembersMore)
      elements.topMembersMore.disabled = Boolean(flag);
  }

  function resetMembersState() {
    state.membersOffset = 0;
    state.membersItems = [];
    state.membersVisibleCount = 0;
    state.membersHasMore = false;
    state.membersTotal = 0;
    if (elements.topMembersList) elements.topMembersList.innerHTML = "";
    updateMembersButton();
  }

  function renderTopMembersList() {
    if (!elements.topMembersList) return;
    elements.topMembersList.innerHTML = "";
    const limit = state.membersVisibleCount || 0;
    const visible = state.membersItems.slice(0, limit);
    visible.forEach((item) => {
      elements.topMembersList.appendChild(buildMemberItem(item));
    });
  }

  function updateMembersButton() {
    if (!elements.topMembersMore) return;
    const totalLoaded = state.membersItems.length;
    const total = state.membersTotal || totalLoaded;
    const step = state.membersLimit;
    const hasAny = totalLoaded > 0;
    const canFetchMore = state.membersHasMore || totalLoaded < total;
    const fetchedAll = !canFetchMore;
    const showingAllLoaded =
      hasAny && state.membersVisibleCount >= Math.min(totalLoaded, total);
    const shouldShowLess = fetchedAll && showingAllLoaded && total > step;
    const canShowMoreLoaded = state.membersVisibleCount < totalLoaded;
    const shouldShowMore = canFetchMore || canShowMoreLoaded;
    const shouldDisplayButton =
      shouldShowLess || shouldShowMore || total > step || totalLoaded > step;

    if (!shouldDisplayButton) {
      elements.topMembersMore.style.display = "none";
      return;
    }

    elements.topMembersMore.style.display = "";
    elements.topMembersMore.textContent = shouldShowLess
      ? "Ver menos"
      : "Ver mais membros";
    elements.topMembersMore.disabled = false;
  }

  function setActiveRange(range) {
    state.range = range;
    elements.filters.forEach((btn) => {
      const isActive = btn.dataset.range === range;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function ensureRangeOption(range) {
    if (!elements.filters.length) return;
    const exists = elements.filters.some((btn) => btn.dataset.range === range);
    if (!exists) {
      const fallback = elements.filters[0]?.dataset.range;
      if (fallback) setActiveRange(fallback);
    }
  }

  function formatDelta(delta) {
    if (delta === null || delta === undefined || Number.isNaN(Number(delta))) {
      return { text: "—", className: "is-neutral" };
    }
    const value = Number(delta);
    if (!value) return { text: "0%", className: "is-neutral" };
    const sign = value > 0 ? "is-positive" : "is-negative";
    const arrow = value > 0 ? "▲" : "▼";
    return {
      text: `${arrow} ${percentFormatter.format(Math.abs(value))}%`,
      className: sign,
    };
  }

  function createMetricCard(metric) {
    const card = document.createElement("article");
    card.className = "metric-card";

    const left = document.createElement("div");
    left.className = "metric-card__left";

    const icon = document.createElement("span");
    icon.className = "metric-card__icon";
    icon.textContent = metricIcons[metric.id] || "📊";
    icon.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "metric-card__content";

    const label = document.createElement("h4");
    label.className = "metric-card__label";
    label.textContent = metric.label || "—";

    const value = document.createElement("span");
    value.className = "metric-card__value";
    value.textContent = numberFormatter.format(metric.value || 0);

    const description = document.createElement("p");
    description.className = "metric-card__description";
    description.textContent = metric.description || "";

    content.appendChild(label);
    if (metric.description) content.appendChild(description);

    content.appendChild(value);
    if (metric.description) content.appendChild(description);

    left.appendChild(icon);
    left.appendChild(content);

    const right = document.createElement("div");
    right.className = "metric-card__right";

    const deltaInfo = formatDelta(metric.delta);
    const delta = document.createElement("span");
    delta.className = `metric-card__delta ${deltaInfo.className}`;
    delta.textContent = deltaInfo.text;

    right.appendChild(delta);

    card.appendChild(left);
    card.appendChild(right);
    return card;
  }

  function renderMetrics(metrics) {
    if (!elements.metrics) return;
    elements.metrics.innerHTML = "";
    metrics.forEach((metric) => {
      elements.metrics.appendChild(createMetricCard(metric));
    });
  }

  function renderWeeks(payload) {
    if (!elements.weekSelect) return;
    const weeks = Array.isArray(payload.weeks) ? payload.weeks : [];
    const selectedWeek = payload.selectedWeek || weeks[0]?.value || "";
    elements.weekSelect.innerHTML = "";
    weeks.forEach((week) => {
      const option = document.createElement("option");
      option.value = week.value;
      option.textContent = week.label;
      if (week.value === selectedWeek) option.selected = true;
      elements.weekSelect.appendChild(option);
    });
    state.weekStart = selectedWeek || null;
    if (elements.chartCaption) {
      const current = weeks.find((week) => week.value === selectedWeek);
      elements.chartCaption.textContent = current ? current.label : "";
    }
  }

  function createTooltipElement() {
    const tooltip = document.createElement("div");
    tooltip.className = "overview-chart__tooltip";
    tooltip.hidden = true;
    return tooltip;
  }

  function showTooltip(tooltip, target, content) {
    tooltip.textContent = content;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const chartRect = elements.chart.getBoundingClientRect();
    const top = rect.top - chartRect.top - tooltip.offsetHeight - 12;
    const center = rect.left - chartRect.left + rect.width / 2;
    const left = center - tooltip.offsetWidth / 2;
    tooltip.style.transform = `translate(${left}px, ${top}px)`;
  }

  function hideTooltip(tooltip) {
    tooltip.hidden = true;
  }

  function renderChart(data) {
    if (!elements.chart) return;
    elements.chart.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "overview-chart__grid";

    const tooltip = createTooltipElement();
    const max = Math.max(...data.values, 1);

    data.values.forEach((value, index) => {
      const item = document.createElement("div");
      item.className = "overview-chart__item";

      const barButton = document.createElement("button");
      barButton.type = "button";
      barButton.className = "overview-chart__bar";
      barButton.dataset.value = String(value || 0);
      barButton.dataset.label = data.labels[index] || "";
      barButton.dataset.date = data.points?.[index]?.date || "";

      const barFill = document.createElement("span");
      barFill.className = "overview-chart__bar-fill";
      const height = Math.max(4, Math.round((value / max) * 100));
      barFill.style.height = `${height}%`;
      barFill.style.background = chartColors[index % chartColors.length];
      barButton.appendChild(barFill);

      const dayLabel = document.createElement("span");
      dayLabel.className = "overview-chart__label";
      dayLabel.textContent = data.labels[index] || "";

      const valueText = `${numberFormatter.format(value || 0)} publicação${
        value === 1 ? "" : "s"
      }`;
      const tooltipContent = `${dayLabel.textContent} • ${valueText}`;
      const enter = () => showTooltip(tooltip, barButton, tooltipContent);
      const leave = () => hideTooltip(tooltip);
      barButton.addEventListener("mouseenter", enter);
      barButton.addEventListener("focus", enter);
      barButton.addEventListener("mouseleave", leave);
      barButton.addEventListener("blur", leave);
      barButton.addEventListener("mousemove", (event) => {
        if (tooltip.hidden) return;
        const rect = elements.chart.getBoundingClientRect();
        tooltip.style.transform = `translate(${
          event.clientX - rect.left - tooltip.offsetWidth / 2
        }px, ${event.clientY - rect.top - tooltip.offsetHeight - 16}px)`;
      });

      item.appendChild(barButton);
      item.appendChild(dayLabel);
      grid.appendChild(item);
    });

    elements.chart.appendChild(grid);
    elements.chart.appendChild(tooltip);
  }

  function createMetaItem(className, text) {
    const span = document.createElement("span");
    span.className = `overview-top-publications__meta-item ${className}`;
    span.textContent = text;
    return span;
  }

  function createStatItem(type, text) {
    const span = document.createElement("span");
    span.className = `overview-top-publications__stat overview-top-publications__${type}`;

    const icon = document.createElement("span");
    icon.className = "overview-top-publications__icon";
    icon.textContent = statIcons[type] || "•";
    icon.setAttribute("aria-hidden", "true");

    const value = document.createElement("span");
    value.className = "overview-top-publications__stat-value";
    value.textContent = text;

    span.appendChild(icon);
    span.appendChild(value);
    return span;
  }

  function buildPublicationItem(item) {
    const li = document.createElement("li");
    li.className = "overview-top-publications__item";

    const main = document.createElement("div");
    main.className = "overview-top-publications__main";

    const rank = document.createElement("span");
    rank.className = "overview-top-publications__rank";
    rank.textContent = String(item.rank || 0);
    if (medalClasses[item.rank]) rank.classList.add(medalClasses[item.rank]);

    const info = document.createElement("div");
    info.className = "overview-top-publications__info";

    const titleLink = item.url
      ? document.createElement("a")
      : document.createElement("span");
    titleLink.className = "overview-top-publications__title";
    titleLink.textContent = item.title || "Publicação sem título";
    if (item.url) {
      titleLink.href = item.url;
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
    }

    const meta = document.createElement("div");
    meta.className = "overview-top-publications__meta";
    meta.appendChild(
      createMetaItem(
        "overview-top-publications__category",
        item.category || "Sem categoria"
      )
    );
    if (item.authorName) {
      meta.appendChild(
        createMetaItem("overview-top-publications__author", item.authorName)
      );
    }

    info.appendChild(titleLink);
    info.appendChild(meta);

    main.appendChild(rank);
    main.appendChild(info);

    const stats = document.createElement("div");
    stats.className = "overview-top-publications__stats";

    const viewsText = `${numberFormatter.format(item.views || 0)} visualização${
      (item.views || 0) === 1 ? "" : "s"
    }`;
    stats.appendChild(createStatItem("views", viewsText));

    const dateValue = item.date ? parseISODate(item.date) : null;
    const formattedDate =
      dateValue && !Number.isNaN(dateValue.getTime())
        ? dateFormatter.format(dateValue)
        : "Data indefinida";
    stats.appendChild(createStatItem("date", formattedDate));

    li.appendChild(main);
    li.appendChild(stats);

    return li;
  }

  function renderTopPublications(list) {
    if (!elements.topPublications) return;
    state.topPublications = Array.isArray(list) ? list.slice() : [];
    elements.topPublications.innerHTML = "";
    if (!state.topPublications.length) {
      const empty = document.createElement("li");
      empty.className = "overview-top-publications__empty";
      empty.textContent = "Nenhuma publicação disponível.";
      elements.topPublications.appendChild(empty);
      return;
    }
    state.topPublications.forEach((item) => {
      elements.topPublications.appendChild(buildPublicationItem(item));
    });
  }

  function resolveAvatar(light, dark) {
    const isLight =
      typeof window.isLightTheme === "function" ? window.isLightTheme() : true;
    if (isLight) {
      if (light) return light;
      if (window.DEFAULT_AVATARS?.light) return window.DEFAULT_AVATARS.light;
      if (dark) return dark;
    } else {
      if (dark) return dark;
      if (window.DEFAULT_AVATARS?.dark) return window.DEFAULT_AVATARS.dark;
      if (light) return light;
    }
    return window.DEFAULT_AVATARS?.light || "";
  }

  function buildMemberItem(item) {
    const li = document.createElement("li");
    li.className = "overview-top-members__item";

    const left = document.createElement("div");
    left.className = "overview-top-members__left";

    const rank = document.createElement("span");
    rank.className = "overview-top-members__rank";
    rank.textContent = String(item.rank);

    const avatar = document.createElement("img");
    avatar.className = "overview-top-members__avatar";
    avatar.src = resolveAvatar(item.avatarLight, item.avatarDark);
    avatar.alt = item.name ? `Foto de ${item.name}` : "Avatar";

    const name = document.createElement("span");
    name.className = "overview-top-members__name";
    name.textContent = item.name || "—";

    left.appendChild(rank);
    left.appendChild(avatar);
    left.appendChild(name);

    const info = document.createElement("div");
    info.className = "overview-top-members__info";

    const stats = document.createElement("div");
    stats.className = "overview-top-members__stats";

    const publicationsStat = document.createElement("span");
    publicationsStat.className = "overview-top-members__stat";
    publicationsStat.textContent = `${numberFormatter.format(
      item.publications || 0
    )} publicação${(item.publications || 0) === 1 ? "" : "s"}`;

    const viewsStat = document.createElement("span");
    viewsStat.className = "overview-top-members__stat";
    viewsStat.textContent = `${numberFormatter.format(
      item.views || 0
    )} visualização${(item.views || 0) === 1 ? "" : "s"}`;

    stats.appendChild(publicationsStat);
    stats.appendChild(viewsStat);

    info.appendChild(stats);

    li.appendChild(left);
    li.appendChild(info);

    return li;
  }

  function renderTopMembers(data, append) {
    if (!elements.topMembersCard || !elements.topMembersList) return;
    if (!state.user || state.user.role !== "admin") return;
    if (!data) {
      state.membersItems = [];
      state.membersVisibleCount = 0;
      state.membersHasMore = false;
      state.membersTotal = 0;
      elements.topMembersList.innerHTML = "";
      updateMembersButton();
      return;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    if (!append) {
      state.membersItems = items.slice();
    } else {
      state.membersItems = state.membersItems.concat(items);
    }
    const previousVisible = state.membersVisibleCount || 0;
    state.membersHasMore = Boolean(data.hasMore);
    state.membersTotal = Number.isInteger(data.total)
      ? data.total
      : state.membersItems.length;
    if (!append) {
      state.membersVisibleCount = state.membersItems.length;
    } else {
      const added = state.membersItems.length - previousVisible;
      state.membersVisibleCount = Math.min(
        state.membersItems.length,
        previousVisible + Math.max(added, 0)
      );
    }
    renderTopMembersList();
    updateMembersButton();
    const chips = elements.chipGroup
      ? Array.from(elements.chipGroup.querySelectorAll(".overview-chip"))
      : [];
    chips.forEach((chip) => {
      const active = chip.dataset.membersSort === state.membersSort;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function buildQuery() {
    const query = new URLSearchParams();
    query.set("range", state.range);
    if (state.weekStart) query.set("weekStart", state.weekStart);
    if (state.user && state.user.role === "admin") {
      query.set("membersSort", state.membersSort);
      query.set("membersLimit", state.membersLimit);
      query.set("membersOffset", state.membersOffset);
    }
    return query.toString();
  }

  function computeSubtitle() {
    const label = subtitles[state.range] || "";
    const periodText =
      state.range === "all" ? "" : formatPeriod(state.rangePeriod);
    if (!periodText) return label;
    return `${label} • ${periodText}`;
  }

  function updateTitle() {
    if (!state.user) return;
    const isAdmin = state.user.role === "admin";
    if (elements.title) {
      elements.title.textContent = isAdmin
        ? "Painel Administrativo"
        : "Painel do Jornalista";
    }
    if (elements.topPublicationsTitle) {
      elements.topPublicationsTitle.textContent = isAdmin
        ? "Top 3 Publicações Gerais"
        : "Minhas Top 3 Publicações";
    }
    if (elements.subtitle) {
      elements.subtitle.textContent = computeSubtitle();
    }
    if (elements.topMembersCard) {
      elements.topMembersCard.style.display = isAdmin ? "" : "none";
    }
  }

  async function loadOverview(options = {}) {
    if (!state.user) return;
    if (!isOverviewActive() && !options.force) {
      state.pending = true;
      return;
    }
    state.pending = false;
    if (!options.appendMembers) setLoading(true);
    try {
      const query = buildQuery();
      const fetcher = window.apiFetch || window.fetch;
      const response = await fetcher(`/api/dashboard/overview?${query}`);
      let data = response;
      if (typeof Response !== "undefined" && response instanceof Response) {
        if (!response.ok) {
          throw new Error(`Erro ao carregar overview: ${response.status}`);
        }
        data = await response.json();
      }
      if (data.range) setActiveRange(data.range);
      renderMetrics(data.metrics || []);
      state.rangePeriod = data.period || computeRangePeriod(state.range);
      updateTitle();
      renderWeeks(data);
      if (data.chart) renderChart(data.chart);
      renderTopPublications(data.topPublications || []);
      if (state.user.role === "admin" && data.topMembers) {
        renderTopMembers(data.topMembers, options.appendMembers);
        const itemsLength = Array.isArray(data.topMembers.items)
          ? data.topMembers.items.length
          : 0;
        state.membersOffset = (data.topMembers.offset || 0) + itemsLength;
      }
      state.loaded = true;
    } catch (err) {
      console.error("Falha ao carregar visão geral", err);
    } finally {
      setLoading(false);
      setMembersLoading(false);
    }
  }

  function handleBootstrap(event) {
    state.user = event.detail?.user || null;
    resetMembersState();
    ensureRangeOption(state.range);
    updateTitle();
    if (isOverviewActive()) {
      loadOverview({ force: true });
    } else {
      state.pending = true;
    }
  }

  function handleViewChanged(event) {
    const key = event.detail?.key;
    if (key !== "visao") return;
    updateTitle();
    if (state.pending || !state.loaded) {
      loadOverview({ force: true });
    }
  }

  function handleRangeClick(event) {
    const button = event.currentTarget;
    const range = button.dataset.range;
    if (!range || range === state.range) return;
    resetMembersState();
    setActiveRange(range);
    state.rangePeriod = range === "all" ? null : computeRangePeriod(range);
    if (state.user) loadOverview({ force: true });
  }

  function handleWeekChange(event) {
    const { value } = event.target;
    state.weekStart = value || null;
    resetMembersState();
    if (state.user) loadOverview({ force: true });
  }

  function handleMembersSort(event) {
    const button = event.currentTarget;
    const sort = button.dataset.membersSort;
    if (!sort || sort === state.membersSort) return;
    state.membersSort = sort;
    resetMembersState();
    if (state.user) loadOverview({ force: true });
  }

  function handleMembersMore() {
    if (!state.user || state.user.role !== "admin") return;
    const step = state.membersLimit;
    const totalLoaded = state.membersItems.length;
    const total = state.membersTotal || totalLoaded;
    const canFetchMore = state.membersHasMore || totalLoaded < total;
    const fetchedAll = !canFetchMore;
    const showingAll =
      fetchedAll && state.membersVisibleCount >= Math.min(totalLoaded, total);

    if (showingAll && total > step) {
      state.membersVisibleCount = Math.max(
        step,
        state.membersVisibleCount - step
      );
      renderTopMembersList();
      updateMembersButton();
      return;
    }

    if (state.membersVisibleCount < totalLoaded) {
      state.membersVisibleCount = Math.min(
        totalLoaded,
        state.membersVisibleCount + step
      );
      renderTopMembersList();
      updateMembersButton();
      return;
    }

    if (canFetchMore) {
      const previousOffset = state.membersOffset;
      state.membersOffset = state.membersItems.length;
      setMembersLoading(true);
      loadOverview({ force: true, appendMembers: true }).catch(() => {
        state.membersOffset = previousOffset;
      });
    }
  }

  function handleThemeChange() {
    if (!state.user) return;
    if (state.user.role === "admin" && state.membersItems.length) {
      renderTopMembersList();
      updateMembersButton();
    }
    if (state.topPublications.length) {
      renderTopPublications(state.topPublications);
    }
    updateTitle();
  }

  function bindUI() {
    elements.filters.forEach((btn) => {
      btn.addEventListener("click", handleRangeClick);
    });
    if (elements.weekSelect) {
      elements.weekSelect.addEventListener("change", handleWeekChange);
    }
    if (elements.chipGroup) {
      Array.from(elements.chipGroup.querySelectorAll(".overview-chip")).forEach(
        (chip) => {
          chip.addEventListener("click", handleMembersSort);
        }
      );
    }
    if (elements.topMembersMore) {
      elements.topMembersMore.addEventListener("click", handleMembersMore);
    }
    setActiveRange(state.range);
  }

  bindUI();

  document.addEventListener("dashboard:bootstrap", handleBootstrap);
  document.addEventListener("dashboard:view-changed", handleViewChanged);
  document.addEventListener("dashboard:theme-changed", handleThemeChange);

  window.dashboardOverview = {
    refresh: () => loadOverview({ force: true }),
  };
})();
