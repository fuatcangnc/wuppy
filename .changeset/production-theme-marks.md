---
"wuppycms": patch
"@wuppycms/admin": patch
---

The visual editor now finds and edits a theme's own elements on a production server, not only under `astro dev`: a theme build marks its HTML elements with their source file and line, which only the editor's canvas receives. Theme builds also get the site's folder, so a theme's Markdown pages render the site's Pages entries in production. After an edit that moves elements, the file asks for Rebuild before the next edit.
