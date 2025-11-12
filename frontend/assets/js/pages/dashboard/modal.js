(function () {
  const modal = document.getElementById("modal-member");
  if (!modal) return;

  const dialog = modal.querySelector("[data-modal-member-dialog]");
  const overlay = modal.querySelector("[data-modal-member-close]");
  const btnClose = modal.querySelector(".modal-member__close");
  const btnPrev = modal.querySelector("[data-modal-member-prev]");
  const btnNext = modal.querySelector("[data-modal-member-next]");
  const btnSubmit = modal.querySelector("[data-modal-member-submit]");
  const btnCancel = modal.querySelector("[data-modal-member-cancel]");
  const stepsTrack = modal.querySelector("#modalMemberStepsTrack");
  const stepsCaption = modal.querySelector("#modalMemberStepsCaption");
  const errorsBox = modal.querySelector("#modalMemberErrors");
  const successLayer = modal.querySelector("#modalMemberSuccess");
  const successBar = modal.querySelector("#modalMemberSuccessBar");

  const inputName = modal.querySelector("#modalMemberName");
  const inputEmail = modal.querySelector("#modalMemberEmail");
  const inputCPF = modal.querySelector("#modalMemberCPF");
  const inputBirth = modal.querySelector("#modalMemberBirth");
  const rolesWrapper = modal.querySelector("#modalMemberRoles");
  const avatarPreview = modal.querySelector("#modalMemberAvatar");

  const reviewAvatar = modal.querySelector("#modalMemberReviewAvatar");
  const reviewName = modal.querySelector("#modalMemberReviewName");
  const reviewEmail = modal.querySelector("#modalMemberReviewEmail");
  const reviewCPF = modal.querySelector("#modalMemberReviewCPF");
  const reviewBirth = modal.querySelector("#modalMemberReviewBirth");
  const reviewRole = modal.querySelector("#modalMemberReviewRole");

  const STEP_TITLES = [
    "Informações pessoais",
    "Função profissional",
    "Revisão dos dados",
  ];

  const DEFAULT_LIGHT = (window.DEFAULT_AVATARS && window.DEFAULT_AVATARS.light) || "../assets/img/avatares/avatar_lightMode.png";
  const DEFAULT_DARK = (window.DEFAULT_AVATARS && window.DEFAULT_AVATARS.dark) || "../assets/img/avatares/avatar_darkMode.png";

  const state = {
    currentStep: 1,
    totalSteps: STEP_TITLES.length,
    mode: "create",
    onSubmit: null,
    memberId: null,
    form: {
      nome: "",
      email: "",
      cpfDigits: "",
      cpfFormatted: "",
      nascimento: "",
      role: "",
      avatarLight: DEFAULT_LIGHT,
      avatarDark: DEFAULT_DARK,
    },
  };

  function preventScroll(disable) {
    document.body.classList.toggle("modal-member-open", disable);
  }

  function normalizeCpfDigits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 11);
  }

  function formatCpfReadable(value) {
    const digits = normalizeCpfDigits(value);
    if (!digits) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.replace(/(\d{3})(\d{0,3})/, "$1.$2");
    if (digits.length <= 9) return digits.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) => (d ? `${a}.${b}.${c}-${d}` : `${a}.${b}.${c}`));
  }

  function formatBirthDisplay(value) {
    if (!value) return "Não informado";
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  function resolveAvatar() {
    const isLightTheme = typeof window.isLightTheme === "function" ? window.isLightTheme() : false;
    return isLightTheme ? state.form.avatarLight : state.form.avatarDark;
  }

  function updateAvatarPreview() {
    const url = resolveAvatar();
    avatarPreview.src = url;
    reviewAvatar.src = url;
  }

  function clearErrors() {
    if (!errorsBox) return;
    errorsBox.textContent = "";
    errorsBox.classList.remove("is-visible");
  }

  function showErrors(message) {
    if (!errorsBox) return;
    errorsBox.textContent = message;
    errorsBox.classList.add("is-visible");
  }

  function renderSteps() {
    if (!stepsTrack) return;
    stepsTrack.innerHTML = "";
    for (let i = 1; i <= state.totalSteps; i += 1) {
      const node = document.createElement("div");
      node.className = "modal-member__steps-node";
      if (i < state.currentStep) node.classList.add("is-done");
      if (i === state.currentStep) node.classList.add("is-active");
      node.innerHTML = i < state.currentStep
        ? '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>'
        : String(i);
      stepsTrack.appendChild(node);
      if (i < state.totalSteps) {
        const rail = document.createElement("div");
        rail.className = "modal-member__steps-rail";
        if (i < state.currentStep) rail.classList.add("is-done");
        stepsTrack.appendChild(rail);
      }
    }
    if (stepsCaption) {
      stepsCaption.textContent = `${STEP_TITLES[state.currentStep - 1]} • Etapa ${state.currentStep} de ${state.totalSteps}`;
    }
  }

  function updateReview() {
    reviewName.textContent = state.form.nome || "Nome não informado";
    reviewEmail.textContent = state.form.email || "Email não informado";
    reviewCPF.textContent = state.form.cpfFormatted || "CPF não informado";
    reviewBirth.textContent = formatBirthDisplay(state.form.nascimento);

    if (state.form.role) {
      reviewRole.textContent = state.form.role === "admin" ? "Administrador" : "Jornalista";
      reviewRole.style.background = state.form.role === "admin" ? "var(--color-adm)" : "var(--color-journ)";
      reviewRole.hidden = false;
    } else {
      reviewRole.hidden = true;
    }

    updateAvatarPreview();
  }

  function setStep(step) {
    state.currentStep = Math.max(1, Math.min(state.totalSteps, step));
    modal.querySelectorAll(".modal-member__step").forEach((section) => {
      const sectionStep = Number(section.getAttribute("data-step"));
      section.classList.toggle("is-active", sectionStep === state.currentStep);
    });
    btnPrev.disabled = state.currentStep === 1;
    btnNext.hidden = state.currentStep === state.totalSteps;
    btnSubmit.hidden = state.currentStep !== state.totalSteps;
    renderSteps();
    if (state.currentStep === state.totalSteps) {
      updateReview();
    }
  }

  function resetForm() {
    state.form = {
      nome: "",
      email: "",
      cpfDigits: "",
      cpfFormatted: "",
      nascimento: "",
      role: "",
      avatarLight: DEFAULT_LIGHT,
      avatarDark: DEFAULT_DARK,
    };
    state.memberId = null;
    inputName.value = "";
    inputEmail.value = "";
    inputCPF.value = "";
    inputBirth.value = "";
    rolesWrapper.querySelectorAll('input[name="modalMemberRole"]').forEach((input) => {
      input.checked = false;
    });
    updateAvatarPreview();
    clearErrors();
    updateReview();
  }

  function populateFromMember(member) {
    if (!member) return;
    state.memberId = member.id;
    state.form.nome = member.nome || member.name || "";
    state.form.email = member.email || "";
    state.form.cpfDigits = normalizeCpfDigits(member.cpf);
    state.form.cpfFormatted = formatCpfReadable(state.form.cpfDigits);
    state.form.nascimento = member.nascimento || "";
    state.form.role = (member.role || member.tipo || "").toLowerCase();
    state.form.avatarLight = member.avatar_light || DEFAULT_LIGHT;
    state.form.avatarDark = member.avatar_dark || DEFAULT_DARK;

    inputName.value = state.form.nome;
    inputEmail.value = state.form.email;
    inputCPF.value = state.form.cpfFormatted;
    inputBirth.value = state.form.nascimento;
    rolesWrapper.querySelectorAll('input[name="modalMemberRole"]').forEach((input) => {
      input.checked = input.value === state.form.role;
    });
    updateAvatarPreview();
    updateReview();
  }

  function validateStep(step) {
    clearErrors();
    if (step === 1) {
      if (!state.form.nome.trim()) {
        showErrors("Informe o nome completo do membro.");
        inputName.focus();
        return false;
      }
      if (!state.form.email.trim()) {
        showErrors("Informe um email válido.");
        inputEmail.focus();
        return false;
      }
      if (state.form.cpfDigits.length !== 11) {
        showErrors("Informe um CPF válido com 11 dígitos.");
        inputCPF.focus();
        return false;
      }
      if (!state.form.nascimento) {
        showErrors("Informe a data de nascimento.");
        inputBirth.focus();
        return false;
      }
    }
    if (step === 2) {
      if (!state.form.role) {
        showErrors("Selecione a função profissional.");
        return false;
      }
    }
    return true;
  }

  function setLoading(isLoading) {
    btnPrev.disabled = isLoading || state.currentStep === 1;
    btnNext.disabled = isLoading;
    btnSubmit.disabled = isLoading;
    btnCancel.disabled = isLoading;
  }

  function handlePrev() {
    setStep(state.currentStep - 1);
  }

  function handleNext() {
    if (!validateStep(state.currentStep)) return;
    setStep(state.currentStep + 1);
  }

  function showSuccess(callback) {
    if (!successLayer) {
      if (typeof callback === "function") callback();
      return;
    }
    successLayer.classList.add("is-visible");
    if (successBar) {
      successBar.style.transition = "width 1.5s linear";
      successBar.style.width = "100%";
    }
    setTimeout(() => {
      successLayer.classList.remove("is-visible");
      if (successBar) successBar.style.width = "0%";
      if (typeof callback === "function") callback();
    }, 1500);
  }

  function closeModal() {
    modal.setAttribute("hidden", "");
    preventScroll(false);
    state.onSubmit = null;
    state.mode = "create";
    resetForm();
  }

  function handleSubmit() {
    if (!validateStep(state.currentStep)) return;
    if (typeof state.onSubmit !== "function") {
      closeModal();
      return;
    }

    setLoading(true);
    clearErrors();

    const payload = {
      id: state.memberId,
      nome: state.form.nome.trim(),
      email: state.form.email.trim(),
      cpf: state.form.cpfDigits,
      nascimento: state.form.nascimento,
      role: state.form.role,
      avatar_light: state.form.avatarLight,
      avatar_dark: state.form.avatarDark,
    };

    Promise.resolve()
      .then(() => state.onSubmit(payload))
      .then((result) => {
        showSuccess(() => {
          closeModal();
          document.dispatchEvent(new CustomEvent("modal-member:success", { detail: { member: result, mode: state.mode } }));
        });
      })
      .catch((error) => {
        const msg = error?.message || "Não foi possível salvar os dados.";
        showErrors(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function openModal(options) {
    const { mode = "create", member = null, onSubmit = null } = options || {};
    state.mode = mode;
    state.onSubmit = onSubmit;
    resetForm();
    if (member) populateFromMember(member);
    setStep(1);
    modal.removeAttribute("hidden");
    preventScroll(true);
    clearErrors();
    if (dialog) {
      dialog.setAttribute("tabindex", "-1");
      dialog.focus({ preventScroll: true });
    }
  }

  function handleCancel() {
    closeModal();
  }

  function handleOverlay(event) {
    if (event.target === overlay) {
      closeModal();
    }
  }

  inputName?.addEventListener("input", (event) => {
    state.form.nome = event.target.value;
  });

  inputEmail?.addEventListener("input", (event) => {
    state.form.email = event.target.value;
  });

  inputCPF?.addEventListener("input", (event) => {
    const digits = normalizeCpfDigits(event.target.value);
    state.form.cpfDigits = digits;
    state.form.cpfFormatted = formatCpfReadable(digits);
    event.target.value = state.form.cpfFormatted;
  });

  inputBirth?.addEventListener("input", (event) => {
    state.form.nascimento = event.target.value;
  });

  rolesWrapper?.addEventListener("change", (event) => {
    if (event.target && event.target.matches('input[name="modalMemberRole"]')) {
      state.form.role = event.target.value;
    }
  });

  const themeObserver = new MutationObserver(updateAvatarPreview);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  overlay?.addEventListener("click", handleOverlay);
  btnClose?.addEventListener("click", closeModal);
  btnCancel?.addEventListener("click", handleCancel);
  btnPrev?.addEventListener("click", handlePrev);
  btnNext?.addEventListener("click", handleNext);
  btnSubmit?.addEventListener("click", handleSubmit);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hasAttribute("hidden")) {
      closeModal();
    }
  });

  window.MemberModal = {
    openCreate(options = {}) {
      openModal({ mode: "create", onSubmit: options.onSubmit });
    },
    openEdit(options = {}) {
      openModal({ mode: "edit", member: options.member, onSubmit: options.onSubmit });
    },
    close: closeModal,
  };
})();
