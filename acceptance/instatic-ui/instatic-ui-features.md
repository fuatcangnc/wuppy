# Instatic UI analysis

Source: local Instatic at `http://localhost:5173` and `/home/fuat/Downloads/Instatic-main`.
Screenshots: `acceptance/instatic-ui/screenshots/`.

## Routes and links

- `/admin/site` — Site workspace (visual editor).
- `/admin/ai` — AI workspace.
- Top navigation links: `/admin/dashboard`, `/admin/site`, `/admin/content`, `/admin/data`, `/admin/media`, `/admin/plugins`, `/admin/ai`, `/admin/users`.
- Top-right: Open settings, open live site, account menu, Publish + more publishing actions, Branches.
- Floating toolbar: undo/redo, add container, add text, add image, white grid Add; search and live-preview toggles.
- Toolbar **Code** switch opens the full-width code workspace: file search/new-page actions, file tree, breakpoint
  preview toolbar with zoom, code tabs/path/status, line-numbered syntax editor, and a bottom Styles/Computed inspector.
- Site Explorer tabs: **Layers**, **Site**, **Code**, **Media**.
- Site panel sections: Pages, Templates, Components.
- Code panel sections: Styles, Scripts.
- AI sections: **Providers**, **Defaults**, **MCP connections**, **Audit**.
- MCP OAuth authorization route: `/admin/ai/oauth/authorize` (not used by the editor canvas).

## Site workspace (`/admin/site`)

### Chrome

- One 32px global bar with site identity, workspace links, Branches, Publish split button, settings and account.
- Left rail with Explorer/Framework/Selectors/Dependencies (and AI at the bottom).
- Full-height Explorer panel (tabbed) and Properties panel; center canvas with its own floating controls.
- Dark surfaces: global bar `#111113`, panels `#111113`/`#19191b`, canvas `#2b2b2e`, border `#2a2a2d`, selected ring green, hover ring pink, active frame outline blue.

### Explorers

- **Layers:** search box, insert-module button, compact 28px tree rows with coloured HTML-tag pills, module icons,
  expand/collapse chevrons, selection/hover/locked/hidden states, drag/reorder and double-click rename. Drag shows a
  floating row, a `#5eead4` before/after line, an inside highlight for containers (almost the whole container row
  inserts inside), and auto-expands collapsed targets.
- **Layer context menu:** dark 16px-radius menu with icon rows and separators: Hide, Rename, Duplicate,
  Componentize/Edit/Detach, Save as layout, Copy/Cut/Paste, Wrap in container, Select parent, Insert module here
  (searchable submenu), Lock and danger Delete; Escape/outside-click close.
- **Site:** Pages, Templates and Components sections with right-aligned counts, compact section actions, file
  icons, page title + slug rows and “None yet” empty panels.
- **Code:** Styles and Scripts sections with add buttons.
- **Media:** search field, All/Images/Videos filter pills, list/grid switch, per-section counts and upload actions,
  image/video previews, metadata rows/tiles and “None yet” empty panels.

### Canvas

- Design mode: all active breakpoints side by side (e.g. Tablet 768, Desktop 1440), zoom 50%, pan, blue frame outlines, green selected frame/ring.
- Click a breakpoint to activate; click elements to select; hover highlight; Alt inspect ladder; context menu.
- Inline text editing on double-click; selection toolbar with drag, insert, duplicate, delete; breakpoint-specific add controls.
- Live mode: one real-size editable frame; breakpoint selector “Desktop”.
- Floating zoom controls (zoom out / percentage / zoom in), add button, design/live toggle.
- Breakpoint/condition context selector.
- Drag-and-drop insert and reorder; drop zones before/after/inside.

### Properties

- Header `Body`/selected layer with **Styles** and **Attributes** tabs.
- Selector picker: “Add or create selector…”, class pills, Add class, Style inline.
- Property rows: Display, Flex direction, Flex wrap, Align items, Justify content, and more groups; responsive/state context.
- Componentize/component editing when a layer is selected.

### Other Site tools

- Settings modal: General, Shortcuts, Publishing, Preferences.
- Publish split actions, live site link, branches.
- Explorer search and add module; Instatic-style **Add to canvas** inserter: left Modules/Layouts/Components/Recent rail, item preview, search-every-module, list/grid toggle, wireframes, favorites, recents, saved layouts, components and HTML import.
- Undo/redo, clipboard, saved layouts, visual components, slots, detach, component update across pages.
- Site stylesheet and MDX/code editor, media library, Spotlight command palette.

## AI workspace (`/admin/ai`)

### Layout

- Same global admin bar.
- Left AI panel: title + “Models, defaults, connections, and usage.” and section navigation with icons.
- Middle list panel (providers/models/connections/audit) and right detail panel.

### Providers

