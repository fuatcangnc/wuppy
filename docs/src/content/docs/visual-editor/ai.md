---
title: AI
description: Select elements and describe a change; the AI applies it like your own edit, with undo.
sidebar:
  order: 10
---

**AI** is on the left rail, below Selectors.

## Using it

1. Pick the elements to change with **Select** (Ctrl+Alt+A). While it is on, every element you click on the canvas or
   in Layers is added; clicking it again removes it (or the × on its chip). With nothing picked, the AI works on the
   current selection.
2. Write the change ("make the heading red and larger, add 24px space under the paragraph") and press Enter.
3. The answer is applied like your own edit: blocks change in one undo step, theme elements are written to the theme's
   `.astro` file (as Tailwind 4 classes when the theme uses Tailwind).

It can change text, styles, classes, and on theme elements attributes and the tag. Text the theme fills from code
(`{site.title}`) is replaced with the text you ask for.

A picked theme element shows the AI its child elements too, and the AI styles them from the parent's classes with
Tailwind variants: "make this a bento grid" turns the container into a grid and gives each card its span
(`md:[&>:nth-child(1)]:col-span-2`), also when the cards come from a `.map()`. An answer without changes (a
question, say) shows as the reply.

## Chats and undo

- Chats are kept in this browser: **Chat history** reopens or deletes one, **New chat** starts another.
- **Undo** under an answer reverts everything that answer did, theme files included. It leaves a file alone if it was
  edited again since (revert that in [Code view](/visual-editor/code-view/)). Undo is offered while the editor stays
  open.

## Setup

The server needs an AI provider (`WUPPY_AI_BASE_URL`, `WUPPY_AI_API_KEY`, `WUPPY_AI_MODELS`; see
[AI assistant](/ai/assistant/)), and you need permission to write content.
