export type UiLocale = "en" | "zh-CN";

export type SiteLanguage = "auto" | "en" | "zh-CN" | string | undefined;

export type UiDictionary = Record<string, string>;

export const uiDictionaries: Record<UiLocale, UiDictionary> = {
  en: {
    archive: "Archive",
    activeTheme: "Active theme",
    adminAccountAlreadyExists: "Admin account already exists.",
    adminAccountNotInitialized: "Admin account has not been initialized.",
    adminLogin: "Admin login",
    adminTitle: "Static Blog Admin",
    authenticationRequired: "Authentication required.",
    backToHome: "Back to home",
    browseArchive: "Browse archive",
    build: "Build",
    buildComplete: "Built {posts} posts and {pages} pages.",
    buildPrompt: "Generate the static site into",
    building: "Building...",
    createAccount: "Create account",
    createPage: "Create page",
    createPost: "Create post",
    date: "Date",
    delete: "Delete",
    deletePageConfirm: "Delete this page? It will be moved to data/admin/trash.",
    deletePostConfirm: "Delete this post? It will be moved to data/admin/trash.",
    description: "Description",
    draft: "Draft",
    editPage: "Edit page",
    editPost: "Edit post",
    footerByPrefix: "",
    footerBySuffix: "",
    home: "Home",
    initializeAdmin: "Initialize admin account",
    invalidAuth: "Invalid username or password.",
    invalidSlug: "Invalid slug. Use lowercase letters, numbers, and hyphens only.",
    json: "JSON",
    login: "Login",
    logout: "Logout",
    markdown: "Markdown",
    new: "New",
    next: "Next",
    noConfigurableSettings: "No configurable settings.",
    noPagesYet: "No pages yet.",
    noPostsYet: "No posts yet.",
    noTagsYet: "No tags yet.",
    notFound: "Not found.",
    page: "Page",
    pages: "Pages",
    password: "Password",
    passwordMin: "Password must be at least 8 characters.",
    personalBlogPrefix: "Personal blog by ",
    personalBlogSuffix: "",
    pluginSaved: "Plugins saved.",
    plugins: "Plugins",
    post: "Post",
    postNavigation: "Post navigation",
    posts: "Posts",
    preview: "Preview",
    previous: "Previous",
    primaryNavigation: "Primary navigation",
    publishedOn: "Published on",
    readingTime: "Reading time",
    readingTimeValue: "{minutes} min read",
    requestFailed: "Request failed",
    save: "Save",
    savePlugins: "Save plugins",
    saveTheme: "Save theme",
    saved: "Saved.",
    search: "Search",
    siteConfig: "Site config",
    slug: "Slug",
    tag: "Tag",
    taggedPostsDescriptionPrefix: "Posts tagged ",
    tags: "Tags",
    theme: "Theme",
    themeSaved: "Theme saved.",
    title: "Title",
    triggerBuild: "Trigger build",
    unexpectedServerError: "Unexpected server error",
    username: "Username",
    viewAllPosts: "View all posts",
  },
  "zh-CN": {
    archive: "归档",
    activeTheme: "当前主题",
    adminAccountAlreadyExists: "管理员账号已经存在。",
    adminAccountNotInitialized: "管理员账号尚未初始化。",
    adminLogin: "管理员登录",
    adminTitle: "静态博客后台",
    authenticationRequired: "需要登录后才能继续。",
    backToHome: "返回首页",
    browseArchive: "浏览归档",
    build: "构建",
    buildComplete: "已构建 {posts} 篇文章和 {pages} 个页面。",
    buildPrompt: "生成静态站点到",
    building: "正在构建...",
    createAccount: "创建账号",
    createPage: "创建页面",
    createPost: "创建文章",
    date: "日期",
    delete: "删除",
    deletePageConfirm: "删除这个页面？它会被移动到 data/admin/trash。",
    deletePostConfirm: "删除这篇文章？它会被移动到 data/admin/trash。",
    description: "描述",
    draft: "草稿",
    editPage: "编辑页面",
    editPost: "编辑文章",
    footerByPrefix: "",
    footerBySuffix: "",
    home: "首页",
    initializeAdmin: "初始化管理员账号",
    invalidAuth: "用户名或密码不正确。",
    invalidSlug: "Slug 无效。请只使用小写字母、数字和连字符。",
    json: "JSON",
    login: "登录",
    logout: "退出",
    markdown: "Markdown",
    new: "新建",
    next: "下一篇",
    noConfigurableSettings: "没有可配置项。",
    noPagesYet: "暂无页面。",
    noPostsYet: "暂无文章。",
    noTagsYet: "暂无标签。",
    notFound: "未找到。",
    page: "页面",
    pages: "页面",
    password: "密码",
    passwordMin: "密码至少需要 8 个字符。",
    personalBlogPrefix: "",
    personalBlogSuffix: " 的个人博客",
    pluginSaved: "插件设置已保存。",
    plugins: "插件",
    post: "文章",
    postNavigation: "文章导航",
    posts: "文章",
    preview: "预览",
    previous: "上一篇",
    primaryNavigation: "主导航",
    publishedOn: "发布于",
    readingTime: "阅读时间",
    readingTimeValue: "约 {minutes} 分钟阅读",
    requestFailed: "请求失败",
    save: "保存",
    savePlugins: "保存插件",
    saveTheme: "保存主题",
    saved: "已保存。",
    search: "搜索",
    siteConfig: "站点配置",
    slug: "Slug",
    tag: "标签",
    taggedPostsDescriptionPrefix: "标签文章：",
    tags: "标签",
    theme: "主题",
    themeSaved: "主题已保存。",
    title: "标题",
    triggerBuild: "触发构建",
    unexpectedServerError: "服务器出现异常",
    username: "用户名",
    viewAllPosts: "查看全部文章",
  },
};

