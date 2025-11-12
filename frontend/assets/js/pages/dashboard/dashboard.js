const DEFAULT_AVATARS = {
  light: "/assets/img/avatares/avatar_lightMode.png",
  dark: "/assets/img/avatares/avatar_darkMode.png",
};

let currentUser = null;
const sessionTimers = {
  expiresAt: null,
  timeoutId: null,
  intervalId: null,
};
const PASSWORD_ALERT_STORAGE_PREFIX = "tlu.password-alert.dismissed";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function redirectToLogin() {
  window.location.href = "/login";
}

function isLightTheme() {
  const rootTheme = document.documentElement.getAttribute("data-theme");
  if (rootTheme) return rootTheme === "light";
  const bodyTheme = document.body?.dataset?.theme;
  if (bodyTheme) return bodyTheme === "light";
  return false;
}

async function apiFetch(path, options = {}) {
  const opts = { ...options, credentials: "include" };
  const headers = { ...(options.headers || {}) };

  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body !== "string") {
      opts.body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }
  }

  if (Object.keys(headers).length) {
    opts.headers = headers;
  }

  const response = await fetch(path, opts);
  let data;

  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin();
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    const message = data?.error || "Erro ao comunicar com o servidor.";
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (data && data.sessionExpiresAt) {
    scheduleSessionExpiration(data.sessionExpiresAt);
  }

  return data;
}

function adaptUser(raw) {
  if (!raw) return null;
  const nome = raw.nome || raw.name || "";
  const role = raw.role || raw.tipo || "jornalista";
  const avatarLight = raw.avatar_light || DEFAULT_AVATARS.light;
  const avatarDark = raw.avatar_dark || DEFAULT_AVATARS.dark;
  const sessionExpiresAt =
    raw.sessionExpiresAt || raw.session_expires_at || null;
  const passwordChanged = Boolean(
    raw.password_changed ??
      raw.senha_alterada ??
      raw.passwordChanged ??
      raw.senhaAlterada
  );

  return {
    ...raw,
    nome,
    name: nome,
    role,
    avatar_light: avatarLight,
    avatar_dark: avatarDark,
    avatar: avatarLight,
    sessionExpiresAt,
    password_changed: passwordChanged,
    senha_alterada: passwordChanged,
    hasPasswordChanged: passwordChanged,
  };
}

function getSessionInfoElement() {
  return $("#sessionInfo");
}

function clearSessionTimers() {
  if (sessionTimers.timeoutId) {
    clearTimeout(sessionTimers.timeoutId);
    sessionTimers.timeoutId = null;
  }
  if (sessionTimers.intervalId) {
    clearInterval(sessionTimers.intervalId);
    sessionTimers.intervalId = null;
  }
}

function passwordAlertStorageKey(userId) {
  if (!userId && userId !== 0) return "";
  return `${PASSWORD_ALERT_STORAGE_PREFIX}:${userId}`;
}

function isPasswordAlertDismissed(userId, sessionToken) {
  if (!userId && userId !== 0) return false;
  try {
    const raw = sessionStorage.getItem(passwordAlertStorageKey(userId));
    if (!raw) return false;
    let stored = null;
    try {
      stored = JSON.parse(raw);
    } catch (_) {
      return false;
    }
    if (!stored || typeof stored !== "object") return false;
    if (!sessionToken) return true;
    return stored.session === (sessionToken || "");
  } catch (_) {
    return false;
  }
}

function setPasswordAlertDismissed(userId, sessionToken) {
  if (!userId && userId !== 0) return;
  try {
    const payload = { session: sessionToken || "" };
    sessionStorage.setItem(
      passwordAlertStorageKey(userId),
      JSON.stringify(payload)
    );
  } catch (_) {}
}

function clearPasswordAlertDismissed(userId) {
  if (!userId && userId !== 0) return;
  try {
    sessionStorage.removeItem(passwordAlertStorageKey(userId));
  } catch (_) {}
}

let passwordAlertRefs = null;
let passwordAlertBound = false;

