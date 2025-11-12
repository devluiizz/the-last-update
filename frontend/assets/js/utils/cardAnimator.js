const DEFAULT_OPTIONS = {
  threshold: 0.6,
  root: null,
  rootMargin: "0px",
  mediaQuery: null,
};

function resolveElement(target) {
  if (!target) return null;
  if (target instanceof Element) return target;
  if (typeof target === "string") {
    return document.querySelector(target);
  }
  return null;
}

export function createCardAnimator(target, options = {}) {
  const container = resolveElement(target);
  if (!container) return null;
  const settings = { ...DEFAULT_OPTIONS, ...options };
  let observer = null;
  let cards = [];
  let mediaList = null;
  let isMatch = true;

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const clearActiveState = () => {
    const targetCards =
      cards.length > 0
        ? cards
        : Array.from(container.querySelectorAll(".post-card"));
    targetCards.forEach((card) => card.classList.remove("is-active"));
  };

  const highlightCard = (activeCard) => {
    cards.forEach((card) => {
      card.classList.toggle("is-active", card === activeCard);
    });
  };

  const refresh = () => {
    if (!isMatch) {
      cleanup();
      clearActiveState();
      return;
    }
    cleanup();
    cards = Array.from(container.querySelectorAll(".post-card"));
    if (!cards.length) return;
    highlightCard(cards[0]);
    observer = new IntersectionObserver(
      (entries) => {
        let candidate = null;
        let maxRatio = 0;
        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            candidate = entry.target;
            maxRatio = entry.intersectionRatio;
          }
        });
        if (!candidate || maxRatio < settings.threshold) return;
        highlightCard(candidate);
      },
      {
        root: settings.root,
        threshold: settings.threshold,
        rootMargin: settings.rootMargin,
      }
    );
    cards.forEach((card) => observer.observe(card));
  };

  const handleMediaChange = (event) => {
    isMatch = event.matches;
    refresh();
  };

  const destroy = () => {
    cleanup();
    clearActiveState();
    if (mediaList) {
      if (typeof mediaList.removeEventListener === "function") {
        mediaList.removeEventListener("change", handleMediaChange);
      } else if (typeof mediaList.removeListener === "function") {
        mediaList.removeListener(handleMediaChange);
      }
      mediaList = null;
    }
    cards = [];
  };

  if (
    settings.mediaQuery &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    mediaList = window.matchMedia(settings.mediaQuery);
    isMatch = mediaList.matches;
    if (typeof mediaList.addEventListener === "function") {
      mediaList.addEventListener("change", handleMediaChange);
    } else if (typeof mediaList.addListener === "function") {
      mediaList.addListener(handleMediaChange);
    }
  }

  return {
    refresh,
    destroy,
  };
}
