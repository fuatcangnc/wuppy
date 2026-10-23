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
	collections: [
		{
			name: "posts",
			dir: "content/posts",
			format: "mdx",
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

## Posts ve Pages

Paneldeki **Posts** ve **Pages** bölümleri `posts` ve `pages` adlı koleksiyonları gösterir. Bunlara farklı ad veren bir
tema bunun yerine `kind` yazar ve kendi adını korur (Astro koleksiyonu o adla okur):

```js
collections: [
	{ name: "blog", dir: "src/content/blog", kind: "posts", route: "/{slug}", fields: { title: "string", pubDate: "date" } },
	{ name: "about", dir: "src/content/about", kind: "pages", fields: { title: "string" } },
],
```

`wuppy init` `kind` değerini kendisi yazar: tarih alanı olan ilk koleksiyon Posts, tarih alanı olmayan ilk koleksiyon
Pages olur. Diğer koleksiyonlar kendi adlarıyla listelenir. GitHub temasında `kind` ve `map` temayı sitenin içeriğine
bağlar; bkz. [GitHub'dan temalar](/tr/guides/github-themes/).

## İçerik MDX veya Markdown'dır

Her koleksiyonun bir `format` değeri vardır: `"mdx"` (yeni girdiler `.mdx`, bileşenlere izin verilir) veya `"md"`
(`.md`, yalnız Markdown). Mevcut `.md` ve `.mdx` dosyaları yan yana yaşayabilir; bileşen eklendiğinde bir `.md` girdisi
`.mdx`'e yükseltilir. `components` listesi MDX'te ek Astro bileşen adlarına izin verir. Aktif temanın
`src/components/*.astro` dosyaları otomatik olarak izinlidir. Script'ler, import'lar, ifadeler ve listede olmayan
bileşenler kayıtta reddedilir, böylece editörler sitenizde kod çalıştıramaz. Bkz.
[MDX içeriği](/tr/guides/markdown/).

## Şablonlarınız için tipler

```sh
pnpm wuppy types
```

her koleksiyon için TypeScript tipi içeren `wuppy-env.d.ts` dosyasını yazar.
