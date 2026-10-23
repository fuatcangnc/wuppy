---
title: Bu dokümantasyon sitesi
description: Dokümanların nasıl derlendiği, çevrildiği ve yayınlandığı.
sidebar:
  order: 30
---

Bu dokümanlar Wuppy deposunun `docs/` klasöründe durur ve [Starlight](https://starlight.astro.build) ile
derlenir. Ana dil İngilizcedir; her sayfanın `tr/` altında Türkçe bir eşi vardır ve biri eksikse
`pnpm --filter @wuppy/docs test` başarısız olur.

```sh
pnpm --filter @wuppy/docs dev     # yerel önizleme
DOCS_SITE=https://docs.example.com pnpm --filter @wuppy/docs build
```

Genel adres yalnızca `DOCS_SITE` ile belirlenir (varsayılanı `https://docs.cigce.com.tr`). `docs/dist` içindeki
çıktı statik HTML'dir; her web sunucusu barındırabilir. Caddy ile:

```txt
docs.example.com {
	root * /srv/docs
	encode zstd gzip
	file_server
	handle_errors {
		rewrite * /404.html
		file_server
	}
}
```