function getPasswordAlertRefs() {
  if (passwordAlertRefs) return passwordAlertRefs;
  const modal = document.getElementById("passwordAlertModal");
  if (!modal) return null;
  passwordAlertRefs = {
    modal,
    overlay: modal.querySelector("[data-password-alert-dismiss]"),
    primary: modal.querySelector('[data-password-alert-action="change"]'),
    secondary: modal.querySelector('[data-password-alert-action="later"]'),
  };
  return passwordAlertRefs;
}

function isPasswordAlertOpen() {
  const refs = getPasswordAlertRefs();
  if (!refs) return false;
  return refs.modal.getAttribute("data-active") === "true";
}

function openPasswordAlertModal() {
  const refs = getPasswordAlertRefs();
  if (!refs) return;
  setupPasswordAlert();
  if (isPasswordAlertOpen()) return;
  refs.modal.removeAttribute("hidden");
  requestAnimationFrame(() => {
    refs.modal.setAttribute("data-active", "true");
  });
  const target = refs.primary || refs.secondary;
  if (target) {
    setTimeout(() => {
      if (isPasswordAlertOpen()) target.focus();
    }, 260);
  }
}

function closePasswordAlertModal(immediate = false) {
  const refs = getPasswordAlertRefs();
  if (!refs) return;
  if (!isPasswordAlertOpen() && !immediate) return;
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
  setTimeout(onTransitionEnd, 260);
}

