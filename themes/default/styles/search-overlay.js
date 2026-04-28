(() => {
  const body = document.body;
  const header = document.querySelector(".site-header");
  const overlay = document.querySelector("[data-search-overlay]");
  const input = overlay ? overlay.querySelector("[data-search-input]") : null;
  const status = overlay ? overlay.querySelector("[data-search-status]") : null;
  const results = overlay ? overlay.querySelector("[data-search-results]") : null;
  const openButtons = document.querySelectorAll("[data-search-open]");
  const closeButtons = overlay ? overlay.querySelectorAll("[data-search-close]") : [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const searchIndexPath = overlay?.getAttribute("data-search-index-path") || "search-index.json";
  let restoreFocus = null;
  let closeTimer = 0;
  let lastScrollY = window.scrollY;
  let scrollTicking = false;
  let indexPromise = null;
  let hasIndexError = false;
  let isLoadingIndex = false;
  let searchEntries = [];
  let filteredEntries = [];
  let selectedIndex = -1;
  let inputTimer = 0;

  if (!overlay || !input || !status || !results) {
    return;
  }

  const fallbackLabels = {
    en: {
      failed: "Search index failed to load.",
      noResults: "No matching results.",
      page: "Page",
      post: "Post",
      startTyping: "Start typing to search posts and pages.",
    },
    "zh-CN": {
      failed: "\u641c\u7d22\u7d22\u5f15\u52a0\u8f7d\u5931\u8d25\u3002",
      noResults: "\u6ca1\u6709\u627e\u5230\u5339\u914d\u7ed3\u679c\u3002",
      page: "\u9875\u9762",
      post: "\u6587\u7ae0",
      startTyping: "\u5f00\u59cb\u8f93\u5165\u4ee5\u641c\u7d22\u6587\u7ae0\u548c\u9875\u9762\u3002",
    },
  };

  const isEditableTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      return true;
    }

    return ["input", "textarea", "select"].includes(target.tagName.toLowerCase());
  };

  const resolveLocale = () => {
    const configured = body.dataset.uiLocaleMode || "en";

    if (configured !== "auto") {
      return configured.startsWith("zh") ? "zh-CN" : "en";
    }

    const languages = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || document.documentElement.lang || "en"];

    return languages.some((language) => String(language).toLowerCase().startsWith("zh"))
      ? "zh-CN"
      : "en";
  };

  const getMessage = (key) => {
    const label = overlay.querySelector(`[data-search-label="${key}"]`);

    if (label && label.textContent && label.textContent.trim()) {
      return label.textContent.trim();
    }

    const locale = resolveLocale();

    return fallbackLabels[locale]?.[key] || fallbackLabels.en[key] || key;
  };

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const normalizeTags = (tags) => {
    if (Array.isArray(tags)) {
      return tags.map((tag) => String(tag).trim()).filter(Boolean);
    }

    return String(tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  };

  const normalizeRoutePath = (path) => {
    if (!path || path === "index.html") {
      return "/";
    }

    const withoutIndex = String(path).replace(/index\.html$/i, "");
    const withLeadingSlash = withoutIndex.startsWith("/") ? withoutIndex : `/${withoutIndex}`;

    return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
  };

  const getRouteDepth = (path) => {
    const normalizedPath = normalizeRoutePath(path);

    if (normalizedPath === "/") {
      return 0;
    }

    return normalizedPath.replace(/^\/|\/$/g, "").split("/").length;
  };

  const routeToRelativeHref = (targetUrl, currentPath) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(targetUrl) || String(targetUrl).startsWith("#")) {
      return String(targetUrl);
    }

    const normalizedTarget = normalizeRoutePath(targetUrl);
    const prefix = "../".repeat(getRouteDepth(currentPath));

    if (normalizedTarget === "/") {
      return `${prefix}index.html`;
    }

    return `${prefix}${normalizedTarget.replace(/^\/|\/$/g, "")}/index.html`;
  };

  const createEntry = (item) => {
    if (!item || typeof item !== "object") {
      return null;
    }

    const title = String(item.title || "").trim();
    const url = String(item.url || "").trim();

    if (!title || !url) {
      return null;
    }

    const description = String(item.description || "").trim();
    const excerpt = String(item.excerpt || item.content || "").trim();
    const tags = normalizeTags(item.tags);
    const type = String(item.type || "").trim();

    return {
      description,
      excerpt,
      tags,
      title,
      type,
      url,
    };
  };

  const normalizeIndex = (payload) => {
    const groups = Array.isArray(payload)
      ? [payload]
      : [payload?.posts, payload?.pages];

    return groups
      .flatMap((group) => (Array.isArray(group) ? group : []))
      .map(createEntry)
      .filter(Boolean);
  };

  const scoreEntry = (entry, tokens) => {
    let score = 0;
    const title = normalizeText(entry.title);
    const description = normalizeText(entry.description);
    const excerpt = normalizeText(entry.excerpt);
    const tags = normalizeText(entry.tags.join(" "));

    for (const token of tokens) {
      let tokenMatched = false;

      if (title.includes(token)) {
        score += 6;
        tokenMatched = true;
      }

      if (description.includes(token)) {
        score += 4;
        tokenMatched = true;
      }

      if (tags.includes(token)) {
        score += 3;
        tokenMatched = true;
      }

      if (excerpt.includes(token)) {
        score += 2;
        tokenMatched = true;
      }

      if (!tokenMatched) {
        return -1;
      }
    }

    return score;
  };

  const renderStatus = (message) => {
    status.hidden = false;
    status.textContent = message;
  };

  const clearResults = () => {
    results.innerHTML = "";
  };

  const renderEntries = () => {
    clearResults();

    if (filteredEntries.length === 0) {
      return;
    }

    const currentPath = body.dataset.path || "/";

    results.innerHTML = filteredEntries
      .map((entry, index) => {
        const isSelected = index === selectedIndex;
        const href = routeToRelativeHref(entry.url, currentPath);
        const summary = entry.description || entry.excerpt;
        const summaryHtml = summary
          ? `<p class="search-result-description">${escapeHtml(summary)}</p>`
          : "";
        const typeHtml = entry.type
          ? `<span class="search-result-type">${escapeHtml(getMessage(entry.type))}</span>`
          : "";
        const tagsHtml = entry.tags.length
          ? `<div class="search-result-tags">${entry.tags
              .map((tag) => `<span>${escapeHtml(tag)}</span>`)
              .join("")}</div>`
          : "";

        return `<li class="search-result-item">
  <a class="search-result-link${isSelected ? " is-selected" : ""}" href="${escapeHtml(href)}" data-search-result-index="${index}" role="option" aria-selected="${isSelected ? "true" : "false"}">
    <div class="search-result-meta">${typeHtml}${tagsHtml}</div>
    <strong class="search-result-title">${escapeHtml(entry.title)}</strong>
    ${summaryHtml}
  </a>
</li>`;
      })
      .join("");

    const activeResult = results.querySelector(`[data-search-result-index="${selectedIndex}"]`);

    if (activeResult) {
      activeResult.scrollIntoView({ block: "nearest" });
    }
  };

  const updateResults = () => {
    const query = normalizeText(input.value);

    if (!query) {
      filteredEntries = [];
      selectedIndex = -1;
      clearResults();
      renderStatus(hasIndexError ? getMessage("failed") : getMessage("startTyping"));
      return;
    }

    if (isLoadingIndex) {
      filteredEntries = [];
      selectedIndex = -1;
      clearResults();
      status.hidden = true;
      return;
    }

    if (hasIndexError) {
      filteredEntries = [];
      selectedIndex = -1;
      clearResults();
      renderStatus(getMessage("failed"));
      return;
    }

    if (searchEntries.length === 0) {
      filteredEntries = [];
      selectedIndex = -1;
      clearResults();
      renderStatus(getMessage("noResults"));
      return;
    }

    const tokens = query.split(" ").filter(Boolean);
    filteredEntries = searchEntries
      .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title))
      .map((entry) => entry.entry);
    selectedIndex = filteredEntries.length > 0 ? Math.min(Math.max(selectedIndex, 0), filteredEntries.length - 1) : -1;

    if (filteredEntries.length === 0) {
      clearResults();
      renderStatus(getMessage("noResults"));
      return;
    }

    status.hidden = true;
    renderEntries();
  };

  const ensureSearchIndex = async () => {
    if (indexPromise) {
      return indexPromise;
    }

    indexPromise = fetch(searchIndexPath, {
      headers: {
        Accept: "application/json",
      },
    })
      .then((response) => {
        isLoadingIndex = false;
        return response;
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load search index: ${response.status}`);
        }

        const payload = await response.json();
        searchEntries = normalizeIndex(payload);
        hasIndexError = false;
        updateResults();
        return searchEntries;
      })
      .catch(() => {
        isLoadingIndex = false;
        searchEntries = [];
        hasIndexError = true;
        updateResults();
        return [];
      });

    isLoadingIndex = true;
    return indexPromise;
  };

  const openSelectedResult = () => {
    const selected = filteredEntries[selectedIndex];

    if (!selected) {
      return;
    }

    window.location.href = routeToRelativeHref(selected.url, body.dataset.path || "/");
  };

  const openSearch = () => {
    window.clearTimeout(closeTimer);
    restoreFocus = document.activeElement && typeof document.activeElement.focus === "function"
      ? document.activeElement
      : null;
    overlay.hidden = false;
    body.classList.add("search-open");

    if (header) {
      header.classList.remove("is-hidden");
    }

    window.requestAnimationFrame(() => {
      overlay.classList.add("is-open");
      input.focus({ preventScroll: true });
      input.select();
      updateResults();
      void ensureSearchIndex();
    });
  };

  const closeSearch = () => {
    if (overlay.hidden) {
      return;
    }

    overlay.classList.remove("is-open");
    body.classList.remove("search-open");
    closeTimer = window.setTimeout(() => {
      overlay.hidden = true;
    }, reduceMotion ? 0 : 180);

    if (restoreFocus && typeof restoreFocus.focus === "function") {
      restoreFocus.focus({ preventScroll: true });
    }
  };

  openButtons.forEach((button) => button.addEventListener("click", openSearch));
  closeButtons.forEach((button) => button.addEventListener("click", closeSearch));

  input.addEventListener("input", () => {
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => {
      updateResults();
    }, 40);
  });

  results.addEventListener("mousemove", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-search-result-index]")
      : null;

    if (!target) {
      return;
    }

    const nextIndex = Number(target.getAttribute("data-search-result-index"));

    if (Number.isNaN(nextIndex) || nextIndex === selectedIndex) {
      return;
    }

    selectedIndex = nextIndex;
    renderEntries();
  });

  results.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-search-result-index]")
      : null;

    if (!target) {
      return;
    }

    selectedIndex = Number(target.getAttribute("data-search-result-index"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      event.preventDefault();
      closeSearch();
      return;
    }

    const key = String(event.key).toLowerCase();

    if ((event.metaKey || event.ctrlKey) && key === "k") {
      if (isEditableTarget(event.target) && event.target !== input) {
        return;
      }

      event.preventDefault();
      openSearch();
      return;
    }

    if (overlay.hidden) {
      return;
    }

    if (event.key === "ArrowDown" && filteredEntries.length > 0) {
      event.preventDefault();
      selectedIndex = selectedIndex < filteredEntries.length - 1 ? selectedIndex + 1 : 0;
      status.hidden = true;
      renderEntries();
      return;
    }

    if (event.key === "ArrowUp" && filteredEntries.length > 0) {
      event.preventDefault();
      selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredEntries.length - 1;
      status.hidden = true;
      renderEntries();
      return;
    }

    if (event.key === "Enter" && filteredEntries.length > 0 && selectedIndex >= 0) {
      const activeElement = document.activeElement;

      if (activeElement === input || overlay.contains(activeElement)) {
        event.preventDefault();
        openSelectedResult();
      }
    }
  });

  const shouldHideHeader = header && body.dataset.contentType === "post";
  const updateHeader = () => {
    const currentScrollY = window.scrollY;

    if (body.classList.contains("search-open") || currentScrollY < 96) {
      header.classList.remove("is-hidden");
    } else if (currentScrollY > lastScrollY + 8) {
      header.classList.add("is-hidden");
    } else if (currentScrollY < lastScrollY - 8) {
      header.classList.remove("is-hidden");
    }

    lastScrollY = currentScrollY;
    scrollTicking = false;
  };

  if (shouldHideHeader) {
    window.addEventListener(
      "scroll",
      () => {
        if (!scrollTicking) {
          window.requestAnimationFrame(updateHeader);
          scrollTicking = true;
        }
      },
      { passive: true },
    );
  }
})();
