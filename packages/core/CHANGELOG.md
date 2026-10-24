# wuppy

## 0.2.3

### Patch Changes

- Updated dependencies
  - @wuppycms/admin@0.2.3
  - @wuppycms/visual-editor@0.2.3
  - @wuppycms/auth@0.2.3
  - @wuppycms/git@0.2.3
  - @wuppycms/plugin-types@0.2.3

## 0.2.2

### Patch Changes

- Every package has a README, description, keywords and links on npm.
- Updated dependencies
  - @wuppycms/admin@0.2.2
  - @wuppycms/auth@0.2.2
  - @wuppycms/git@0.2.2
  - @wuppycms/plugin-types@0.2.2
  - @wuppycms/visual-editor@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies
  - @wuppycms/auth@0.2.1
  - @wuppycms/admin@0.2.1
  - @wuppycms/git@0.2.1
  - @wuppycms/plugin-types@0.2.1
  - @wuppycms/visual-editor@0.2.1

## 0.2.0

### Minor Changes

- Packages are published as WuppyCMS: `wuppycms` (import `wuppycms/astro`, integration `wuppycms()`, CLI `wuppycms`), `npm create wuppycms`, the `@wuppycms/*` scope and the `wuppycms-plugin` CLI. The create-wuppy template now ships only the starter files tracked in Git.

### Patch Changes

- Updated dependencies
  - @wuppycms/admin@0.2.0
  - @wuppycms/auth@0.2.0
  - @wuppycms/git@0.2.0
  - @wuppycms/plugin-types@0.2.0
  - @wuppycms/visual-editor@0.2.0

## 0.1.0

### Minor Changes