- Provider cards: Anthropic (Claude models), OpenAI (GPT models), OpenRouter (multi-provider), Ollama (local models), Custom endpoint (OpenAI-compatible API).
- Add provider label and arrow.
- Detail: provider mark, “ADD PROVIDER”, “Connect <provider>”, description.
- Connection details: Display label, API key or Base URL, validation/encryption note, Connect button.
- Provider marks use colored square badges.

### Defaults

- Model routing list: Site editor, Content, Data, Plugins with descriptions and “Not configured”.
- Detail: route icon, “MODEL ROUTING”, title/description, Default model.
- Empty provider state card: “Connect a provider first” + “Go to Providers”.

### MCP connections

- List: Remote OAuth (Hosted clients), Personal token (Local and CLI clients).
- Detail: Hosted OAuth, “Connect a remote client”, Remote MCP URL, connector endpoint with Copy URL.
- “Available on this device only” warning; public HTTPS requirement.
- “Connect from the client” numbered instructions; OAuth client id/secret auto-discovery.

### Audit

- Usage/activity table for AI requests, tokens, provider/model, status/date.
- Empty state when no usage.

## Wuppy adaptation

- Implemented a reusable `StudioBar` for `/site` and `/ai` with Wuppy workspace links and account/settings.
- `/site` opens the Page visual editor (`/v/pages/<home>`), with Explorer/Layers/Site/Code/Media, Framework, Selectors, Canvas and Properties.
- `/ai` implements the Instatic three-column UI (Providers/Defaults/MCP/Audit) as a UI workspace; provider connection actions are local UI previews until an AI backend is added.
- Added Wuppy sidebar links for **Site** and **AI**.
- Visual editor surfaces use Instatic-like dark tokens, 50% initial zoom, ascending breakpoint frames, green selection and floating center toolbar.
- Layers now use Instatic's 28px compact rows, coloured HTML-tag pills, module icons, expand/collapse chevrons and
  hover/selected/locked/hidden states; dragging shows the floating row, cyan drop lines and container inside
  highlight, and drops into div/container rows work. The right-click menu uses the same 16px dark panel, icon rows
  and separators, with a working **Insert module here** submenu adapted to Wuppy presets.
- The **Site** tab uses Instatic's Pages/Templates/Components panels: counts, per-section actions, document-row
  icons, page slugs, hover actions inside the rounded row block and matching “None yet” empty states. Wuppy's saved
  layouts appear under Templates.
- The **Media** tab uses Instatic's search, All/Images/Videos pills, list/grid switch, per-section upload icons,
  image/video thumbnails, metadata and empty states.
- The toolbar **Code** button opens an Instatic-style workspace: `Find a file...` tree (`src/pages`, `src/styles`,
  `src/components`, `.wuppy/data`), breakpoint/zoom preview toolbar, page/CSS source editor with line numbers,
  syntax colours, tabs, Saved/Unsaved status and Ctrl/Cmd+S save, plus the selected element's Styles/Computed panel.
  Saving uses the existing Git-backed content and visual-data APIs.
- **Tailwind in code:** single-line authored HTML (e.g. `<p class="text-red-500">…</p>`) is parsed into visual nodes
  and saved with Wuppy's `data-ve` marker. The starter/boilerplate themes include `@source` for `content/` and
  `.wuppy/data`, and the canvas refetches Vite's transformed CSS after a page save, so valid Tailwind utilities show
  up without restarting the dev server. Tailwind compiles on save; a browser-only unsaved class cannot be generated.
  `text-red-10` is not a valid default utility — use a real shade such as `text-red-500`.
- **Theme source in code:** when a GitHub theme is active, admins also get `theme: owner/repo` in the workspace tree,
  including the theme's `.astro` pages/components/layouts, `.ts`/`.js`, CSS, MDX and config files. `node_modules`,
  build output, `.git`, `.env` and lockfiles are excluded. Theme files are editable; saving writes the active theme
  checkout, and the code footer offers **Rebuild** (`POST /api/themes/rebuild`) for Astro changes to apply to the
  running site.
- Screenshots of Wuppy equivalents: `wuppy-visual-final.png`, `wuppy-site-final.png`, `wuppy-inserter-final.png`,
  `wuppy-inserter-grid-final.png`, `wuppy-layers-full.png`, `wuppy-layer-menu.png`,
  `wuppy-layer-menu-insert.png`, `wuppy-drag-indicator.png`, `wuppy-drag-line-after.png`, `wuppy-drag-real.png`,
  `wuppy-drag-inside-easy.png`, `wuppy-site-panel.png`, `wuppy-media-panel.png`, `wuppy-media-grid.png`,
  `wuppy-design-toolbar-code-button.png`, `wuppy-code-view.png`, `wuppy-code-view-saved.png`,
  `wuppy-code-tailwind.png`, `wuppy-code-theme-files.png`, `wuppy-ai-final2.png`, `wuppy-ai-defaults.png`,
  `wuppy-ai-mcp.png`.
