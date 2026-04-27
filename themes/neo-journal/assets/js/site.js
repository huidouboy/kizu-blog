const state = {
  hasAdmin: true,
  user: null,
  site: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const field = (form, name) => form.elements.namedItem(name);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function initials(name = "我") {
  return [...String(name).trim()][0] || "我";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAuthMessage(message, tone = "") {
  const node = $("[data-auth-message]");
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function setCommentStatus(message, tone = "") {
  const node = $("[data-comment-status]");
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function showMode(mode) {
  $$("[data-auth-form]").forEach((form) => {
    form.hidden = form.dataset.authForm !== mode;
  });
  const profile = $("[data-auth-profile]");
  if (profile) profile.hidden = mode !== "profile";

  const title = $("#auth-title");
  const kicker = $("[data-auth-kicker]");
  const copy = $("[data-auth-copy]");
  const text = {
    setup: ["Kizu Setup", "欢迎来到 Kizu Blog", "先创建你的账号，随后就能开始写作。"],
    login: ["Kizu ID", "欢迎回来", "登录后继续评论和管理你的内容。"],
    register: ["Kizu ID", "加入这里", "选一个名字，和这个博客保持联系。"],
    profile: ["Kizu ID", "已登录", "欢迎回来，继续慢慢看。"]
  }[mode];

  if (text) {
    kicker.textContent = text[0];
    title.textContent = text[1];
    copy.textContent = text[2];
  }
  setAuthMessage("");
}

function openAuth(mode) {
  const overlay = $("[data-auth-overlay]");
  if (!overlay) return;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  if (!state.hasAdmin) {
    showMode("setup");
  } else if (state.user) {
    renderProfile();
    showMode("profile");
  } else {
    showMode(mode || "login");
  }
}

function closeAuth() {
  const overlay = $("[data-auth-overlay]");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  setTimeout(() => {
    overlay.hidden = true;
  }, 180);
}

function renderAccount() {
  const initial = $("[data-account-initial]");
  const button = $(".account-button");
  if (!button || !initial) return;
  const label = state.user ? state.user.displayName : "账号";
  initial.textContent = initials(label);
  button.title = label;
  button.style.setProperty("--avatar-color", state.user?.avatarColor || "var(--accent)");
}

function renderProfile() {
  if (!state.user) return;
  const badge = $("[data-profile-initial]");
  const name = $("[data-profile-name]");
  const role = $("[data-profile-role]");
  const adminLink = $("[data-admin-link]");
  if (badge) {
    badge.textContent = initials(state.user.displayName);
    badge.style.background = state.user.avatarColor || "var(--accent)";
  }
  if (name) name.textContent = state.user.displayName;
  if (role) role.textContent = state.user.role === "admin" ? "管理员" : "成员";
  if (adminLink) adminLink.hidden = state.user.role !== "admin";
}

function renderCommentControls() {
  const panel = $("[data-comments]");
  if (!panel) return;
  const form = $("[data-comment-form]", panel);
  const loginButton = $("[data-comment-login]", panel);
  if (form) form.hidden = !state.user;
  if (loginButton) loginButton.hidden = Boolean(state.user);
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function loadComments() {
  const panel = $("[data-comments]");
  if (!panel?.dataset.postId) return;
  const list = $("[data-comment-list]", panel);
  renderCommentControls();

  const data = await api(`/api/comments?postId=${encodeURIComponent(panel.dataset.postId)}`);
  if (!list) return;
  list.innerHTML = data.comments.length
    ? data.comments.map((comment) => `
      <article class="comment-item">
        <div class="comment-avatar" style="background:${comment.author.avatarColor}">${initials(comment.author.displayName)}</div>
        <div>
          <strong>${escapeHtml(comment.author.displayName)}</strong>
          <p>${escapeHtml(comment.body)}</p>
        </div>
      </article>
    `).join("")
    : "<p class=\"comment-empty\">还没有评论。</p>";
}

async function refreshBootstrap({ openSetup = true } = {}) {
  const data = await api("/api/bootstrap", { method: "GET" });
  state.hasAdmin = data.hasAdmin;
  state.user = data.currentUser;
  state.site = data.site;
  renderAccount();
  renderCommentControls();
  if (!state.hasAdmin && openSetup) openAuth("setup");
  await loadComments();
}

function bindAuth() {
  $(".account-button")?.addEventListener("click", () => openAuth());
  $$("[data-comment-login]").forEach((button) => {
    button.addEventListener("click", () => openAuth("login"));
  });
  $("[data-auth-close]")?.addEventListener("click", closeAuth);
  $("[data-auth-overlay]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-auth-overlay]")) closeAuth();
  });
  $$("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => showMode(button.dataset.authMode));
  });

  $("[data-auth-form='setup']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/setup-admin", { method: "POST", body: formPayload(event.currentTarget) });
      window.location.href = "/admin/";
    } catch (error) {
      setAuthMessage(error.message, "error");
    }
  });

  $("[data-auth-form='login']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/login", { method: "POST", body: formPayload(event.currentTarget) });
      await refreshBootstrap({ openSetup: false });
      closeAuth();
      setCommentStatus("已登录，可以发表评论。", "success");
    } catch (error) {
      setAuthMessage(error.message, "error");
    }
  });

  $("[data-auth-form='register']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/register", { method: "POST", body: formPayload(event.currentTarget) });
      await refreshBootstrap({ openSetup: false });
      closeAuth();
      setCommentStatus("账号已创建，可以发表评论。", "success");
    } catch (error) {
      setAuthMessage(error.message, "error");
    }
  });

  $("[data-auth-logout]")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    renderAccount();
    renderCommentControls();
    closeAuth();
    await loadComments();
  });
}

function bindComments() {
  $("[data-comment-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const panel = $("[data-comments]");
    if (!state.user) {
      openAuth("login");
      return;
    }
    if (!form || !panel?.dataset.postId) return;

    const textarea = field(form, "body");
    const body = textarea?.value.trim() || "";
    if (!body) {
      setCommentStatus("先写一点内容吧。", "error");
      return;
    }

    try {
      const data = await api("/api/comments", {
        method: "POST",
        body: {
          postId: panel.dataset.postId,
          body
        }
      });
      form.reset();
      await loadComments();
      setCommentStatus(data.pending ? "评论已提交，等待审核。" : "评论已发布。", "success");
    } catch (error) {
      setCommentStatus(error.message, "error");
      if (error.message.includes("登录")) openAuth("login");
    }
  });
}

bindAuth();
bindComments();
refreshBootstrap().catch(() => {});
