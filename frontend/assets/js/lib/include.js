document.addEventListener("DOMContentLoaded", () => {
  const targets = document.querySelectorAll("[data-include]");
  targets.forEach(async (el) => {
    const file = el.getAttribute("data-include");
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(res.status);
      const html = await res.text();
      el.outerHTML = html;
    } catch (err) {
      el.innerHTML = `<!-- include failed: ${file} (${err}) -->`;
    }
  });
});