function focusSecurityTab() {
  const profileView = document.getElementById("view-perfil");
  if (!profileView) return;
  const securityTab = profileView.querySelector(
    '.tab-btn[data-tab="security"]'
  );
  if (securityTab) {
    securityTab.click();
    securityTab.focus();
  }
  const securitySection = profileView.querySelector("#tab-security");
  if (securitySection) {
    securitySection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setupPasswordAlert() {
  if (passwordAlertBound) return;
  const refs = getPasswordAlertRefs();
  if (!refs) return;
  const handleLater = () => {
    if (currentUser && currentUser.id !== undefined) {
      setPasswordAlertDismissed(
        currentUser.id,
        currentUser.sessionExpiresAt || currentUser.session_expires_at || ""
      );
    }
    closePasswordAlertModal();
  };
  const handleChange = () => {
    if (currentUser && currentUser.id !== undefined) {
      setPasswordAlertDismissed(
        currentUser.id,
        currentUser.sessionExpiresAt || currentUser.session_expires_at || ""
      );
    }
    closePasswordAlertModal();
    setTimeout(() => {
      switchTo("perfil");
      setTimeout(focusSecurityTab, 160);
    }, 200);
  };
  if (refs.overlay) {
    refs.overlay.addEventListener("click", (event) => {
      event.preventDefault();
      handleLater();
    });
  }
  if (refs.secondary) {
    refs.secondary.addEventListener("click", (event) => {
      event.preventDefault();
      handleLater();
    });
  }
  if (refs.primary) {
    refs.primary.addEventListener("click", (event) => {
      event.preventDefault();
      handleChange();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isPasswordAlertOpen()) {
      event.preventDefault();
      handleLater();
    }
  });
  passwordAlertBound = true;
}

function handlePasswordAlertForUser() {
  const refs = getPasswordAlertRefs();
  if (!refs) return;
  setupPasswordAlert();
  if (!currentUser) {
    closePasswordAlertModal(true);
    return;
  }
  if (currentUser.password_changed || currentUser.hasPasswordChanged) {
    clearPasswordAlertDismissed(currentUser.id);
    closePasswordAlertModal(true);
    return;
  }
  if (
    isPasswordAlertDismissed(
      currentUser.id,
      currentUser.sessionExpiresAt || currentUser.session_expires_at || ""
    )
  )
    return;
  openPasswordAlertModal();
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function updateSessionCountdownLabel() {
  const infoEl = getSessionInfoElement();
  if (!infoEl) return;

  if (!sessionTimers.expiresAt) {
    infoEl.textContent = "Sessão expira em 40 minutos";
    return;
  }

  const remaining = sessionTimers.expiresAt - Date.now();
  if (remaining <= 0) {
    infoEl.textContent = "Sessão expirada";
    return;
  }

  infoEl.textContent = `Sessão expira em ${formatCountdown(remaining)}`;
}

function handleSessionExpired() {
  clearSessionTimers();
  sessionTimers.expiresAt = null;
  updateSessionCountdownLabel();
  // Não redireciona automaticamente quando a sessão expira. A partir de agora a
  // sessão será considerada expirada e o contador exibirá "Sessão expirada",
  // porém o usuário continuará na dashboard. Ao tentar executar ações que
  // exigem comunicação com o servidor ou ao atualizar/fechar a aba, o back‑end
  // detectará a expiração e redirecionará para a página de login.
}

function scheduleSessionExpiration(expiresAtIso) {
  clearSessionTimers();

  if (!expiresAtIso) {
    sessionTimers.expiresAt = null;
    updateSessionCountdownLabel();
    return;
  }

  const ts = Date.parse(expiresAtIso);
  if (Number.isNaN(ts)) {
    sessionTimers.expiresAt = null;
    updateSessionCountdownLabel();
    return;
  }

  sessionTimers.expiresAt = ts;
  const remaining = ts - Date.now();
  if (remaining <= 0) {
    // Se o tempo já expirou, apenas marque a sessão como expirada sem
    // redirecionar imediatamente. O redirecionamento ocorrerá apenas ao
    // realizar uma chamada à API ou recarregar a página.
    handleSessionExpired();
    return;
  }

  updateSessionCountdownLabel();
  sessionTimers.timeoutId = setTimeout(handleSessionExpired, remaining);
  sessionTimers.intervalId = setInterval(updateSessionCountdownLabel, 1000);
}

function updateUserAvatar() {
  if (!currentUser) return;
  const profilePic = $("#profilePic");
  if (!profilePic) return;

  const avatarLight = currentUser.avatar_light || DEFAULT_AVATARS.light;
  const avatarDark = currentUser.avatar_dark || DEFAULT_AVATARS.dark;

  profilePic.setAttribute("data-light", avatarLight);
  profilePic.setAttribute("data-dark", avatarDark);
  profilePic.src = isLightTheme() ? avatarLight : avatarDark;
  profilePic.alt = `Foto de ${currentUser.name || ""}`;

  currentUser.avatar = profilePic.src;
}

function initUserUI() {
  if (!currentUser) return;

  const profileName = $("#profileName");
  const greeting = document.querySelector(".greeting") || $("#greeting");
  const accessLevel = $("#accessLevel");
  const logoImg = $("#logo");
  const adminGroup = $("#adminGroup");

  if (profileName) profileName.textContent = currentUser.name || "";
  updateUserAvatar();
  if (greeting) greeting.textContent = `Olá, ${currentUser.name || ""}`;

  if (accessLevel) {
    const label = currentUser.role === "admin" ? "Administrador" : "Jornalista";
    accessLevel.textContent = `Nível de Acesso: ${label}`;
  }

  if (logoImg && currentUser.logo) logoImg.src = currentUser.logo;

  const isAdmin = currentUser.role === "admin";
  if (adminGroup) adminGroup.style.display = isAdmin ? "" : "none";

  updateSessionCountdownLabel();
}

function hydrateProfileEditView() {
  if (!currentUser) return;

  const nameInput = $("#editName");
  const avatarInput = $("#editAvatar");
  const previewImg = $("#editAvatarPreview");

  if (nameInput) nameInput.value = currentUser.name || "";
  if (avatarInput) avatarInput.value = currentUser.avatar || "";
  if (previewImg) {
    previewImg.src = currentUser.avatar || DEFAULT_AVATARS.light;
    previewImg.alt = `Foto de ${currentUser.name || ""}`;
  }
}

function switchTo(key, { updateHash = true } = {}) {
  if (!key) return;

  $$("[data-section]").forEach((btn) => {
    const isActive = btn.getAttribute("data-section") === key;
    btn.setAttribute("aria-current", isActive ? "page" : "false");
  });

  $$(".content .view").forEach((view) => view.classList.remove("active"));
  const targetView = document.getElementById(`view-${key}`);
  if (targetView) targetView.classList.add("active");
  document.dispatchEvent(
    new CustomEvent("dashboard:view-changed", { detail: { key } })
  );

  const contentArea = $("#contentArea");
  if (contentArea) contentArea.focus({ preventScroll: false });

  if (key === "perfil") hydrateProfileEditView();

  if (updateHash) {
    try {
      // Atualiza a query string para refletir a aba atual em vez de utilizar
      // anchors na URL. Remove qualquer fragmento de hash para evitar
      // interferência com o histórico.
      const url = new URL(window.location.href);
      url.searchParams.set("aba", key);
      url.hash = "";
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (_) {}
  }
}

function setupSidebarToggle() {
  const dashboardEl = document.querySelector(".dashboard");
  const toggleBtn = document.getElementById("sidebarToggle");
  const toggleLabel = document.getElementById("sidebarToggleLabel");
  if (!dashboardEl || !toggleBtn) return;

  const collapsedClass = "dashboard--sidebar-collapsed";
  let forcedMobileCollapse = false;
  const togglePlacement = {
    parent: toggleBtn.parentElement,
    nextSibling: toggleBtn.nextElementSibling,
    isFloating: false,
  };
  const setLabelVisibility = (collapsed) => {
    if (!toggleLabel) return;
    toggleLabel.hidden = !!collapsed;
    toggleLabel.setAttribute("aria-hidden", collapsed ? "true" : "false");
  };

  const setFloatingMode = (enabled) => {
    toggleBtn.classList.toggle("sidebar-toggle--floating", !!enabled);
    if (enabled) {
      if (!togglePlacement.isFloating) {
        togglePlacement.isFloating = true;
        document.body.appendChild(toggleBtn);
      }
    } else if (togglePlacement.isFloating) {
      togglePlacement.isFloating = false;
      const parent = togglePlacement.parent;
      if (parent) {
        if (
          togglePlacement.nextSibling &&
          togglePlacement.nextSibling.parentNode === parent
        ) {
          parent.insertBefore(toggleBtn, togglePlacement.nextSibling);
        } else if (parent.firstChild) {
          parent.insertBefore(toggleBtn, parent.firstChild);
        } else {
          parent.appendChild(toggleBtn);
        }
      }
    }
  };

  const setState = (collapsed) => {
    toggleBtn.setAttribute("aria-expanded", (!collapsed).toString());
    toggleBtn.setAttribute(
      "aria-label",
      collapsed ? "Expandir barra lateral" : "Recolher barra lateral"
    );
    toggleBtn.classList.toggle("sidebar-toggle--collapsed", !!collapsed);
    setLabelVisibility(collapsed);
  };

  toggleBtn.addEventListener("click", () => {
    const collapsed = dashboardEl.classList.toggle(collapsedClass);
    forcedMobileCollapse = false;
    setState(collapsed);
  });

  let mobileQuery = null;
  const syncMobileState = (matches) => {
    setFloatingMode(matches);
    if (matches) {
      if (!dashboardEl.classList.contains(collapsedClass)) {
        dashboardEl.classList.add(collapsedClass);
      }
      forcedMobileCollapse = true;
      setState(true);
      return;
    }
    if (forcedMobileCollapse) {
      dashboardEl.classList.remove(collapsedClass);
      forcedMobileCollapse = false;
      setState(false);
      return;
    }
    setState(dashboardEl.classList.contains(collapsedClass));
  };

  if (typeof window.matchMedia === "function") {
    mobileQuery = window.matchMedia("(max-width: 768px)");
    const handleQueryChange = (event) => syncMobileState(event.matches);
    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", handleQueryChange);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(handleQueryChange);
    }
    syncMobileState(mobileQuery.matches);
  }
  setState(dashboardEl.classList.contains(collapsedClass));
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-section], .profile-edit");
    if (!trigger) return;

    let key = trigger.getAttribute("data-section");
    if (!key && trigger.classList.contains("profile-edit")) key = "perfil";
    if (!key) return;

    event.preventDefault();
    switchTo(key);
  });

  const createBtn = $("#btnCriar");
  if (createBtn) {
    createBtn.addEventListener("click", (event) => {
      event.preventDefault();
      switchTo("publicacoes");
    });
  }

  const logoutBtn = $("#btnLogout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await apiFetch("/api/logout", { method: "POST" });
      } catch (_) {}
      redirectToLogin();
    });
  }

  // Quando o usuário navega com os botões de voltar/avançar, atualize a
  // visualização com base na query string "aba" ou no hash de fallback.
  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(location.search);
    const key =
      params.get("aba") || (location.hash || "#visao").slice(1) || "visao";
    switchTo(key, { updateHash: false });
  });

  setupSidebarToggle();

  window.addEventListener("focus", updateSessionCountdownLabel);
}