const publicUiKeys = [
  "archive",
  "backToHome",
  "browseArchive",
  "footerByPrefix",
  "footerBySuffix",
  "home",
  "next",
  "noPagesYet",
  "noPostsYet",
  "noTagsYet",
  "page",
  "pages",
  "personalBlogPrefix",
  "personalBlogSuffix",
  "post",
  "posts",
  "previous",
  "primaryNavigation",
  "publishedOn",
  "readingTime",
  "readingTimeValue",
  "search",
  "tag",
  "taggedPostsDescriptionPrefix",
  "tags",
  "viewAllPosts",
];

export function resolveUiLocale(language: SiteLanguage, acceptLanguage = ""): UiLocale {
  const configuredLanguage = (language ?? "en").trim();

  if (configuredLanguage === "auto") {
    return isChineseLanguage(acceptLanguage) ? "zh-CN" : "en";
  }

  return isChineseLanguage(configuredLanguage) ? "zh-CN" : "en";
}

export function isAutomaticLanguage(language: SiteLanguage): boolean {
  return (language ?? "en").trim() === "auto";
}

export function isChineseLanguage(language: string | undefined): boolean {
  return (language ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === "zh" || item.startsWith("zh-"));
}

export function getUiDictionary(locale: UiLocale): UiDictionary {
  return uiDictionaries[locale];
}

export function createStaticUiText(language: SiteLanguage): UiDictionary {
  const locale = resolveUiLocale(language);
  const dictionary = createPublicUiDictionary(locale);

  if (!isAutomaticLanguage(language)) {
    return { ...dictionary, script: "", locale };
  }

  const wrapped = Object.fromEntries(
    Object.entries(dictionary).map(([key, value]) => [key, wrapAutoLabel(key, value)]),
  );

  return {
    ...wrapped,
    script: createAutoLanguageScript(),
    locale: "auto",
  };
}

export function formatReadingTime(minutes: number, language: SiteLanguage): string {
  const safeMinutes = String(Math.max(1, minutes));
  const dictionary = getUiDictionary(resolveUiLocale(language));

  if (!isAutomaticLanguage(language)) {
    return dictionary.readingTimeValue.replace("{minutes}", safeMinutes);
  }

  return `<span data-i18n-reading-time data-minutes="${escapeHtml(safeMinutes)}">${escapeHtml(
    dictionary.readingTimeValue.replace("{minutes}", safeMinutes),
  )}</span>`;
}

function wrapAutoLabel(key: string, fallback: string): string {
  return `<span data-i18n="${escapeHtml(key)}">${escapeHtml(fallback)}</span>`;
}

function createAutoLanguageScript(): string {
  const dictionaryJson = JSON.stringify({
    en: createPublicUiDictionary("en"),
    "zh-CN": createPublicUiDictionary("zh-CN"),
  }).replaceAll("</", "<\\/");

  return `<script>
(() => {
  const dictionaries = ${dictionaryJson};
  const pickLocale = () => {
    const languages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    return languages.some((language) => String(language).toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
  };
  const formatReadingTime = (locale, minutes) => dictionaries[locale].readingTimeValue.replace("{minutes}", String(minutes || 1));
  const applyLocale = () => {
    const locale = pickLocale();
    const dictionary = dictionaries[locale] || dictionaries.en;
    document.documentElement.lang = locale;
    document.documentElement.dataset.uiLocale = locale;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n");
      if (key && dictionary[key]) element.textContent = dictionary[key];
    });
    document.querySelectorAll("[data-i18n-reading-time]").forEach((element) => {
      element.textContent = formatReadingTime(locale, element.getAttribute("data-minutes"));
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLocale, { once: true });
  } else {
    applyLocale();
  }
})();
</script>`;
}

function createPublicUiDictionary(locale: UiLocale): UiDictionary {
  const dictionary = getUiDictionary(locale);

  return Object.fromEntries(publicUiKeys.map((key) => [key, dictionary[key] ?? ""]));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
