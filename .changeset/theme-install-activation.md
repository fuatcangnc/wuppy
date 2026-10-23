---
"wuppy": patch
---

GitHub themes: an install is reported as done only after the theme is activated and the server restart has been requested. Previously the job showed "Done" while the running site could still be serving the old theme, and a test could miss the restart.
