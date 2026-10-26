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
| `wuppycms.com` | WuppyCMS'i tanıtan giriş sayfası (`/` İngilizce, `/tr/` Türkçe). WuppyCMS ile çalışır: `/admin` adresinden düzenlenir. `www` buraya yönlenir. |
| `docs.wuppycms.com` | Bu dokümanlar. |
| `test.wuppycms.com` | Açık kaynak WuppyCMS'in kendi kurulumumuz; giriş `/admin` adresinde. |
| `app.wuppycms.com` | Barındırılan hizmet WuppyCMS Cloud: giriş yapın, projelerinizi görün ve tek tıkla site kurun (şimdilik davetle). |

Giriş sayfası deponun `landing/` paketidir: WuppyCMS'in kendisiyle çalışan bir Astro sitesi (Tailwind CSS 4 +
bejamas/ui). Metinleri (başlık, özellikler, adımlar) `landing/content/landing/` içindeki `landing` koleksiyonudur, her
dil için bir kayıt (`en`, `tr`); `wuppycms.com/admin` adresinden giriş yapıp Pages altında düzenlenir. Kayıt sitede
hemen görünür ve bir Git commit'idir. Buton etiketleri ve bağlantılar `src/components/Landing.astro` içinde kalır.

```sh
pnpm --filter @wuppycms/landing dev
LANDING_SITE=https://wuppycms.com pnpm --filter @wuppycms/landing build   # landing/dist içinde Node sunucusu
```

Sunucuda bir siteyle aynı Docker imajının `landing` servisidir (`working_dir: /app/landing`,
`command: node /app/templates/starter/serve.mjs`; Admin → Themes'te seçilen temayı da çalıştırır); kendi `.env`'i, `WUPPY_URL=https://wuppycms.com` ve içerik, yüklemeler, Git
geçmişi ve `.wuppy` için volume'ları vardır. Caddy `wuppycms.com`'u ona yönlendirir.
