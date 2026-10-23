---
"wuppy": patch
"@wuppy/admin": patch
---

Visual editor: a theme element's Properties now has Instatic's whole inspector: text, tag, every style group (Layout, Position, Size, Spacing, Typography, Background, Border, Effects, Interaction) and HTML attributes. Styles are saved as Tailwind 4 classes when the theme uses Tailwind (`self-center`, `w-[320px]`, `max-[768px]:hover:text-[#fff]`), as inline style otherwise. Block styles use the same full list of properties.
