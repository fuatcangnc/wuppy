---
title: Kodlama ajanıyla kurulum
description: Claude Code, Cursor veya opencode'un bir WuppyCMS sitesini kurması, sarması, yayına alması ve güncellemesi için kopyalanmaya hazır prompt'lar.
sidebar:
  order: 5
---

Bir kodlama ajanı (Claude Code, Cursor, opencode, Codex) Wuppy'yi sizin için kurabilir. Aşağıdaki prompt'lardan birini, sitenin olacağı klasörde ya da Astro projenizde açtığınız ajana yapıştırın. Her prompt bu dokümandaki komutları adıyla verir; ajan tahmin etmek zorunda kalmaz.

Ajan komutları sizin makinenizde çalıştırır: izin vermeden önce ne çalıştıracağını okuyun. `.env` dosyasını asla yazdırmamalı ya da commit etmemeli; prompt'lar bunu söyler.

Prompt'lar İngilizcedir; ajanlar İngilizce komutları en iyi böyle izler. Sonuna "Bana Türkçe yanıt ver" ekleyebilirsiniz.

## Yeni site oluşturma

```text
Create a new WuppyCMS site (an Astro CMS, docs: https://docs.wuppycms.com/getting-started/) in a folder named my-site:
1. Run `npm create wuppycms my-site` and go into the folder.
2. Create `.env` next to package.json with WUPPY_SECRET set to the output of `openssl rand -base64 32` and WUPPY_URL=http://localhost:4321. Never print the secret or commit `.env`.
3. Run `pnpm install` (or `npm install` when pnpm is missing), then `pnpm wuppycms doctor` and fix what it reports.
4. Start it with `pnpm dev` and tell me to open http://localhost:4321/admin (not 127.0.0.1) to create the owner account.
Requires Node.js 22.16+ and Git; stop and tell me if either is missing.
```

## Var olan bir Astro projesine Wuppy ekleme

```text
Add WuppyCMS to this Astro project without moving its content (docs: https://docs.wuppycms.com/guides/existing-astro-project/):
1. Check that `git status` is clean; if not, stop and ask me.
2. Run `npx wuppycms init` in the project root. Do not pass --force: if a wuppy.config.mjs already exists, stop and ask me.
3. Read the generated wuppy.config.mjs and the init output. Set a `route` for every collection whose public URL it could not find (look at the `[slug]` pages under src/pages), and tell me which collections were skipped and why.
4. If init printed a line to add to astro.config by hand, add it.
5. Run `npm install`, `npx wuppycms doctor` and `npm run build`, and fix what fails without changing the site's design.
6. Do not commit `.env` or `.wuppy/`. Show me the changed files and tell me to run `npm run dev` and open /admin.
```

Bundan sonra projede bir `AGENTS.md` olur; temanın menüleri ve ayarları Wuppy'den okuması için [Temada kod ajanları](/tr/ai/theme-agents/) sayfasındaki prompt'ları kullanın.

## Docker ile yayına alma

```text
Deploy this WuppyCMS site to a Linux server with Docker (docs: https://docs.wuppycms.com/deployment/docker/):
1. Use the repository's Dockerfile and docker-compose.yml; keep `restart: unless-stopped`.
2. Keep the content, uploads, history and state volumes, so a new container keeps the site's data.
3. Put WUPPY_SECRET (32+ random characters, made once and kept stable) and WUPPY_URL=https://<my domain> in an env file that is not committed. Never print the secret.
4. Add Caddy in the same compose file for HTTPS (`reverse_proxy wuppy:4321`) and set WUPPY_TRUSTED_PROXIES to the Docker network (172.16.0.0/12).
5. Start it with `docker compose up -d --build`, check that https://<my domain>/api/setup answers, and tell me to open /admin to create the owner account.
Ask me for the domain and the server before you start.
```

## Siteyi güncelleme

```text
Upgrade WuppyCMS in this site (docs: https://docs.wuppycms.com/deployment/upgrading/):
1. Check that `git status` is clean; if not, stop and ask me.
2. Read the CHANGELOG entries between the installed wuppycms version and the latest, and tell me about breaking changes before you go on.
3. Run `pnpm up wuppycms`, then `pnpm wuppycms upgrade`, `pnpm wuppycms types` and `pnpm wuppycms doctor`.
4. Run the build and fix what fails. If the upgrade cannot be finished, roll back as the docs describe and tell me why.
```

## Kurulum sorununu bulma

```text
This WuppyCMS site does not start or the admin does not work. Run `pnpm wuppycms doctor` (or `npx wuppycms doctor`), read its output and the server log, and fix the cause: the config loading, missing content folders, Git, or a WUPPY_SECRET shorter than 32 characters. Check the docs at https://docs.wuppycms.com/reference/environment/ for environment variables. Do not print secrets from `.env`; tell me what you changed.
```
