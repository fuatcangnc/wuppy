---
title: Adding blocks
description: The Add panel, ready-made modules, layouts, components and pasted HTML.
sidebar:
  order: 5
---

**Add** (or **A**, or the **+** in the floating toolbar) opens the inserter. The top bar also has quick **Container**,
**Text** and **Image** buttons.

- The left rail has **Modules / Layouts / Components / Recent** with counts, and a preview of the highlighted item.
- The right pane has search, list/grid view, wireframe thumbnails and favourites (the star). Favourites also appear in
  the floating toolbar.
- **Paste HTML** turns pasted HTML into blocks; `className` from JSX is read as `class`.
- A new block goes after the selected block, or inside it when it is a container. With a theme element selected it goes
  into the theme file (see [Theme elements](/visual-editor/theme-elements/)).
- **Insert module here** in the Layers menu adds at an exact spot.

## Modules

| Category | Modules |
| --- | --- |
| Layout | Section, Container, Columns, Stack, Row, Card, Hero, Spacer |
| Basic | Heading, Text, Button, Link, List, Quote, Divider |
| Media | Image, Video |
| Advanced | Code, Markdown |

## What each block writes

| Block | Writes | Fields |
| --- | --- | --- |
| Container | `<section>`, `<div>`, `<header>`, `<footer>`, `<main>`, `<article>`, `<aside>`, `<nav>` | element, classes |
| Heading | `<h1>`–`<h6>` | level, classes |
| Text | `<p>` | classes |
| Button, Link | `<a>` | link, classes |
| Image | `<img>` | image (upload or Media), alt text, classes |
| Video | `<video controls>` | `.mp4`/`.webm` URL, classes |
| List | `<ul>` / `<ol>` | items (one per line), numbered |
| Quote, Code, Divider | `<blockquote>`, `<pre><code>`, `<hr>` | classes |
| Component instance | the component's markup | its parameters, slot content |
| Markdown | free Markdown, kept verbatim | source |
| Astro component | `<Callout data-ve="component" data-ve-name="Callout">`, rendered by the theme's map | component name |

Layouts and components are covered in [Components and layouts](/visual-editor/components/).