- 3c848cd: Add the agency assistant for managed sites: an MCP server at `/api/mcp`, an Assistant page with ready-made agents (site care, client reporter, content editor) on any OpenAI-compatible provider, an agency playbook and per-site client briefs, and emailing site members.
- 3c848cd: Site care and assistant phase 2: hourly health and security checks with email alerts, a security scan, client reports (printable as PDF, emailed monthly to a site member), bulk plugin updates across sites, a streaming assistant with saved chats and a list of changes to review, and an OpenAI-compatible API at `/api/v1`.
- 03c9cbf: A GitHub theme is design only; content stays in the site. Posts, pages, media, menus and settings are read and written in the site's folder also while a theme runs, so switching or updating a theme keeps them and edits are committed to the site's Git. The theme's collections are linked to the site's: `kind: "posts" | "pages"` (its `blog`, `about`) reads the site's Posts/Pages, `map` renames fields (`{ pubDate: "date" }`), and its `route` sets the public URLs; fields only the theme uses are added to the site's collection. Installing a theme copies its `.md` and `.mdx` sample entries into the site once, never over existing ones. `wuppy init` writes `kind` and `map` for common field names. The admin keeps fixed Posts and Pages sections. The visual editor's Code view shows the site's files under `site` and, for admins, the active theme's code under `theme: owner/repo` (editable, with Rebuild); the theme's sample-content folders are not listed since content lives in the site. A GitHub token that GitHub rejects (401) is dropped and the Themes page asks to connect again.
- 3c848cd: Themes from GitHub: Admin → Themes lists the Astro sites in your GitHub account (Connect GitHub opens GitHub's consent page for all repositories, `repo` scope; the server needs `WUPPY_GITHUB_CLIENT_SECRET`; tokens are sealed per user) and installs the one you pick as this site's design. The server clones it under `.wuppy/themes/`, wraps it, installs and builds it with the Node adapter, then switches to it and restarts; accounts are shared and a failed build leaves the current site running. The starter starts with `node serve.mjs`, which runs the active theme (the Docker image uses it). Linked OAuth tokens are now stored encrypted.
- 3c848cd: Content is MDX or Markdown. A collection's `format` (`"mdx"` by default for new content types, `"md"` for Markdown-only) controls new entries; existing `.md` and `.mdx` files can live side by side, and a `.md` entry is promoted to `.mdx` when a component is inserted. MDX bodies are checked with Astro's own parser and saving is refused (422 `DISALLOWED_CONTENT`) for imports, expressions, dangerous tags, event handlers, `javascript:`/`data:` links and components not in `components` or the theme. The active theme's `.astro` components are allowed automatically and the integration provides a components map to `<Content />`, so Add → Components inserts real Astro components without import lines. Section and widget bodies render with `mdxContent` from `wuppy/mdx` (`{ Content, headings }`). New `wuppy mdx-to-md [dir]` can still convert component-free `.mdx` files to `.md`; `wuppy init` adds `@astrojs/mdx`, widens content globs and builds the component allowlist. The starter's `pnpm dev` runs the active GitHub theme, and the visual editor's Code view shows files at their real paths (one tree when the site runs from a theme). Dependencies: hono 4.13.13 (security fixes).
- 3c848cd: Plugin before-hooks, security first: `beforeContentSave` (refuse, or change with `content.write`), `beforeContentDelete`, `beforeMediaUpload` and `beforeCommentCreate` (refuse, hold or mark spam, never approve), plus the `onCommentCreated` after-hook. Before-hooks run one plugin at a time in config order, fail closed (422 `REJECTED_BY_PLUGIN` with the plugin's plain-text reason, 502 `PLUGIN_ERROR` when a plugin fails), are part of the approved capability hash, only see collections the plugin may read, cannot publish or unpublish, cannot save from inside, and whatever they return passes the MDX rules again. Comment hooks never see the email or IP address. Restoring from the trash now runs the save checks.
- 3c848cd: Visual editor: **Edit with Visual** opens an entry on a live MDX canvas with Add, Layers, Framework, Selectors and Properties panels. Add containers, columns, headings, text, buttons, links, images, video, lists, dividers, components and Markdown blocks; drag to move, double-click to edit in place, hide/lock, style with responsive/state overrides, switch breakpoints and design/live modes, undo/redo, copy/paste, import HTML, componentize, save layouts and components. Blocks serialize to one-line `data-ve` HTML in the MDX or Markdown body, while hand-written Markdown stays untouched; saving uses the normal content API, lock, ETag and Git history. Site-wide framework/selectors/components live in `.wuppy/data/visual.json` and are served through `/api/public/visual.css`.
- 3c848cd: Wrap an existing Astro project with Wuppy. `wuppy init` reads the project's Markdown/MDX content collections, guesses their fields from the frontmatter, finds their routes, writes `wuppy.config.mjs` and adds the integration (and a Node adapter when missing). `wuppy import <git-url> <dir>` clones a repository and runs `init`; `wuppy import` with no URL lists your Astro repositories on GitHub (through the GitHub CLI, private ones included) to pick from. Edits publish instantly: pages that read Wuppy collections through `astro:content` read the files on disk and render on request, so a save shows on the next page load with no rebuild and no push (`wuppy({ live: false })` turns it off). `wuppy({ sitemap, robots, rss })` turns off routes the site already serves. The page cache skips prerendered pages. Frontmatter is no longer folded at 80 characters, so an edit changes only its own line. The auth package loads the `reflect-metadata` polyfill first, which some bundlers put after the passkey code.

### Patch Changes

- 03c9cbf: Visual editor: on a local site the canvas loads the entry's live page and edits the body in place, inside the theme's own layout, styles and scripts, so any Astro theme that renders the entry with `<Content />` looks the same in the editor as live (dark mode included). The integration marks the rendered body with `<!--wuppy:body-->` comments. Without a marked body the canvas falls back to a blank frame that copies the site's stylesheet, `<html>`/`<body>` attributes and inline head scripts.
- 03c9cbf: Visual editor: theme Astro components show their real output on the canvas (`/_wuppy/component/<Name>`, generated by the integration, rendered without props). A `.md` entry that is not valid MDX yet and gets a component now reports the MDX error instead of "Disallowed content: <Component>". A component that throws without the props it needs (e.g. a table of contents without `headings`) no longer breaks the page: it renders as an HTML comment, the error is logged and the canvas says it needs props.
- `wuppy init` (and theme install) names a collection by its key in `export const collections` instead of its variable (`post: postCollection` → `post`), and skips names Wuppy cannot use instead of writing a config that fails the build.
- 03c9cbf: Visual editor: Markdown blocks show on the canvas as the site renders them (new `POST /api/editor/markdown`, same checks as a save) instead of raw source.
- 45f1683: Visual editor Properties: the right-hand inspector now has a layout with **Styles / Attributes** tabs, a selector picker and Componentize button, icon section cards, a right-edge style-category icon rail with click-to-scroll and set-value dots, a pinned style search, and dedicated Text/Tag controls. Layout, Position, Size, Spacing, Typography, Background and Border use icon controls for page blocks and theme elements: a Flex/Grid type switch, direction/distribute/align/wrap/gap, a T/R/B/L offset box, four-side padding/margin pickers, a four-corner radius picker, icon-labelled size fields, Align/Decor/Capitalize rows and Background Size/Position/Tile/Fixed rows. Enum properties use inline icon/text rows instead of dropdowns. Linked sides save as one undo step for blocks and one `.astro` write for themes; radius corners edit the existing shorthand. The same inspector now applies when a theme element is selected, including class pills, section actions, theme-specific breakpoint/state context and the style rail/search. Text blocks can switch between paragraph/span/div/label tags. The editor toolbar no longer overlaps the Properties panel at narrower widths, and the starter no longer ships duplicate `about.md`/`about.mdx` entries.
- Installing a GitHub theme on Astro older than 7.4 moves it to `^7.4.0`, so its elements show in Layers and can be selected in the visual editor (older Astro does not mark elements with their source spot). If npm still installs an older Astro the install fails with a message, and a theme that turns the dev toolbar off gets it back while it runs for a site. Rebuild an already installed theme once.
- 03c9cbf: GitHub themes: a theme's static `.astro` pages (`index.astro`, `tags/index.astro`, `404.astro`) are listed in the site's Pages as **Theme page** entries that name their file (`template`). Blocks and theme components added to the entry's body render at the end of the page's `<main>` (edited in place in the visual editor), "Open in Code view" opens its `.astro` file, and the entry's SEO title, description and noindex are applied to the page the theme serves. Preview links and "View on site" use the page's own URL.
  
  Theme pages are imported with the theme's required text fields (such as `description`) set empty, so they save. A failed validation now names the fields (`Invalid input: description`).
- 03c9cbf: Visual editor: the theme's own `.astro` markup on a live page can be edited. Click an element outside the blocks to edit its text, classes and inline style, move, duplicate or delete it, or open its file in Code view; changes are written to the theme file (`POST /api/themes/element`) and the page reloads. Works on the dev server, where Astro marks each element with its source. Theme files now reload on edit even though the theme runs inside the site's `.wuppy/` folder.
- 03c9cbf: Visual editor: a theme element's Properties now has the whole inspector: text, tag, every style group (Layout, Position, Size, Spacing, Typography, Background, Border, Effects, Interaction) and HTML attributes. Styles are saved as Tailwind 4 classes when the theme uses Tailwind (`self-center`, `w-[320px]`, `max-[768px]:hover:text-[#fff]`), as inline style otherwise. Block styles use the same full list of properties.
- 9fbb314: GitHub themes: an install is reported as done only after the theme is activated and the server restart has been requested. Previously the job showed "Done" while the running site could still be serving the old theme, and a test could miss the restart.
- 03c9cbf: GitHub themes: a theme's static Markdown pages (`src/pages/about.md`) are copied into the site's Pages when the theme is activated and edited there like any page. The theme keeps serving them at the same URL with its own `layout`, reading the site's entry on each request (with `<!--wuppy:body-->` markers for the visual editor); without a site entry the theme's own text is shown.
- Switching themes in the admin now restarts `pnpm dev` in the new theme (the starter's `dev.mjs` starts astro again when the server exits with `WUPPY_RESTART_CODE`). A content entry the active theme cannot render (a component it lacks, a package import) is shown without its body instead of failing every page that lists it.
- Visual editor: an AI panel below Selectors. Pick elements with Select (Ctrl+Alt+A; picking one again drops it), describe the change, and the AI's edits (text, styles, classes, and for theme elements attributes and tag) are applied like manual ones: blocks in one undo step, theme elements to the theme file. New `POST /api/ai/edit` (content write permission) uses the server's `WUPPY_AI_*` provider. AI text edits also replace text a theme fills in by code; chats are kept in the browser with a history list. Each answer has Undo, which restores the blocks and theme files it changed.
- Visual editor: on theme pages Layers shows the theme's own elements around the page's blocks, and a module inserted while a theme element is picked is written into the theme file right after it. Layers search covers theme elements, theme rows can be dragged within their file and have a right-click menu, and colour fields use a picker that stays in the window. Theme text, classes, styles and attributes show on the canvas as they are typed and are written after a short pause without reloading the page (`live` flag on `POST /api/themes/element`). New `insert` and `moveTo` actions for `POST /api/themes/element`.
- Updated dependencies [3c848cd]
- Updated dependencies [3c848cd]
- Updated dependencies [03c9cbf]
- Updated dependencies [03c9cbf]
- Updated dependencies [03c9cbf]
- Updated dependencies [03c9cbf]
- Updated dependencies [3c848cd]
- Updated dependencies [03c9cbf]
- Updated dependencies [3c848cd]
- Updated dependencies [3c848cd]
- Updated dependencies [45f1683]
- Updated dependencies [03c9cbf]
- Updated dependencies [03c9cbf]
- Updated dependencies [03c9cbf]
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies [3c848cd]
- Updated dependencies [3c848cd]
  - @wuppycms/admin@0.1.0
  - @wuppycms/auth@0.1.0
  - @wuppycms/plugin-types@0.1.0
  - @wuppycms/visual-editor@0.1.0
  - @wuppycms/git@0.1.0