document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="toggle-theme"]')) {
    setTimeout(updateUserAvatar, 0);
    setTimeout(() => {
      document.dispatchEvent(new Event("dashboard:theme-changed"));
    }, 0);
  }
});

const themeObserver = new MutationObserver(() => updateUserAvatar());
themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrap();
});

async function bootstrap() {
  try {
    await bootstrapUser();
  } catch (err) {
    console.error("Falha ao carregar usuário atual", err);
    return;
  }
  // Recupera a aba inicial a partir da query string (parametro "aba"). Caso não
  // exista, utiliza o valor definido no fragmento de hash ou a aba padrão "visao".
  const params = new URLSearchParams(location.search);
  const initialQuery = params.get("aba");
  let initial = initialQuery || (location.hash || "#visao").slice(1);
  if (!initial) initial = "visao";
  switchTo(initial, { updateHash: false });
}

async function bootstrapUser() {
  try {
    const data = await apiFetch("/api/me");
    currentUser = adaptUser(data);
    window.currentUser = currentUser;
    scheduleSessionExpiration(currentUser?.sessionExpiresAt);
    initUserUI();
    handlePasswordAlertForUser();
    document.dispatchEvent(
      new CustomEvent("dashboard:bootstrap", { detail: { user: currentUser } })
    );
  } catch (err) {
    console.error("Falha ao carregar usuário atual", err);
    redirectToLogin();
    throw err;
  }
}

