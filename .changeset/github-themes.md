---
"wuppy": minor
"@wuppy/admin": minor
"@wuppy/auth": patch
---

Themes from GitHub: Admin → Themes lists the Astro sites in your GitHub account (Connect GitHub opens GitHub's consent page for all repositories, `repo` scope; the server needs `WUPPY_GITHUB_CLIENT_SECRET`; tokens are sealed per user) and installs the one you pick as this site's design. The server clones it under `.wuppy/themes/`, wraps it, installs and builds it with the Node adapter, then switches to it and restarts; accounts are shared and a failed build leaves the current site running. The starter starts with `node serve.mjs`, which runs the active theme (the Docker image uses it). Linked OAuth tokens are now stored encrypted.
