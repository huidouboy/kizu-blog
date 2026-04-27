const app = {
  user: null,
  capabilities: {},
  settings: null,
  profile: null,
  content: [],
  users: [],
  comments: [],
  themes: [],
  upgrade: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const field = (form, name) => form.elements.namedItem(name);
const adminOnlyViews = new Set(["users", "settings", "upgrade"]);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "请求失败");
    error.status = response.status;
    throw error;
  }
  return data;
}

function payload(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const input of form.querySelectorAll("input[type='checkbox']")) {
    data[input.name] = input.checked;
  }
  return data;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value = "") {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isAdmin() {
  return app.user?.role === "admin";
}

function showGate(mode) {
  $("[data-console]").hidden = true;
  $("[data-gate]").hidden = false;
  $("[data-setup-form]").hidden = mode !== "setup";
  $("[data-login-form]").hidden = mode !== "login";
  $("[data-gate-title]").textContent = mode === "setup" ? "初始化博客" : "登录工作台";
  $("[data-gate-copy]").textContent = mode === "setup"
    ? "创建第一个账号，随后开始写作和管理站点。"
    : "登录后进入你的内容工作台。";
}

function showConsole() {
  $("[data-gate]").hidden = true;
  $("[data-console]").hidden = false;
}

function configurePermissions() {
  $$("[data-view-button]").forEach((button) => {
    button.hidden = adminOnlyViews.has(button.dataset.viewButton) && !isAdmin();
  });

  const typeField = field($("[data-content-form]"), "type");
  if (typeField) {
    typeField.value = "post";
    typeField.disabled = !isAdmin();
  }
}

function switchView(name) {
  const fallback = adminOnlyViews.has(name) && !isAdmin() ? "overview" : name;
  $$("[data-view]").forEach((view) => view.classList.toggle("is-active", view.dataset.view === fallback));
  $$("[data-view-button]").forEach((button) => button.classList.toggle("is-active", button.dataset.viewButton === fallback));
  $("[data-view-title]").textContent = {
    overview: "总览",
    content: "内容",
    profile: "个人资料",
    users: "用户",
    comments: "评论",
    settings: "设置",
    themes: "主题",
    upgrade: "升级",
    guide: "主题规范"
  }[fallback] || "总览";
}

function renderMetrics(overview) {
  const labels = {
    posts: isAdmin() ? "文章" : "我的文章",
    pages: "页面",
    users: "用户",
    comments: "评论",
    pendingComments: "待审"
  };
  $("[data-metrics]").innerHTML = Object.entries(labels).map(([key, label]) => `
    <article class="metric">
      <strong>${overview.counts[key] || 0}</strong>
      <span>${label}</span>
    </article>
  `).join("");

  $("[data-recent-posts]").innerHTML = overview.recentPosts.length
    ? overview.recentPosts.map((post) => `
      <article class="list-item">
        <div>
          <strong>${escapeHtml(post.title)}</strong>
          <small>${post.status} · ${post.type}</small>
        </div>
        <button type="button" data-edit-content="${post.id}">编辑</button>
      </article>
    `).join("")
    : "<p>还没有内容。</p>";
}

function renderContent() {
  $("[data-content-list]").innerHTML = app.content.length
    ? app.content.map((item) => `
      <article class="list-item">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.type} · ${item.status} · ${escapeHtml(item.slug)}</small>
        </div>
        <button type="button" data-edit-content="${item.id}">编辑</button>
      </article>
    `).join("")
    : "<p>还没有内容。</p>";
}

function fillContentForm(item = null) {
  const form = $("[data-content-form]");
  form.reset();
  field(form, "id").value = item?.id || "";
  field(form, "type").value = item?.type || "post";
  field(form, "slug").value = item?.slug || "";
  field(form, "title").value = item?.title || "";
  field(form, "description").value = item?.description || "";
  field(form, "cover").value = item?.cover || "";
  field(form, "tags").value = (item?.tags || []).join(", ");
  field(form, "categories").value = (item?.categories || []).join(", ");
  field(form, "status").value = item?.status || "draft";
  field(form, "featured").checked = Boolean(item?.featured);
  field(form, "body").value = item?.body || "";
  configurePermissions();
}

function renderUsers() {
  const list = $("[data-user-list]");
  if (!list) return;
  list.innerHTML = app.users.map((user) => `
    <article class="list-item">
      <div>
        <strong>${escapeHtml(user.displayName)}</strong>
        <small>${escapeHtml(user.username)} · ${user.role} · ${user.status}</small>
      </div>
    </article>
  `).join("");
}

function renderComments() {
  $("[data-comment-list]").innerHTML = app.comments.length
    ? app.comments.map((comment) => `
      <article class="list-item">
        <div>
          <strong>${escapeHtml(comment.author?.displayName || "用户")}</strong>
          <small>${comment.status} · ${escapeHtml(comment.post?.title || "未知文章")}</small>
          <p>${escapeHtml(comment.body)}</p>
        </div>
        <div>
          <button type="button" data-comment-status="${comment.id}" data-status="approved">通过</button>
          <button type="button" data-comment-status="${comment.id}" data-status="spam">隐藏</button>
          <button type="button" data-comment-delete="${comment.id}">删除</button>
        </div>
      </article>
    `).join("")
    : "<p>还没有评论。</p>";
}

function renderProfile() {
  const form = $("[data-profile-form]");
  const profile = app.profile || app.user || {};
  field(form, "displayName").value = profile.displayName || "";
  field(form, "email").value = profile.email || "";
  field(form, "website").value = profile.website || "";
  field(form, "bio").value = profile.bio || "";
}

function renderSettings() {
  if (!app.settings) return;
  const form = $("[data-settings-form]");
  const settings = app.settings;
  field(form, "title").value = settings.title || "Kizu Blog";
  field(form, "subtitle").value = settings.subtitle || "";
  field(form, "description").value = settings.description || "";
  field(form, "url").value = settings.url || "";
  field(form, "authorName").value = settings.author?.name || "伊甸黎明";
  field(form, "authorBio").value = settings.author?.bio || "";
  field(form, "accent").value = settings.themeConfig?.accent || "#d84f3f";
  field(form, "surface").value = settings.themeConfig?.surface || "#fffaf4";
  field(form, "registrationOpen").checked = Boolean(settings.registrationOpen);
  field(form, "commentsModeration").checked = Boolean(settings.commentsModeration);
  $("[data-admin-site]").textContent = settings.title || "Kizu Blog";
}

function renderThemes() {
  const list = $("[data-theme-list]");
  if (!list) return;
  const importForm = $("[data-theme-import]");
  if (importForm) importForm.hidden = !isAdmin();
  list.innerHTML = app.themes.map((theme) => `
    <article class="theme-card ${theme.activeUser ? "is-active" : ""}">
      <div>
        <h3>${escapeHtml(theme.displayName || theme.name)}</h3>
        <p>${escapeHtml(theme.description || "")}</p>
        <small>${escapeHtml(theme.version || "")}</small>
      </div>
      <div class="theme-actions">
        <button type="button" data-activate-theme="${theme.directory}" data-scope="user" ${theme.activeUser ? "disabled" : ""}>
          ${theme.activeUser ? "我的主题" : "使用此主题"}
        </button>
        ${isAdmin() ? `<button type="button" data-activate-theme="${theme.directory}" data-scope="site" ${theme.activeSite ? "disabled" : ""}>${theme.activeSite ? "全站当前" : "设为全站"}</button>` : ""}
      </div>
    </article>
  `).join("");
}

function renderUpgrade() {
  const current = $("[data-upgrade-current]");
  const history = $("[data-upgrade-history]");
  if (!current || !history) return;

  if (!app.upgrade) {
    current.innerHTML = "<p>暂时无法读取升级信息。</p>";
    history.innerHTML = "";
    return;
  }

  const manifest = app.upgrade.manifest || {};
  current.innerHTML = `
    <div class="upgrade-meta">
      <article>
        <span>当前版本</span>
        <strong>${escapeHtml(app.upgrade.version || "0.0.0")}</strong>
      </article>
      <article>
        <span>产品标识</span>
        <strong>${escapeHtml(app.upgrade.product || "kizu-blog")}</strong>
      </article>
      <article>
        <span>内置主题</span>
        <strong>${escapeHtml((manifest.managedThemes || []).join(", ") || "无")}</strong>
      </article>
    </div>
  `;

  history.innerHTML = app.upgrade.lastUpgrade
    ? `
      <div class="upgrade-history">
        <h3>最近一次升级</h3>
        <p>版本：${escapeHtml(app.upgrade.lastUpgrade.previousVersion || "未知")} → ${escapeHtml(app.upgrade.lastUpgrade.nextVersion || "未知")}</p>
        <p>时间：${escapeHtml(formatDateTime(app.upgrade.lastUpgrade.completedAt))}</p>
        <p>执行者：${escapeHtml(app.upgrade.lastUpgrade.actor || "未记录")}</p>
        <p>备份：${escapeHtml(app.upgrade.lastUpgrade.backupRoot || "未记录")}</p>
      </div>
    `
    : "<p>还没有执行过项目升级。</p>";
}

async function loadAll() {
  const errors = [];
  const [overview, content, comments, profile, themes] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/content"),
    api("/api/admin/comments"),
    api("/api/admin/profile"),
    api("/api/admin/themes")
  ]);

  app.capabilities = overview.capabilities || {};
  app.content = content.items;
  app.comments = comments.comments;
  app.profile = profile.user;
  app.themes = themes.themes;

  if (isAdmin()) {
    const [usersResult, settingsResult, upgradeResult] = await Promise.allSettled([
      api("/api/admin/users"),
      api("/api/admin/settings"),
      api("/api/admin/upgrade")
    ]);

    if (usersResult.status === "fulfilled") {
      app.users = usersResult.value.users;
    } else {
      app.users = [];
      errors.push(usersResult.reason.message);
    }

    if (settingsResult.status === "fulfilled") {
      app.settings = settingsResult.value.settings;
    } else {
      app.settings = null;
      errors.push(settingsResult.reason.message);
    }

    if (upgradeResult.status === "fulfilled") {
      app.upgrade = upgradeResult.value;
    } else {
      app.upgrade = null;
      errors.push(upgradeResult.reason.message);
    }
  } else {
    app.users = [];
    app.settings = null;
    app.upgrade = null;
  }

  configurePermissions();
  renderMetrics(overview);
  renderContent();
  renderComments();
  renderProfile();
  renderUsers();
  renderSettings();
  renderThemes();
  renderUpgrade();

  if (errors.length) {
    const recent = $("[data-recent-posts]");
    if (recent) {
      recent.insertAdjacentHTML("afterbegin", `<p>${escapeHtml(errors.join("；"))}</p>`);
    }
  }
}

