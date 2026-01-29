async function loadJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "href") node.setAttribute("href", value);
    else if (key === "type") node.setAttribute("type", value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function getPageId() {
  const match = window.location.pathname.match(/\/([^/]+)\.html$/);
  return match ? match[1] : "index";
}

function buildChapters(toc) {
  const chapters = [];
  let current = null;
  for (const item of toc) {
    if (item.depth === 0) {
      current = { ...item, children: [] };
      chapters.push(current);
    } else if (item.depth === 1) {
      if (!current) {
        current = { id: "misc", title: "未归类", depth: 0, children: [] };
        chapters.push(current);
      }
      current.children.push(item);
    }
  }
  return chapters;
}

function ensureFrame(lang, base, currentId, lastId) {
  if (document.querySelector(".site-header")) return;
  const header = el("header", { class: "site-header" });
  const titleText = lang === "en" ? "Political Triple-Axis Model" : "政治三轴模型";
  const targetId = currentId !== "index" ? currentId : lastId || "index";
  const menuToggle = el(
    "button",
    {
      class: "site-header__menu-toggle",
      type: "button",
      "aria-expanded": "false",
      "aria-label": "目录",
    },
    ["☰"]
  );
  const left = el("div", { class: "site-header__left" }, [
    menuToggle,
    el("a", { href: `${base}index.html`, class: "site-header__title-link" }, [
      titleText,
    ]),
  ]);
  const nav = el("nav", { class: "site-header__nav" }, [
    el("a", { href: `${base}zh/${targetId}.html` }, ["中文阅读"]),
    el("a", { href: `${base}en/${targetId}.html` }, ["英文阅读"]),
    el("a", { href: `${base}axis/index.html` }, ["3D 图形展示"]),
  ]);
  const navLinks = nav.querySelectorAll("a");
  if (lang === "zh" && navLinks[0]) navLinks[0].classList.add("is-active");
  if (lang === "en" && navLinks[1]) navLinks[1].classList.add("is-active");
  header.append(left, nav);

  const footer = el("footer", { class: "site-footer" }, [
    el("div", { class: "site-footer__text" }, ["Copyright 2024 Political Triple-Axis Model"]),
  ]);

  document.body.prepend(header);
  document.body.append(footer);
  document.body.classList.add("has-fixed-frame");

  const setVars = () => {
    const headerHeight = header.getBoundingClientRect().height;
    const footerHeight = footer.getBoundingClientRect().height;
    document.documentElement.style.setProperty(
      "--site-header-height",
      `${Math.ceil(headerHeight)}px`
    );
    document.documentElement.style.setProperty(
      "--site-footer-height",
      `${Math.ceil(footerHeight)}px`
    );
  };
  setVars();
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(setVars);
    ro.observe(header);
    ro.observe(footer);
  }
}

function renderToc(container, toc, lang, base, currentId, openSet) {
  container.innerHTML = "";
  const chapters = buildChapters(toc);
  for (const chapter of chapters) {
    const details = el("details", { class: "toc__chapter" });
    const isActiveChapter = chapter.id === currentId;
    const isActiveChild = chapter.children.some((child) => child.id === currentId);
    details.open = openSet.has(chapter.id) || isActiveChapter || isActiveChild;

    const summary = el("summary");
    const titleLink = el(
      "a",
      { href: `${base}${lang}/${chapter.id}.html`, class: "toc__chapter-title" },
      [chapter.title]
    );
    if (isActiveChapter) titleLink.classList.add("is-active");
    summary.append(titleLink);
    details.append(summary);

    if (chapter.children.length) {
      const sectionWrap = el("div", { class: "toc__sections" });
      for (const child of chapter.children) {
        const childLink = el(
          "a",
          { href: `${base}${lang}/${child.id}.html`, class: "toc__section-link" },
          [child.title]
        );
        if (child.id === currentId) childLink.classList.add("is-active");
        sectionWrap.append(childLink);
      }
      details.append(sectionWrap);
    }

    details.addEventListener("toggle", () => {
      if (details.open) openSet.add(chapter.id);
      else openSet.delete(chapter.id);
      sessionStorage.setItem(`toc-open-${lang}`, JSON.stringify([...openSet]));
    });

    container.append(details);
  }
}

