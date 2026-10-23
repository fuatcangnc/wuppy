---
title: Yapılandırma
description: wuppy.config içinde koleksiyonlar, alanlar, diller ve site seçenekleri.
sidebar:
  order: 2
---

Site, proje kökündeki `wuppy.config.mjs` (veya `.ts`) dosyasında tanımlanır.

```js
export default {
	site: { url: "https://example.com", name: "Example" },
	locales: ["en", "tr"], // slug'ın ilk parçası dildir: en/hello, tr/hello
	components: ["Callout"], // içerikte kullanılabilecek bileşenler
	collections: [
		{
			name: "posts",
			dir: "content/posts",
			route: "/blog/{slug}",
			fields: { title: "string", date: "date", draft: "boolean", publishAt: "date", tags: "list", cover: "image" },
		},
	],
	redirects: [{ from: "/old", to: "/new" }],
	webhooks: [{ url: "https://ci.example.com/hook", secret: "…", events: ["content.updated"] }],
	plugins: [{ dir: "plugins/search", approve: "<wuppy plugin hash çıktısı>" }],
};
```

## Alan tipleri

| Tip | Düzenleme biçimi |
| --- | --- |
| `string`, `text` | tek satır, çok satır |
| `number`, `boolean`, `date` | sayı, anahtar, tarih seçici |
| `image` | yüklemeli medya seçici |
| `list` | metin listesi (örneğin etiketler) |
| `select` | sabit bir listeden tek değer |
| `reference` | başka bir kayda, taksonomi terimine veya yazar profiline bağlantı |
| `richText` | Markdown editörü |
| `repeater`, `blocks`, `json` | yapılandırılmış JSON (repeater alt şema ve min/max destekler) |

Alanlar zorunlu olabilir, varsayılan değer ve yardım metni alabilir, başka bir alanın değerine göre gösterilebilir
(örneğin `draft` açıkken `publishAt` gizlenir).

Koleksiyonlar panelde **Content Types** altında da oluşturulup düzenlenebilir; bkz.
[İçerik tipleri](/tr/guides/content-types/).

## İçerik bileşenleri

İçerikte yalnızca `components` listesindeki bileşenler kullanılabilir. Diğer JSX, import ve script'ler kayıtta
reddedilir; böylece editörler sitenizde kod çalıştıramaz.

## Şablonlarınız için tipler

```sh
pnpm wuppy types
```

her koleksiyon için TypeScript tipi içeren `wuppy-env.d.ts` dosyasını yazar.
