(() => {
  const sourceEl = document.getElementById("md-source");
  const targetEl = document.getElementById("content");
  if (!sourceEl || !targetEl) return;
  const md = sourceEl.textContent || "";
  if (!window.markdownit) {
    targetEl.textContent = "Markdown parser not loaded.";
    return;
  }
  const parser = window.markdownit({
    html: true,
    linkify: true,
  });
  targetEl.innerHTML = parser.render(md);
})();

