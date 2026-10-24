---
title: Properties
description: Styles, attributes, classes, the colour picker, breakpoints and states for the selected block.
sidebar:
  order: 6
---

**Properties** on the right edits the selection: a block, or a [theme element](/visual-editor/theme-elements/).

## Tabs and selectors

- **Styles / Attributes** tabs. Styles edits the block and its class; Attributes edits text, tag and the element's
  fields.
- **Selector field:** "Add or create selector…", coloured class pills and **Componentize** next to it.

## Style groups

Section cards with icons: Text, Layout, Position, Size, Spacing, Typography, Background, Border, Effects and
Interaction.

| Group | Controls |
| --- | --- |
| Layout | icon Type switch (Flex/Grid), Direction, Distribute, Align, Wrap, Gap |
| Position | T/R/B/L offset box, Type, Z index |
| Size | width/height/min/max fields with icons, box-sizing picker |
| Spacing | padding/margin rows with four-side pickers |
| Typography | Align, Decor and Capitalize icon rows |
| Background | Size, Position, Tile and Fixed icon rows |
| Border | radius with a four-corner picker |

The middle of a side/corner picker edits all sides, an edge edits one; linked sides are saved as one change. Enum
properties use inline icon/text choices instead of dropdowns, so every option is visible. Inputs suggest framework
tokens (`--v-*`); other CSS properties can be added under Other styles.

## Style rail and search

- The **right style rail** has the module icon and an icon per style group. It stays on the panel's right, scrolls to
  the section and marks groups that have values.
- **Search styles in .class...** at the bottom filters style rows.
- When an override is needed (a breakpoint, a condition, or a state such as `:hover`), context and state open from the
  icon on the rail. Breakpoints and conditions are set in [Settings](/visual-editor/framework-selectors/#settings).

## Colour picker

Colour fields open a picker that stays inside the window: colour area, hue slider, hex input and (in Chromium) an
eyedropper. The colour applies while you drag; **Escape** puts the old colour back.

## Components

For a component instance Properties shows its parameters, **Edit component** and **Detach**; see
[Components and layouts](/visual-editor/components/).
