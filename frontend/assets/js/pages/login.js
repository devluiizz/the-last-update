(function () {
  const controls = document.querySelectorAll(".field__control");

  controls.forEach((control) => {
    const input = control.querySelector(".field__input");
    const icon = control.querySelector(".field__icon");

    if (!input || !icon) {
      return;
    }

    const activate = () => {
      control.classList.add("box-grad");
      icon.classList.add("box-grad");
    };

    const deactivate = () => {
      control.classList.remove("box-grad");
      icon.classList.remove("box-grad");
    };

    input.addEventListener("focus", activate);
    input.addEventListener("blur", deactivate);
  });
})();

function showLoginLoading(isOpen) {
  // Tempo padrão vem da config global (definida em utils.js)
  const LOADING_MS = (window.TLU_LOADING_MS ?? 6000) | 0;

  // Usa EXATAMENTE o modal global definido em utils.js (window.appModal),
  // que renderiza .tl-modal com os estilos do base.css.
  if (window.appModal && typeof window.appModal.showLoading === "function") {
    if (isOpen) {
      // AutoClose true para a barra não ficar em loop:
      window.appModal.showLoading("Entrando...", {
        duration: LOADING_MS,
        autoClose: true,
      });

      // (Opcional, mas útil caso algo force loop)
      requestAnimationFrame(() => {
        const bar = document.querySelector(".tl-modal__progress span");
        if (!bar) return;
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = `tl-modal-progress ${LOADING_MS}ms linear forwards`;
      });
    } else if (typeof window.appModal.hide === "function") {
      window.appModal.hide(true);
    }
    return;
  }

  // (Se utils.js não carregou, não criamos modal novo.)
}

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const modal = window.appModal || null;
  const LOGIN_ERROR_MESSAGE =
    "As credenciais informadas estão incorretas. Verifique seu CPF e senha.";

  const errorModal = $("#loginErrorModal");
  const errorRetryBtn = $("#loginErrorRetry");
  const errorOverlay = errorModal?.querySelector(
    "[data-dismiss='login-error']"
  );
  const errorDescription = $("#loginErrorDescription");
  let errorClosingTimer = null;

  function setErrorModal(open, message) {
    if (!errorModal) return;
    if (errorClosingTimer) {
      clearTimeout(errorClosingTimer);
      errorClosingTimer = null;
    }
    if (typeof message === "string" && message && errorDescription) {
      errorDescription.textContent = message;
    } else if (errorDescription) {
      errorDescription.textContent = LOGIN_ERROR_MESSAGE;
    }
    if (open) {
      errorModal.removeAttribute("hidden");
      requestAnimationFrame(() => {
        errorModal.setAttribute("data-open", "true");
      });
      setTimeout(() => {
        errorRetryBtn?.focus();
      }, 240);
      return;
    }
    errorModal.setAttribute("data-open", "false");
    const done = () => {
      errorModal.setAttribute("hidden", "");
      errorModal.removeEventListener("transitionend", done);
      if (cpfInput) cpfInput.focus();
    };
    errorModal.addEventListener("transitionend", done);
    errorClosingTimer = setTimeout(done, 280);
  }

  function showLoginErrorModal(message) {
    if (!errorModal) {
      window.alert(message || LOGIN_ERROR_MESSAGE);
      return;
    }
    setErrorModal(true, message);
  }

  function hideLoginErrorModal() {
    if (!errorModal) return;
    if (errorModal.getAttribute("data-open") !== "true") return;
    setErrorModal(false);
  }

  const cpfInput = $("#cpf");
  if (cpfInput) {
    cpfInput.addEventListener("input", () => {
      let digits = cpfInput.value.replace(/\D/g, "").slice(0, 11);

      let masked = "";
      if (digits.length <= 3) masked = digits;
      else if (digits.length <= 6)
        masked = digits.replace(/(\d{3})(\d{0,3})/, "$1.$2");
      else if (digits.length <= 9)
        masked = digits.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
      else
        masked = digits.replace(
          /(\d{3})(\d{3})(\d{3})(\d{0,2})/,
          "$1.$2.$3-$4"
        );

      cpfInput.value = masked;
    });

    cpfInput.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData(
        "text"
      );
      const digits = text.replace(/\D/g, "").slice(0, 11);
      const fakeInput = new Event("input", { bubbles: true });
      cpfInput.value = digits;
      cpfInput.dispatchEvent(fakeInput);
    });
  }

  const passwordInput = $("#password");
  const toggleBtn = $("#toggle-password");

  if (errorRetryBtn) {
    errorRetryBtn.addEventListener("click", () => {
      hideLoginErrorModal();
    });
  }
  if (errorOverlay) {
    errorOverlay.addEventListener("click", () => {
      hideLoginErrorModal();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideLoginErrorModal();
  });

  if (passwordInput && toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      toggleBtn.setAttribute("aria-pressed", String(!showing));
      passwordInput.focus();
    });
  }

  const form = $("#auth-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const LOADING_MS = (window.TLU_LOADING_MS ?? 6000) | 0;

      // abre o modal/loader e evita duplo clique
      showLoginLoading(true);
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      // 1) pegue os campos
      const cpfInput =
        form.querySelector('input[name="cpf"]') ||
        document.getElementById("cpf");
      const passInput =
        form.querySelector('input[name="password"]') ||
        document.getElementById("password");

      const cpfDigits = (cpfInput?.value || "").replace(/\D/g, "");
      const password = passInput?.value || "";

      // 2) valide (ajuste as regras se tiver outra validação no seu projeto)
      //    -> se você já tem uma função utilitária (ex.: validateCPF(cpfDigits)), use-a aqui.
      const cpfValid = cpfDigits.length === 11; // ou: const cpfValid = validateCPF(cpfDigits);
      const passwordValid = password.length >= 6; // adapte se sua regra for diferente

      if (!cpfValid || !passwordValid) {
        showLoginLoading(false);
        if (submitBtn) submitBtn.disabled = false;
        // exiba sua UI de erro (toast/label) aqui:
        // showFieldError("CPF ou senha inválidos");
        return;
      }

      const started = Date.now();

      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ cpf: cpfDigits, password }),
        });

        if (!res.ok) {
          let message = "Credenciais inválidas";
          try {
            const data = await res.json();
            if (data?.error) message = data.error;
          } catch (_) {}
          throw new Error(message);
        }

        // garante exibição MÍNIMA conforme configuração global
        const elapsed = Date.now() - started;
        const remaining = Math.max(0, LOADING_MS - elapsed);
        await new Promise((r) => setTimeout(r, remaining));

        // (opcional) esconder antes do redirect, se quiser
        // showLoginLoading(false);

        // Após login bem-sucedido, redirecione para a rota da dashboard sem
        // extensão .html. A aba será determinada pela query string se necessário.
        window.location.href = "/dashboard";
      } catch (err) {
        showLoginLoading(false);
        if (submitBtn) submitBtn.disabled = false;
        showLoginErrorModal(
          err?.message && err.message !== "Credenciais inválidas"
            ? err.message
            : LOGIN_ERROR_MESSAGE
        );
      }
    });
  }
})();
