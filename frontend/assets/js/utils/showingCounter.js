const DEFAULT_LABEL = (shown, total) =>
  `Mostrando ${shown} de ${total}`;

function resolveValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num);
}

/**
 * Creates a updater function that keeps a "Mostrando X de Y" label in sync with
 * the amount of rendered items. The helper hides the target element whenever
 * there is nothing to show (0 de 0) to avoid empty placeholders on screen.
 *
 * @param {HTMLElement|null} element
 * @param {{ formatter?: (shown:number, total:number) => string }} options
 * @returns {(shown:number, total:number) => void}
 */
export function createShowingCounter(element, options = {}) {
  const target = element || null;
  const formatter =
    typeof options.formatter === "function" ? options.formatter : DEFAULT_LABEL;

  return function updateShowingCounter(shownValue = 0, totalValue = 0) {
    if (!target) return;
    const shown = resolveValue(shownValue);
    const hasTotal = Number.isFinite(totalValue);
    const total = resolveValue(
      hasTotal ? totalValue : Math.max(totalValue || 0, shown)
    );
    if (total === 0 && shown === 0) {
      target.hidden = true;
      target.textContent = "";
      return;
    }
    target.hidden = false;
    target.textContent = formatter(Math.min(shown, total), total);
  };
}
