---
title: Kayıt ve sınırlar
description: Görsel blokların MDX'te nasıl saklandığı, neyin filtrelendiği, site geneli verinin nerede durduğu ve editörün neyi yapmadığı.
sidebar:
  order: 12
---

## Ne kaydedilir

Her üst düzey blok gövdede `data-ve="…"` ile işaretli tek satır HTML olarak kaydedilir, örneğin:

```html
<section data-ve="container" style="padding: 32px 16px"><h2 data-ve="heading">Hoş geldiniz</h2></section>
```

- Görsel bloklar `.mdx` girdisinin içinde HTML benzeri JSX'tir; mevcut MDX sayfaları da görsel olarak düzenlenebilir.
  Bir bileşen eklendiğinde `.md` sayfası `.mdx`'e yükseltilir; düz Markdown girdileri `.md` kalır.
- Editörün yazmadığı her şey (Markdown, çok satırlı HTML, kod blokları) tek bir **Markdown** bloğu olur ve aynen geri
  yazılır.
- Metin karakter referanslarıyla saklanır; `*`, `{`, `<` gibi karakterler yazıldığı gibi görünür.
- Inline stiller filtrelenir (`;`/`{}`/`<>`/tırnak/ters bölü, `expression()`, `javascript:` yok; `url()` yalnız https
  veya site yolları). Responsive ve durum stilleri `data-ve-r` ile taşınır; site bunları CSS'e çevirir.
- Gizli bloklar `hidden` ile kaydedilir: gövdede kalır ama görünmez. Kilitli bloklar editörde taşınamaz ve silinemez.
- Framework, seçiciler, componentler, layout'lar, breakpoint'ler ve site stylesheet'i `.wuppy/data/visual.json`'a
  kaydedilir. Site sayfaları bunları `/api/public/visual.css` ve sayfa başına üretilen küçük bir `<style>` ile alır.
- Tema öğesi düzenlemeleri temanın `.astro` dosyalarına gider (bkz. [Tema öğeleri](/tr/visual-editor/theme-elements/)).
- Her içerik kaydı diğer içerik gibi bir Git commit'idir ve **History**'de görünür.

## Sınırlar

- Formlar, script'ler, dinamik döngü/bağlamalar, canlı ortak düzenleme (Wuppy düzenleme kilidi kullanır) ve npm
  bağımlılık paneli bu editörün parçası değildir: Wuppy Markdown'ı doğrular ve düz dosya saklar; bunlar ayrı bir
  güvenlik modeli gerektirir.
- Bir Markdown bloğu sayfanın üst düzeyinde kalır (container içine giremez) ve bütün olarak seçilir.
- Kaydedilen satırları elle düzenlemek, her görsel blok tek satırda kaldığı sürece sorun değildir.
- Tema öğesi düzenleme dev sunucusu, Astro 7.4+ ve dev araç çubuğu ister; bkz.
  [Tema öğeleri](/tr/visual-editor/theme-elements/#gereksinimler).
