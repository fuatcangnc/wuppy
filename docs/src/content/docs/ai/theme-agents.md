---
title: Coding agents on a theme
description: Let Claude Code, Cursor or opencode adapt an Astro theme to WuppyCMS.
sidebar:
  order: 4
---

An Astro theme shows what editors set in the admin only where its code reads it: a theme with hard-coded links ignores **Menus** until its header reads them. An AI coding agent can make that change for you if it knows how Wuppy stores its data. Wuppy gives it that guide in two forms:

- **`AGENTS.md`**: `wuppycms init` and `wuppycms import` write it into the project, unless the project already has one. Claude Code, Cursor, opencode and Codex read it by themselves.
- **The `wuppy-theme` skill**: the same guide as an agent skill, at [`skills/wuppy-theme/SKILL.md`](https://github.com/fuatcangnc/wuppy/blob/main/skills/wuppy-theme/SKILL.md). Add it with `npx skills add fuatcangnc/wuppy`, or copy the folder to `.claude/skills/` in the theme.

A theme installed from GitHub under **Themes** gets neither on the server; add one of them to the theme's own repository.

The guide covers:

- keeping the theme buildable on its own, with its current links and texts as fallbacks;
- reading menus by location (header, footer), site settings, sections and widgets;
- keeping class values literal so the visual editor can edit them;
- leaving `wuppy.config.mjs` and `.wuppy/` alone.

## Prompts

**AI › Theme prompts** in the admin lists these prompts with a **Copy** button. It copies the prompt together with the guide, so it also works in a project without `AGENTS.md` or in a chat such as ChatGPT; **Copy guide** copies the guide alone, to save as `AGENTS.md`.

### Adapt the whole theme

```text
Adapt this Astro theme to WuppyCMS following the WuppyCMS theme guide (AGENTS.md): read the header and footer menus, the site settings (name, logo, meta tags) and the content collections from Wuppy, keep every current value as a fallback, and check that `npm run build` passes without a `.wuppy` folder.
```

### Connect the menus

```text
Following the WuppyCMS theme guide (AGENTS.md), make the header and footer use the WuppyCMS menus for the `header` and `footer` locations, with the current links as fallback. Show a link's description in dropdowns when it is set, and keep the existing markup and classes.
```

### Use the site settings

```text
Following the WuppyCMS theme guide (AGENTS.md), use the WuppyCMS site settings for the site name, logo and default title, description and social image, with the theme's current values as fallback.
```

### Add a widget area

```text
Following the WuppyCMS theme guide (AGENTS.md), render the WuppyCMS widget area named "sidebar" (created under Admin › Widgets) in the blog sidebar with `getWidgetArea` from "wuppycms", and show nothing when it has no widgets.
```

Push the change and press **Rebuild** under Themes. After that, saving a menu, the settings, sections or widgets builds the theme again by itself.