function renderFixedNav(toc, lang, base, currentId, main) {
  if (!main) return;
  const currentIndex = toc.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) return;
  const prev = toc[currentIndex - 1];
  const next = toc[currentIndex + 1];
  if (!prev && !next) return;
  if (main.querySelector(".reader-nav-fixed")) return;

  const nav = el("div", { class: "reader-nav-fixed" });
  const prevLabel = lang === "en" ? "Previous" : "向前";
  const nextLabel = lang === "en" ? "Next" : "向后";
  if (prev) {
    nav.append(
      el("a", { href: `${base}${lang}/${prev.id}.html` }, [`← ${prevLabel}`])
    );
  }
  if (next) {
    nav.append(
      el("a", { href: `${base}${lang}/${next.id}.html` }, [`${nextLabel} →`])
    );
  }
  main.prepend(nav);
}

function ensureActiveTocVisible(sidebar) {
  if (!sidebar) return;
  const activeLink = sidebar.querySelector(
    ".toc__section-link.is-active, .toc__chapter-title.is-active"
  );
  if (!activeLink) return;
  const sidebarRect = sidebar.getBoundingClientRect();
  const linkRect = activeLink.getBoundingClientRect();
  const linkTop = linkRect.top - sidebarRect.top + sidebar.scrollTop;
  const linkBottom = linkTop + linkRect.height;
  const viewTop = sidebar.scrollTop;
  const viewBottom = viewTop + sidebar.clientHeight;
  if (linkTop >= viewTop && linkBottom <= viewBottom) return;

  const targetTop = Math.max(
    0,
    Math.min(
      linkTop - sidebar.clientHeight * 0.35,
      sidebar.scrollHeight - sidebar.clientHeight
    )
  );
  sidebar.scrollTop = targetTop;
}

document.addEventListener("DOMContentLoaded", async () => {
  const tocEl = document.getElementById("toc");
  if (!tocEl) return;
  const lang = tocEl.dataset.lang || "zh";
  const base = document.body?.dataset?.base || "";
  const currentId = getPageId();
  const lastIdKey = "toc-last-id";
  const lastId = sessionStorage.getItem(lastIdKey) || "";
  const app = document.querySelector(".app");
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");
  ensureFrame(lang, base, currentId, lastId);

  const menuToggle = document.querySelector(".site-header__menu-toggle");
  if (menuToggle && app) {
    menuToggle.addEventListener("click", () => {
      const isOpen = app.classList.toggle("app--menu-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });
    main?.addEventListener("click", (event) => {
      if (!app.classList.contains("app--menu-open")) return;
      if (event.target.closest(".reader-nav-fixed")) return;
      app.classList.remove("app--menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  }

  const scrollKey = `toc-scroll-${lang}`;
  if (sidebar) {
    const savedScroll = Number.parseFloat(sessionStorage.getItem(scrollKey) || "0");
    if (Number.isFinite(savedScroll)) sidebar.scrollTop = savedScroll;
    window.addEventListener("beforeunload", () => {
      sessionStorage.setItem(scrollKey, String(sidebar.scrollTop));
    });
  }

  if (currentId !== "index") {
    sessionStorage.setItem(lastIdKey, currentId);
  }

  let openSet = new Set();
  try {
    const saved = JSON.parse(sessionStorage.getItem(`toc-open-${lang}`) || "[]");
    openSet = new Set(saved);
  } catch (error) {
    openSet = new Set();
  }

  try {
    const toc = await loadJson(`${base}assets/toc.${lang}.json`);
    renderToc(tocEl, toc, lang, base, currentId, openSet);
    ensureActiveTocVisible(sidebar);
    renderFixedNav(toc, lang, base, currentId, main);
  } catch (error) {
    tocEl.textContent =
      "目录尚未生成。请先运行 node splitBooks.mjs。";
    console.error(error);
  }
});