window.DEFAULT_AVATARS = DEFAULT_AVATARS;
window.apiFetch = apiFetch;
window.isLightTheme = isLightTheme;

(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const infoEl = document.getElementById("sessionInfo");
    if (!infoEl) return;
    const popoverText =
      "Quando o contador chegar em zero, sua sessão estará expirada. Caso você volte para uma aba ou até mesmo feche o navegador, você terá que logar novamente.";
    const popover = document.createElement("div");
    const popId = "session-expiration-popover";
    popover.id = popId;
    popover.className = "session-info-popover";
    popover.setAttribute("role", "tooltip");
    popover.textContent = popoverText;
    // Estilos inline para não depender de CSS externo. Ajusta cores e
    // dimensões para não interferir no layout existente.
    popover.style.position = "absolute";
    popover.style.padding = "8px 12px";
    popover.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    popover.style.color = "#fff";
    popover.style.fontSize = "0.75rem";
    popover.style.lineHeight = "1.2";
    popover.style.borderRadius = "4px";
    popover.style.maxWidth = "260px";
    popover.style.zIndex = "9999";
    popover.style.display = "none";
    popover.style.pointerEvents = "none";
    document.body.appendChild(popover);
    // Vincule o popover ao elemento para acessibilidade.
    infoEl.setAttribute("aria-describedby", popId);
    function showPopover() {
      // Torna visível para medir dimensões antes de posicionar.
      popover.style.display = "block";
      const rect = infoEl.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      const top = rect.bottom + 8 + scrollY;
      let left = rect.left + rect.width / 2 - popRect.width / 2 + scrollX;
      const margin = 8;
      // Impede que o popover ultrapasse as bordas da janela
      if (left < margin) left = margin;
      const maxLeft = window.innerWidth - popRect.width - margin;
      if (left > maxLeft) left = maxLeft;
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    }
    function hidePopover() {
      popover.style.display = "none";
    }
    infoEl.addEventListener("mouseenter", showPopover);
    infoEl.addEventListener("mouseleave", hidePopover);
    infoEl.addEventListener("focus", showPopover);
    infoEl.addEventListener("blur", hidePopover);
  });
})();
