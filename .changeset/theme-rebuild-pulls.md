---
"wuppycms": patch
---

**Rebuild** on the Themes page now pulls what was pushed to the theme's GitHub repository before building. Edits made on the server are kept; where GitHub changed or deleted the same file, GitHub's version wins and the server's version stays in `git stash`.
