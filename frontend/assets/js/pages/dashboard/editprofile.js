document.addEventListener("DOMContentLoaded", () => {
  const view = document.getElementById("view-perfil");
  if (!view) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const pv = {
    avatar: $("#pvAvatar", view),
    name: $("#pvName", view),
    email: $("#pvEmail", view),
    loc: $("#pvLoc", view),
    phone: $("#pvPhone", view),
    about: $("#pvAbout", view),
  };
  const feedbackModal = window.appModal || null;

  function showFeedback(type, message) {
    if (!message) return;
    if (feedbackModal) {
      feedbackModal.showStatus({
        type,
        message,
        duration: window.TLU_LOADING_MS,
      });
      return;
    }
    const logger = type === "error" ? console.warn : console.info;
    logger(message);
  }

  const inputs = {
    avatarBox: $("#avatarBox", view),
    avatarImg: $("#avatarImg", view),
    avatarInput: $("#avatarInput", view),
    name: $("#name", view),
    email: $("#email", view),
    phone: $("#phone", view),
    location: $("#location", view),
    about: $("#about", view), // [L1] ADICIONADO
    instagram: $("#instagram", view),
    linkedin: $("#linkedin", view),
    twitter: $("#twitter", view),
    emailSocial: $("#emailSocial", view),
    pwdCurrent: $("#pwdCurrent", view),
    pwdNew: $("#pwdNew", view),
    pwdConfirm: $("#pwdConfirm", view),
    btnSave: $("#btnSave", view),
  };

  let state = {
    id: null,
    nome: "",
    email: "",
    phone: "",
    location: "",
    about: "",
    avatar_light: "",
    avatar_dark: "",
    avatarDataUrl: null,
    instagram: "",
    linkedin: "",
    twitter: "",
    email_social: "",
  };

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  function validateSocialInputs(values) {
    if (!values) return null;
    const normalized = {
      instagram: (values.instagram || "").trim(),
      linkedin: (values.linkedin || "").trim(),
      twitter: (values.twitter || "").trim(),
      emailSocial: (values.emailSocial || "").trim(),
    };

    if (
      normalized.instagram &&
      !normalized.instagram.toLowerCase().startsWith("https://instagram.com/")
    ) {
      return "Instagram deve começar com https://instagram.com/";
    }
    if (
      normalized.linkedin &&
      !normalized.linkedin.toLowerCase().startsWith("https://linkedin.com/in/")
    ) {
      return "LinkedIn deve começar com https://linkedin.com/in/";
    }
    if (
      normalized.twitter &&
      !normalized.twitter.toLowerCase().startsWith("https://twitter.com/")
    ) {
      return "Twitter deve começar com https://twitter.com/";
    }
    if (normalized.emailSocial && !EMAIL_REGEX.test(normalized.emailSocial)) {
      return "Informe um e-mail válido nas redes sociais.";
    }
    return null;
  }

  function fillPreview(data) {
    if (!data) return;
    if (pv.avatar) pv.avatar.src = data.avatar_light || data.avatar_dark || "";
    if (pv.name) pv.name.textContent = data.nome || "—";
    if (pv.email) pv.email.textContent = data.email || "—";
    if (pv.loc) pv.loc.textContent = data.location || "—";
    if (pv.phone) pv.phone.textContent = data.phone || "—";
    if (pv.about) pv.about.textContent = data.about || "—";
  }

  async function loadProfile() {
    const me = await apiFetch("/api/profile");
    state = { ...state, ...me };
    if (inputs.avatarImg)
      inputs.avatarImg.src = me.avatar_light || me.avatar_dark || "";
    if (inputs.name) inputs.name.value = me.nome || "";
    if (inputs.email) inputs.email.value = me.email || "";
    if (inputs.location) inputs.location.value = me.location || "";
    if (inputs.phone) inputs.phone.value = me.phone || "";
    if (inputs.about) inputs.about.value = me.about || "";
    if (inputs.instagram) inputs.instagram.value = me.instagram || "";
    if (inputs.linkedin) inputs.linkedin.value = me.linkedin || "";
    if (inputs.twitter) inputs.twitter.value = me.twitter || "";
    if (inputs.emailSocial)
      inputs.emailSocial.value = me.email_social || me.emailSocial || "";
    fillPreview(me);
  }

  (function initProfileTabsById() {
    const root = document.getElementById("view-perfil");
    if (!root) return;

    const tabBtns = Array.from(root.querySelectorAll(".tab-btn"));
    if (!tabBtns.length) return;

    const panes = {
      personal: root.querySelector("#tab-personal"),
      social: root.querySelector("#tab-social"),
      security: root.querySelector("#tab-security"),
    };

    function showTab(tabId) {
      tabBtns.forEach((btn) => {
        const on = btn.dataset.tab === tabId;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.tabIndex = on ? 0 : -1;
      });

      Object.entries(panes).forEach(([key, el]) => {
        if (!el) return;
        const show = key === tabId;
        if (show) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      });
    }

    tabBtns.forEach((btn) => {
      if (!btn.hasAttribute("role")) btn.setAttribute("role", "tab");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        showTab(btn.dataset.tab);
      });

      btn.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = tabBtns.indexOf(btn);
        const nextIndex =
          e.key === "ArrowRight"
            ? (i + 1) % tabBtns.length
            : (i - 1 + tabBtns.length) % tabBtns.length;
        const next = tabBtns[nextIndex];
        next.focus();
        showTab(next.dataset.tab);
      });
    });

    const initial =
      (location.hash && location.hash.slice(1)) ||
      tabBtns.find((b) => b.classList.contains("active"))?.dataset.tab ||
      "personal";

    showTab(initial);
  })();

  if (inputs.avatarBox && inputs.avatarInput) {
    inputs.avatarBox.addEventListener("click", () =>
      inputs.avatarInput.click()
    );
    inputs.avatarInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        inputs.avatarImg.src = reader.result;
        state.avatarDataUrl = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function checkPasswords() {
    const warn = $("#pwdWarn", view);
    const mismatch =
      inputs.pwdNew &&
      inputs.pwdConfirm &&
      (inputs.pwdNew.value || inputs.pwdConfirm.value)
        ? inputs.pwdNew.value !== inputs.pwdConfirm.value
        : false;
    if (warn) warn.style.display = mismatch ? "" : "none";
    return !mismatch;
  }
  ["input", "change"].forEach((evt) => {
    if (inputs.pwdNew) inputs.pwdNew.addEventListener(evt, checkPasswords);
    if (inputs.pwdConfirm)
      inputs.pwdConfirm.addEventListener(evt, checkPasswords);
  });

  // Contador e limite de 200
  const aboutInput = inputs.about;
  const aboutCounter = $("#aboutCounter", view);
  if (aboutInput && aboutCounter) {
    const updateCount = () => {
      aboutCounter.textContent = `${aboutInput.value.length}/200`;
    };
    aboutInput.addEventListener("input", () => {
      if (aboutInput.value.length > 200) {
        aboutInput.value = aboutInput.value.slice(0, 200);
      }
      updateCount();
    });
    updateCount();
  }

  if (inputs.btnSave) {
    inputs.btnSave.addEventListener("click", async () => {
      if (!checkPasswords()) return;

      const currentPwd = (inputs.pwdCurrent?.value || "").trim();
      const newPwd = (inputs.pwdNew?.value || "").trim();
      const confirmPwd = (inputs.pwdConfirm?.value || "").trim();

      const wantsPasswordChange = Boolean(currentPwd || newPwd || confirmPwd);

      if (
        wantsPasswordChange &&
        (!currentPwd.length || !newPwd.length || !confirmPwd.length)
      ) {
        showFeedback("error", "Preencha todos os campos de senha.");
        return;
      }

      if (wantsPasswordChange && newPwd.length < 6) {
        showFeedback(
          "error",
          "A nova senha deve ter pelo menos 6 caracteres."
        );
        return;
      }

      const socialValues = {
        instagram: (inputs.instagram?.value || "").trim(),
        linkedin: (inputs.linkedin?.value || "").trim(),
        twitter: (inputs.twitter?.value || "").trim(),
        emailSocial: (inputs.emailSocial?.value || "").trim(),
      };
      const socialError = validateSocialInputs(socialValues);
      if (socialError) {
        showFeedback("error", socialError);
        return;
      }

      const body = {
        nome: (inputs.name?.value || "").trim(),
        email: (inputs.email?.value || "").trim(),
        phone: (inputs.phone?.value || "").trim(),
        location: (inputs.location?.value || "").trim(),
        // [L2] seguro contra undefined + corte a 200
        about: (inputs.about?.value ?? "").trim().slice(0, 200),
        instagram: socialValues.instagram,
        linkedin: socialValues.linkedin,
        twitter: socialValues.twitter,
        email_social: socialValues.emailSocial,
      };
      if (state.avatarDataUrl) body.avatarDataUrl = state.avatarDataUrl;

      try {
        const updated = await apiFetch("/api/profile", {
          method: "PUT",
          body,
        });
        state = { ...state, ...updated, avatarDataUrl: null };
        fillPreview(updated);
        if (inputs.avatarImg) {
          inputs.avatarImg.src =
            updated.avatar_light || updated.avatar_dark || inputs.avatarImg.src;
        }

        let passwordChanged = false;
        if (wantsPasswordChange) {
          await apiFetch("/api/profile/password", {
            method: "POST",
            body: {
              currentPassword: currentPwd,
              newPassword: newPwd,
              confirmPassword: confirmPwd,
            },
          });
          passwordChanged = true;
        }

        if (passwordChanged) {
          const redirectDelayRaw = Number(window.TLU_LOADING_MS ?? 2000);
          const redirectDelay =
            Number.isFinite(redirectDelayRaw) && redirectDelayRaw > 0
              ? redirectDelayRaw
              : 2000;
          const canShowLoader =
            feedbackModal && typeof feedbackModal.showLoading === "function";
          if (canShowLoader) {
            feedbackModal.showLoading("Alterando senha...", {
              duration: redirectDelay,
              autoClose: true,
            });
          } else {
            showFeedback(
              "success",
              "Senha atualizada com sucesso! Redirecionando para o login..."
            );
          }
          if (inputs.pwdCurrent) inputs.pwdCurrent.value = "";
          if (inputs.pwdNew) inputs.pwdNew.value = "";
          if (inputs.pwdConfirm) inputs.pwdConfirm.value = "";
          try {
            await apiFetch("/api/logout", { method: "POST" });
          } catch (_) {}
          await new Promise((resolve) => setTimeout(resolve, redirectDelay));
          window.location.href = "/login";
          return;
        }

        showFeedback("success", "Perfil atualizado com sucesso!");
      } catch (err) {
        showFeedback("error", err.message || "Falha ao salvar perfil");
      }
    });
  }

  (function initLocationTypeahead() {
    const root = document.getElementById("view-perfil");
    if (!root) return;
    const input = root.querySelector("#location");
    if (!input) return;

    let data = null;
    let open = false;
    let activeIndex = -1;

    const box = document.createElement("div");
    box.className = "ta-list hidden";
    input.parentElement.style.position = "relative";
    input.parentElement.appendChild(box);

    const nf = (s) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    async function ensureData() {
      if (data) return;
      const res = await fetch("/api/geo/br/cities", { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao carregar cidades");
      data = await res.json();
    }

    function render(items) {
      box.innerHTML = "";
      items.forEach((city, i) => {
        const it = document.createElement("button");
        it.type = "button";
        it.className = "ta-item";
        it.textContent = city;
        it.dataset.index = i;
        it.addEventListener("mousedown", (e) => {
          e.preventDefault();
          input.value = city;
          close();
        });
        box.appendChild(it);
      });
      if (items.length) openList();
      else close();
    }

    function openList() {
      if (open) return;
      box.classList.remove("hidden");
      open = true;
      activeIndex = -1;
      highlight();
    }

    function close() {
      if (!open) return;
      box.classList.add("hidden");
      open = false;
      activeIndex = -1;
    }

    function highlight() {
      const items = Array.from(box.children);
      items.forEach((el, i) => {
        el.classList.toggle("is-active", i === activeIndex);
      });
    }

    let t;
    input.addEventListener("input", async () => {
      const q = input.value.trim();
      if (!q.length) {
        close();
        return;
      }
      clearTimeout(t);
      t = setTimeout(async () => {
        try {
          await ensureData();
          const k = nf(q);
          const res = [];
          for (let i = 0; i < data.length && res.length < 12; i++) {
            if (nf(data[i]).includes(k)) res.push(data[i]);
          }
          render(res);
        } catch {
          close();
        }
      }, 120);
    });

    input.addEventListener("keydown", (e) => {
      if (!open) return;
      const items = Array.from(box.children);
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        highlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        highlight();
      } else if (e.key === "Enter") {
        if (activeIndex >= 0) {
          e.preventDefault();
          const city = items[activeIndex].textContent;
          input.value = city;
          close();
        }
      } else if (e.key === "Escape") {
        close();
      }
    });

    document.addEventListener("click", (e) => {
      if (!open) return;
      if (e.target === input || box.contains(e.target)) return;
      close();
    });
  })();

  loadProfile().catch((err) => {
    console.error("Falha ao carregar perfil", err);
  });
});