async function bootstrap() {
  const data = await api("/api/bootstrap");
  app.user = data.currentUser;
  if (!data.hasAdmin) {
    showGate("setup");
    return;
  }
  if (!app.user) {
    showGate("login");
    return;
  }
  showConsole();
  await loadAll();
}

async function uploadForm(path, fieldName, file) {
  const data = new FormData();
  data.append(fieldName, file);
  const response = await fetch(path, {
    method: "POST",
    body: data,
    credentials: "same-origin"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "请求失败");
  }
  return result;
}

function bind() {
  $("[data-setup-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/setup-admin", { method: "POST", body: payload(event.currentTarget) });
      location.reload();
    } catch (error) {
      $("[data-gate-message]").textContent = error.message;
    }
  });

  $("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/login", { method: "POST", body: payload(event.currentTarget) });
      await bootstrap();
    } catch (error) {
      $("[data-login-message]").textContent = error.message;
    }
  });

  $$("[data-view-button]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewButton));
  });

  document.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-content]");
    if (edit) {
      const item = app.content.find((candidate) => candidate.id === edit.dataset.editContent);
      fillContentForm(item);
      switchView("content");
    }

    if (event.target.matches("[data-new-content]")) {
      fillContentForm();
    }

    const statusButton = event.target.closest("[data-comment-status]");
    if (statusButton) {
      await api(`/api/admin/comments/${statusButton.dataset.commentStatus}`, {
        method: "PUT",
        body: { status: statusButton.dataset.status }
      });
      await loadAll();
    }

    const deleteComment = event.target.closest("[data-comment-delete]");
    if (deleteComment) {
      await api(`/api/admin/comments/${deleteComment.dataset.commentDelete}`, { method: "DELETE" });
      await loadAll();
    }

    const activateTheme = event.target.closest("[data-activate-theme]");
    if (activateTheme && !activateTheme.disabled) {
      await api("/api/admin/themes", {
        method: "PUT",
        body: {
          theme: activateTheme.dataset.activateTheme,
          scope: activateTheme.dataset.scope || "user"
        }
      });
      await loadAll();
    }

    if (event.target.matches("[data-refresh-upgrade]")) {
      app.upgrade = await api("/api/admin/upgrade");
      renderUpgrade();
    }
  });

  $("[data-content-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = payload(form);
    data.type = field(form, "type").value || "post";
    data.tags = String(data.tags || "").split(",").map((item) => item.trim()).filter(Boolean);
    data.categories = String(data.categories || "").split(",").map((item) => item.trim()).filter(Boolean);
    try {
      if (data.id) {
        await api(`/api/admin/content/${data.id}`, { method: "PUT", body: data });
      } else {
        await api("/api/admin/content", { method: "POST", body: data });
      }
      $("[data-content-message]").textContent = "已保存。";
      await loadAll();
    } catch (error) {
      $("[data-content-message]").textContent = error.message;
    }
  });

  $("[data-delete-content]").addEventListener("click", async () => {
    const id = field($("[data-content-form]"), "id").value;
    if (!id) return;
    await api(`/api/admin/content/${id}`, { method: "DELETE" });
    fillContentForm();
    await loadAll();
  });

  $("[data-profile-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/admin/profile", { method: "PUT", body: payload(event.currentTarget) });
      app.profile = result.user;
      app.user = result.user;
      $("[data-profile-message]").textContent = "资料已保存。";
    } catch (error) {
      $("[data-profile-message]").textContent = error.message;
    }
  });

  $("[data-user-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/users", { method: "POST", body: payload(event.currentTarget) });
      event.currentTarget.reset();
      $("[data-user-message]").textContent = "用户已创建。";
      await loadAll();
    } catch (error) {
      $("[data-user-message]").textContent = error.message;
    }
  });

  $("[data-settings-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = payload(event.currentTarget);
    data.themeConfig = {
      accent: data.accent,
      surface: data.surface
    };
    try {
      await api("/api/admin/settings", { method: "PUT", body: data });
      $("[data-settings-message]").textContent = "设置已保存。";
      await loadAll();
    } catch (error) {
      $("[data-settings-message]").textContent = error.message;
    }
  });

  $("[data-theme-import]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = field(form, "themePackage").files[0];
    if (!file) return;
    try {
      await uploadForm("/api/admin/themes/import", "themePackage", file);
      $("[data-theme-message]").textContent = "主题已导入。";
      form.reset();
      await loadAll();
    } catch (error) {
      $("[data-theme-message]").textContent = error.message;
    }
  });

  $("[data-upgrade-package-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = field(form, "upgradePackage").files[0];
    if (!file) {
      $("[data-upgrade-package-message]").textContent = "请选择升级包。";
      return;
    }

    try {
      const result = await uploadForm("/api/admin/upgrade/package", "upgradePackage", file);
      app.upgrade = result.info || app.upgrade;
      renderUpgrade();
      form.reset();
      $("[data-upgrade-package-message]").textContent = `已升级到 ${result.result?.nextVersion || app.upgrade?.version || "新版本"}，请重启服务。`;
    } catch (error) {
      $("[data-upgrade-package-message]").textContent = error.message;
    }
  });

  $("[data-upgrade-git-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api("/api/admin/upgrade/git", { method: "POST", body: payload(form) });
      app.upgrade = result.info || app.upgrade;
      renderUpgrade();
      $("[data-upgrade-git-message]").textContent = result.result?.dryRun
        ? "预演完成，尚未写入当前项目。"
        : `已升级到 ${result.result?.nextVersion || app.upgrade?.version || "新版本"}，请重启服务。`;
    } catch (error) {
      $("[data-upgrade-git-message]").textContent = error.message;
    }
  });

  $("[data-logout]").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    location.reload();
  });
}

bind();
bootstrap().catch((error) => {
  if (error.status === 401) {
    showGate("login");
    $("[data-login-message]").textContent = error.message;
    return;
  }
  showConsole();
  const recent = $("[data-recent-posts]");
  if (recent) {
    recent.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
});
