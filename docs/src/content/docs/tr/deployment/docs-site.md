---
title: Bu dokümantasyon sitesi
description: Dokümanların nasıl derlendiği, çevrildiği ve yayınlandığı.
sidebar:
  order: 30
---

Bu dokümanlar Wuppy deposunun `docs/` klasöründe durur ve [Starlight](https://starlight.astro.build) ile
derlenir. Ana dil İngilizcedir; her sayfanın `tr/` altında Türkçe bir eşi vardır ve biri eksikse
`pnpm --filter @wuppycms/docs test` başarısız olur.

```sh
pnpm --filter @wuppycms/docs dev     # yerel önizleme
DOCS_SITE=https://docs.example.com pnpm --filter @wuppycms/docs build
```

Genel adres yalnızca `DOCS_SITE` ile belirlenir (varsayılanı `https://docs.wuppycms.com`). `docs/dist` içindeki
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

## WuppyCMS adresleri

| Adres | Ne sunar |
| --- | --- |
| `wuppycms.com` | WuppyCMS'i tanıtan giriş sayfası (`/` İngilizce, `/tr/` Türkçe). `www` buraya yönlenir. |
| `docs.wuppycms.com` | Bu dokümanlar. |
| `test.wuppycms.com` | Açık kaynak WuppyCMS'in kendi kurulumumuz; giriş `/admin` adresinde. |
| `app.wuppycms.com` | Ücretli barındırılan hizmet WuppyCMS Cloud için ayrıldı; açılana kadar `test` adresine yönlendirir. |

Giriş sayfası deponun `landing/` paketidir: adresi `LANDING_SITE` ile belirlenen statik bir Astro sitesi
(Tailwind CSS 4 + bejamas/ui).

```sh
pnpm --filter @wuppycms/landing dev
LANDING_SITE=https://wuppycms.com pnpm --filter @wuppycms/landing build   # landing/dist içinde statik HTML
```

Caddy `landing/dist`'i dokümanlar gibi kendi klasöründen sunar (`root * /srv/landing`).
