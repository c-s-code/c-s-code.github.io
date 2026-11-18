async function fetchText(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function setCurrentLink(link, isCurrent) {
  link.classList.toggle("active", isCurrent);
  if (isCurrent) {
    link.setAttribute("aria-current", "page");
  } else {
    link.removeAttribute("aria-current");
  }
}

async function loadPartials() {
  const includeTargets = document.querySelectorAll("[data-include]");

  const tasks = Array.from(includeTargets).map(async (el) => {
    const src = el.dataset.include;
    if (!src) return;

    try {
      el.innerHTML = await fetchText(src);
    } catch (err) {
      console.error(`Partial load failed for ${src}:`, err);
      el.innerHTML = `
        <div style="border:1px solid #f26419;padding:0.75rem;margin:0.5rem 0;background:#fff4ef;color:#2f4858;">
          Could not load <code>${src}</code>. This page must be opened via a local web server (for example, VS Code Live Server), not <code>file://</code> preview.
        </div>
      `;
    }
  });

  await Promise.all(tasks);
}

async function renderMarkdown(root = document) {
  const markdownTargets = root.querySelectorAll("[data-md-src]");

  const tasks = Array.from(markdownTargets).map(async (el) => {
    const src = el.dataset.mdSrc;
    if (!src) return;

    try {
      const markdown = await fetchText(src);

      // Render markdown when the parser is available. Fallback to plain text.
      if (typeof marked !== "undefined") {
        el.innerHTML = marked.parse(markdown);
      } else {
        el.textContent = markdown.trim();
      }
    } catch (err) {
      console.error(`Markdown load failed for ${src}:`, err);
    }
  });

  await Promise.all(tasks);
}

function initDynamicSectionLoader(host) {
  const slot = host.querySelector("[data-section-slot]");
  const status = host.querySelector("[data-section-status]");
  const prevButton = host.querySelector("[data-section-prev]");
  const topButton = host.querySelector("[data-section-top]");
  const nextButton = host.querySelector("[data-section-next]");
  const sectionConfig = host.querySelectorAll("[data-section-config]");
  const sectionGroup = host.dataset.sectionGroup || "";
  const groupedLinkRoot = sectionGroup
    ? document.querySelector(`[data-section-switcher="${sectionGroup}"]`)
    : null;
  const linkRoot = groupedLinkRoot || host.closest("main") || document;
  const sectionLinks = linkRoot.querySelectorAll("[data-section-target]");

  if (!slot || sectionConfig.length === 0) return;

  const sectionMap = {};
  sectionConfig.forEach((item) => {
    const id = item.dataset.sectionId;
    const src = item.dataset.sectionSrc;
    if (!id || !src) return;
    sectionMap[id] = { src };
  });

  const configuredOrder = (host.dataset.sectionOrder || "")
    .split(",")
    .map((sectionId) => sectionId.trim())
    .filter((sectionId) => sectionId && sectionMap[sectionId]);

  const sectionOrder =
    configuredOrder.length > 0 ? configuredOrder : Object.keys(sectionMap);

  if (sectionOrder.length === 0) return;

  const hashPrefix = (
    host.dataset.sectionHashPrefix ||
    sectionGroup ||
    "section"
  )
    .trim()
    .toLowerCase();
  const hashStart = `#${hashPrefix}-`;
  const cache = {};
  let activeSectionId = null;

  async function getRenderedSectionHtml(sectionId) {
    if (cache[sectionId]) return cache[sectionId];

    const src = sectionMap[sectionId]?.src;
    if (!src) return "";

    const html = await fetchText(src);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;

    await renderMarkdown(wrapper);
    cache[sectionId] = wrapper.innerHTML;
    return cache[sectionId];
  }

  function updateUiForSection(sectionId) {
    const index = sectionOrder.indexOf(sectionId);

    sectionLinks.forEach((link) => {
      const isActive = link.dataset.sectionTarget === sectionId;
      setCurrentLink(link, isActive);
    });

    if (prevButton) {
      prevButton.disabled = index <= 0;
    }

    if (nextButton) {
      nextButton.disabled = index >= sectionOrder.length - 1;
    }

    if (status) {
      status.textContent = `Section ${index + 1} of ${sectionOrder.length}`;
    }
  }

  async function setActiveSection(sectionId, pushHash = true) {
    if (!sectionMap[sectionId]) return;

    slot.innerHTML = "<p>Loading section...</p>";

    try {
      slot.innerHTML = await getRenderedSectionHtml(sectionId);
      activeSectionId = sectionId;
      updateUiForSection(sectionId);

      if (pushHash) {
        history.pushState(null, "", `${hashStart}${sectionId}`);
      }
    } catch (err) {
      console.error(`Section load failed for ${sectionId}:`, err);
      slot.innerHTML = "<p>Could not load this section.</p>";
    }
  }

  function getSectionFromHash() {
    const hash = window.location.hash.trim().toLowerCase();
    if (!hash.startsWith(hashStart)) return null;
    const sectionId = hash.replace(hashStart, "");
    return sectionMap[sectionId] ? sectionId : null;
  }

  sectionLinks.forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const sectionId = link.dataset.sectionTarget;
      if (!sectionId || sectionId === activeSectionId) return;
      await setActiveSection(sectionId, true);
    });
  });

  if (prevButton) {
    prevButton.addEventListener("click", async () => {
      const index = sectionOrder.indexOf(activeSectionId);
      if (index <= 0) return;
      await setActiveSection(sectionOrder[index - 1], true);
      window.scrollTo(0, 0);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", async () => {
      const index = sectionOrder.indexOf(activeSectionId);
      if (index < 0 || index >= sectionOrder.length - 1) return;
      await setActiveSection(sectionOrder[index + 1], true);
      window.scrollTo(0, 0);
    });
  }

  if (topButton) {
    topButton.addEventListener("click", () => {
      window.scrollTo(0, 0);
    });
  }

  window.addEventListener("popstate", async () => {
    const fromHash = getSectionFromHash();
    const fallback = sectionOrder[0];
    await setActiveSection(fromHash || fallback, false);
  });

  window.addEventListener("hashchange", async () => {
    const fromHash = getSectionFromHash();
    if (!fromHash || fromHash === activeSectionId) return;
    await setActiveSection(fromHash, false);
  });

  const initialSection = getSectionFromHash() || sectionOrder[0];
  setActiveSection(initialSection, false);
}

