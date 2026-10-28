---
title: Theme elements
description: Select and edit a GitHub theme's own markup on the canvas; changes are written to its .astro files, as Tailwind classes when it uses Tailwind.
sidebar:
  order: 3
---

With a [GitHub theme](/guides/github-themes/) active, the theme's own markup is editable on its live page, not only the
blocks of the entry. This works on the dev server (`pnpm dev`) and on a production server. In production every edit
(text, class, style, add, delete, duplicate, move, tag) shows on the live site at once, for visitors too: it is written
to the theme's file and laid over the built pages until the theme is built again. That build runs by itself in the
background once you stop editing for about a minute and a half; the site keeps working while it runs, and you can keep
editing (a build that edits came in during is dropped and made again). A Tailwind class the build has never seen gets its CSS from the theme's own Tailwind
right away. An element you add can be edited again before the build too. A change made in Code view (or an AI undo)
shows after that build; the elements it did not touch stay editable meanwhile.

## Selecting

- Click any element outside the blocks to select it. Properties shows its tag and its file (`src/components/Hero.astro`).
- **Layers** lists the theme's elements too (tag and text or first class). The page's blocks (**body**) sit where the
  theme renders them. Clicking a row selects the element as on the canvas, and search finds theme elements by tag, text
  or class.

## Editing

- Edit its text, classes, inline style and attributes, change its tag, move it up/down, duplicate or delete it, or open
  the file in [Code view](/visual-editor/code-view/). Double-click an element with only text in it to edit it in place.
- Text, classes, styles and attributes change on the canvas as you type and are written to the theme's `.astro` file
  after a short pause, without reloading the page. Changing the tag, moving or duplicating reloads it; deleting does not.
- Drag a theme row in Layers to move the element within its own file (same edges as blocks). Its right-click menu has
  Insert module after, Duplicate, Move up/down, Select parent, Open in Code and Delete.
- With a theme element selected, a module added from Add or Layers is written into the theme file right after it (as
  plain HTML with inline styles) and selected. With nothing selected it goes into the page's blocks. Markdown blocks
  always go into the page's blocks.
- Text or attributes produced by code (`{...}`, items of `.map()`) are edited in Code view. An element in a shared
  component such as `Footer.astro` changes on every page that uses it.
- A component used several times in one place (`<SectionHeader … />` in a page section) is selected one use at a time.
  For its outer element, class edits, move, duplicate, delete and adding next to it change only that use: the class
  goes to that call's `className` (`class` in `.astro`), and a class of the component is replaced through the theme's
  `tailwind-merge` (`gap-8` over `gap-5`). Elements inside it, and its other edits, change every use; Properties says
  which. Copies made by a `.map()` are selected together.
- A class list built by code (`className={cn("flex gap-5", …)}`) is edited in its strings: a removed class leaves them,
  an added one joins the first.

## The inspector

It is the full inspector: text, tag (`p`, `h2`, `section`…), every style group (Layout, Position, Size, Spacing,
Typography, Background, Border, Effects, Interaction) and HTML attributes, with the same icon controls as a page block
(see [Properties](/visual-editor/properties/)). **Styles / Attributes** tabs, class pills, section cards, the right
style rail and **Search styles** are shared too. Empty fields show the browser's computed value.

## Tailwind themes

When the theme uses Tailwind 4, styles are saved as classes:

| You set | Saved as |
| --- | --- |
| `align-self: center` | `self-center` |
| width `320px` | `w-[320px]` |
| a property without a utility | an arbitrary property, `[filter:blur(4px)]` |
| a style at a breakpoint or state | `max-[768px]:…`, `hover:…` |

Type a Tailwind value (`4`, `full`, `red-500`) or CSS (`320px`, `#fff`). Classes under other variants are kept. The
context and state controls open from the rail's Context & state button. On a theme without Tailwind, styles become
inline `style`.

## Requirements

- Astro 7.4 or later. Older Astro does not mark elements with their source file and line, so they cannot be listed or
  selected. Installing a theme raises its Astro to `^7.4.0`; a theme installed earlier needs **Rebuild** once.
- On the dev server the marks come with Astro's dev toolbar; Wuppy turns it back on while a theme runs for a site,
  even when the theme's own config turns it off. A production build gets the same marks from Wuppy, so a theme built
  before this change needs **Rebuild** once. Visitors never get them: only the editor's canvas (`?wuppy-visual`) does.
- Text a component gets from code (`<h2>{title}</h2>` with `title="…"` where it is used, or `{item.title}` from a data
  array) is edited where it is written: when the old text appears exactly once as a quoted string in the theme's `src/`
  code, that string changes. Text written in several places, or built from pieces, is edited in Code view.
- React components (`.tsx`/`.jsx`) rendered on the server are editable like `.astro` files. Wuppy marks their HTML
  elements itself, and an edit is written the React way: `class` becomes `className`, `style` an object
  (`style={{ "paddingTop": "1rem" }}`), inserted void tags self-close. A `className` or `style` made by code
  (`className={cn(...)}`) stays read-only; edit it in Code view.
- Changing theme files needs an admin (the `site:settings` permission). With GitHub connected, edits are committed and
  pushed to the theme repository automatically; without it they stay in the theme's folder on the server.
