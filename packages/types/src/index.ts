export type FrontmatterDate = string | Date;

export interface SiteConfig {
  title: string;
  description?: string;
  author?: string;
  baseUrl?: string;
  url?: string;
  language?: string;
  postsDir?: string;
  pagesDir?: string;
  theme?: string;
  navigation?: NavigationItem[];
}

export interface NavigationItem {
  label: string;
  url: string;
}

export interface PostFrontmatter {
  title: string;
  date: string;
  slug?: string;
  description?: string;
  tags: string[];
  draft: boolean;
}

export interface PageFrontmatter {
  title: string;
  slug?: string;
  description?: string;
  draft?: boolean;
}

export interface ThemeManifest {
  name: string;
  version: string;
  slots: string[];
  pages: ThemePages;
  settings?: Record<string, ThemeSettingDefinition>;
  description?: string;
  author?: string;
}

export interface ThemePages {
  home: string;
  post: string;
  page: string;
  archive: string;
  tag?: string;
}

export type ThemeSettingDefinition =
  | {
      type: "color";
      default: string;
    }
  | {
      type: "select";
      options: string[];
      default: string;
    };

export interface ThemeConfig {
  theme: string;
  settings?: Record<string, string>;
}

export type ContentType = "home" | "post" | "page" | "archive" | "tag";

export interface ContentObject {
  title: string;
  content: string;
  date: string;
  tags: string;
  description: string;
  slug: string;
  type: ContentType;
  url: string;
  readingTime: string;
  previousPost: string;
  nextPost: string;
}

export type ThemeSettings = Record<string, string>;

export interface RenderListItem {
  title: string;
  slug: string;
  url: string;
  date: string;
  description: string;
  tags: string;
  excerpt?: string;
}

export interface RenderContext {
  site: TemplateSite;
  content: ContentObject;
  theme: ThemeSettings;
  ui: Record<string, string>;
  uiText: Record<string, string>;
  posts: RenderListItem[];
  pages: RenderListItem[];
  path: string;
}

export interface TemplateSite {
  title: string;
  description: string;
  author: string;
  baseUrl: string;
  url?: string;
  language: string;
  postsDir?: string;
  pagesDir?: string;
  theme?: string;
  navigation: string;
}

export interface PluginContext {
  rootDir: string;
  outDir: string;
  site: SiteConfig;
  posts: RenderListItem[];
  pages: RenderListItem[];
  path?: string;
  render?: RenderContext;
}

export interface Plugin {
  name: string;
  version?: string;
  hooks?: {
    onBuildStart?: (context?: PluginContext) => void | Promise<void>;
    onBuildEnd?: (context?: PluginContext) => void | Promise<void>;
    transformMarkdown?: (
      content: string,
      context?: PluginContext,
    ) => string | Promise<string>;
    injectHead?: (context?: PluginContext) => string | Promise<string>;
    injectBodyEnd?: (context?: PluginContext) => string | Promise<string>;
  };
}
