---
title: MDX içerik
description: Yazıları, sayfaları, içerik tiplerini ve bölümleri MDX ile yazın; güvenli tutan kurallar.
sidebar:
  order: 2.5
---

Yazılar, sayfalar, kendi içerik tipleriniz ve bölümler [MDX](https://docs.astro.build/en/guides/integrations-guide/mdx/) ile
yazılabilir: Markdown, HTML ve sitenizin izin verdiği bileşenler.

## MDX nerede kullanılır

- Starter'daki **yazılar ve sayfalar** MDX koleksiyonlarıdır (`wuppy.config.mjs` içinde `format: "mdx"`). Yeni girdiler
  `.mdx` olarak kaydedilir. Mevcut `.md` dosyaları `.md` kalır ve çalışmaya devam eder; bir koleksiyon ikisini birden
  tutabilir.
- Admin'de oluşturduğunuz **içerik tipleri** varsayılan olarak MDX'tir. İsterseniz Markdown seçebilirsiniz.
- **Bölümler** (sections) gövdelerini MDX olarak saklar.
- **Widget'lar**: _custom_ widget gövdesi MDX'tir; _HTML_ widget kaydedilmeden önce aşağıdaki ham HTML denetiminden
  geçer (gösterirken yine temizlenir). Metin widget'ları düz metin olarak gösterilir.

## Yazarlar ne yazabilir

- Markdown, HTML öğeleri ve `wuppy.config.mjs` içindeki `components` listesindeki bileşenler:

  ```js
  export default { components: ["Callout", "YouTube"], collections: [/* … */] };
  ```

- Bileşen özellikleri yalnızca düz değerlerdir: metin, sayı, `true`/`false`, JSON olarak yazılmış liste ve nesneler.
  `<Callout tone="info" items={["a", "b"]}>` geçerlidir.

## Neler reddedilir

Gövde şunlardan birini içeriyorsa kayıt nedeniyle birlikte reddedilir (HTTP 422, `DISALLOWED_CONTENT`):

- `import` veya `export` satırları.
- `{process.env.SECRET}` ya da `title={user.name}` gibi JavaScript ifadeleri. Yorum (`{/* … */}`) serbesttir.
- İzin listesinde olmayan bileşenler ve `<a.b>` gibi üye adları.
- Yayılan özellikler (`{...props}`).
- Olay işleyiciler (`onclick`, `onError`…), Astro yönergeleri (`set:html`, `is:raw`, `client:*`),
  `dangerouslySetInnerHTML` ve `srcdoc`.
- `script`, `style`, `iframe`, `object`, `embed`, `form`, `link`, `meta`, `base` ve benzeri etiketler.
- `javascript:`, `vbscript:` ve `data:` bağlantıları. `data:` resimleri (PNG, JPEG, GIF, WebP, AVIF) serbesttir.
- Ayrıştırılamayan MDX. Hata satırı gösterir; böylece site build'i bu yüzden kırılmaz.

Markdown (`.md`) gövdeleri de aynı tehlikeli etiket, öznitelik ve bağlantılar için denetlenir.

Gövde, Astro'nun kullandığı ayrıştırıcıyla denetlenir. Kod blokları içindeki kod metindir, denetlenmez.

## Sitede

- Starter'ın `astro.config.mjs` dosyasında `@astrojs/mdx` vardır ve `**/*.{md,mdx}` yüklenir. Mevcut bir Astro projesinde
  [`wuppycms init`](/tr/guides/existing-astro-project/) aynısını yapar: `mdx()` ile `@astrojs/mdx`'i ekler ve
  `pattern: "**/*.md"` glob'larını `**/*.{md,mdx}` yapar.
- Tema bileşenleri otomatik eşlenir: Wuppy, temanın sayfalarındaki `<Content />` öğesine bir `components` haritası ekler; böylece temanın `src/components/*.astro` dosyaları **Add → Components** üzerinden içe aktarma satırı olmadan eklenebilir.
- Sitenin kendi bileşenleri için adlarını `wuppy.config.mjs` içindeki `components` listesine ekleyin ve bir girdiyi gösterirken verin: `<Content components={{ Callout }} />`.
- Admin'de düzenlenen bir MDX girdisi build gerekmeden hemen görünür. Sitenin Markdown ayarlarıyla derlenir: başlıklar
  build'dekiyle aynı id'leri ve `headings` listesini, kod blokları aynı renklendirmeyi alır.
- Bir bölüm (ya da custom widget) gövdesini `wuppycms/mdx` içindeki `mdxContent` ile gösterin. Göstermeden önce aynı
  denetimleri yeniden yapar ve `render()` ile aynı şeyi, `{ Content, headings }` döndürür:

  ```astro
  ---
  import { getSection } from "wuppycms";
  import { mdxContent } from "wuppycms/mdx";
  import Callout from "../components/Callout.astro";
  const section = await getSection("cta");
  const { Content: Body } = section ? await mdxContent(section.body) : {};
  ---
  {Body && <Body components={{ Callout }} />}
  ```