function initDynamicSectionLoaders() {
  document
    .querySelectorAll("[data-dynamic-sections]")
    .forEach((host) => initDynamicSectionLoader(host));
}

function normalizePath(pathname) {
  let path = (pathname || "").toLowerCase();
  if (!path) return "/index.html";

  if (path.endsWith("/")) {
    path += "index.html";
  }

  const lastSegment = path.split("/").pop() || "";
  if (lastSegment && !lastSegment.includes(".")) {
    path += ".html";
  }

  return path;
}

function initActiveNavLinks() {
  const currentPath = normalizePath(window.location.pathname);

  document.querySelectorAll("#primary-menu a").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    const linkPath = normalizePath(
      new URL(href, window.location.href).pathname,
    );
    setCurrentLink(link, linkPath === currentPath);
  });
}

function initHomeLink() {
  const homeTitleLink = document.querySelector("[data-home-link]");
  if (!homeTitleLink) return;

  homeTitleLink.addEventListener("click", (e) => {
    const path = window.location.pathname.toLowerCase();
    const onHomePage = path.endsWith("/") || path.endsWith("/index.html");

    if (onHomePage) {
      e.preventDefault();
    }
  });
}

function initSubmenus() {
  const submenuToggles = document.querySelectorAll(".submenu-toggle");

  function closeSubmenu(toggle) {
    const parentItem = toggle.closest(".has-submenu");
    parentItem?.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }

  function closeOtherSubmenus(currentToggle) {
    submenuToggles.forEach((toggle) => {
      if (toggle !== currentToggle) closeSubmenu(toggle);
    });
  }

  function closeAllSubmenus() {
    submenuToggles.forEach((toggle) => closeSubmenu(toggle));
  }

  submenuToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const parentItem = toggle.closest(".has-submenu");
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";

      closeOtherSubmenus(toggle);
      parentItem?.classList.toggle("open", !isExpanded);
      toggle.setAttribute("aria-expanded", String(!isExpanded));
    });

    toggle.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSubmenu(toggle);
        toggle.focus();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const activeSubmenu = document.activeElement?.closest(".has-submenu");
    if (!activeSubmenu) return;

    const toggle = activeSubmenu.querySelector(".submenu-toggle");
    if (!toggle) return;

    closeSubmenu(toggle);
    toggle.focus();
  });

  return closeAllSubmenus;
}

function initMobileNav(closeAllSubmenus = () => {}) {
  const hamburgerButton = document.querySelector(".hamburger");
  const navList = document.querySelector(".nav-list");

  if (!hamburgerButton || !navList) return;

  hamburgerButton.setAttribute("aria-expanded", "false");

  hamburgerButton.addEventListener("click", () => {
    navList.classList.toggle("show");
    const isExpanded = navList.classList.contains("show");
    hamburgerButton.setAttribute("aria-expanded", String(isExpanded));
    if (!isExpanded) closeAllSubmenus();
  });

  navList.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth > 800) return;

      navList.classList.remove("show");
      hamburgerButton.setAttribute("aria-expanded", "false");
      closeAllSubmenus();
    });
  });
}

function initCarousel() {
  const carousel = document.querySelector(".carousel");
  const carouselImages = carousel?.querySelector(".carousel-images");
  const prevBtn = carousel?.querySelector(".carousel-btn.carousel-prev");
  const nextBtn = carousel?.querySelector(".carousel-btn.carousel-next");
  const captionText = carousel?.querySelector(".carousel-caption");

  if (!carousel || !carouselImages || !prevBtn || !nextBtn) return;

  const slides = Array.from(carouselImages.children);
  let currentIndex = 0;

  function showSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    carouselImages.style.transform = `translateX(-${index * 100}%)`;
    currentIndex = index;

    if (captionText) {
      captionText.textContent =
        slides[currentIndex].dataset.caption ||
        slides[currentIndex].getAttribute("alt") ||
        "";
    }
  }

  prevBtn.addEventListener("click", () => showSlide(currentIndex - 1));
  nextBtn.addEventListener("click", () => showSlide(currentIndex + 1));
  showSlide(0);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();

  initActiveNavLinks();
  initHomeLink();

  const closeAllSubmenus = initSubmenus();
  initMobileNav(closeAllSubmenus);

  await renderMarkdown(document);
  initDynamicSectionLoaders();
  initCarousel();
});
