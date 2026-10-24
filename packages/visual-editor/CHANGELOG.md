# @wuppycms/visual-editor

## 0.2.3

### Patch Changes

- READMEs, docs and code comments no longer name the upstream editor; the required MIT notice now ships in `THIRD-PARTY-NOTICES.md`.

## 0.2.2

### Patch Changes

- Every package has a README, description, keywords and links on npm.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- Packages are published as WuppyCMS: `wuppycms` (import `wuppycms/astro`, integration `wuppycms()`, CLI `wuppycms`), `npm create wuppycms`, the `@wuppycms/*` scope and the `wuppycms-plugin` CLI. The create-wuppy template now ships only the starter files tracked in Git.

## 0.1.0

### Minor Changes

- 3c848cd: Visual editor: **Edit with Visual** opens an entry on a live MDX canvas with Add, Layers, Framework, Selectors and Properties panels. Add containers, columns, headings, text, buttons, links, images, video, lists, dividers, components and Markdown blocks; drag to move, double-click to edit in place, hide/lock, style with responsive/state overrides, switch breakpoints and design/live modes, undo/redo, copy/paste, import HTML, componentize, save layouts and components. Blocks serialize to one-line `data-ve` HTML in the MDX or Markdown body, while hand-written Markdown stays untouched; saving uses the normal content API, lock, ETag and Git history. Site-wide framework/selectors/components live in `.wuppy/data/visual.json` and are served through `/api/public/visual.css`.
