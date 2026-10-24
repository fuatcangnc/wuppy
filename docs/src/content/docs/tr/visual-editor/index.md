---
title: Genel bakış
description: Bir sayfayı canlı bir tuvale bloklar yerleştirerek ve temanızın kendi işaretlemesini düzenleyerek kurun, sonra her girdi gibi MDX olarak kaydedin.
sidebar:
  order: 1
---

Görsel editör, bir girdinin gövdesini Markdown/MDX yazmak yerine tuvale bloklar ekleyerek kurmanızı sağlar. Tema
çalıştıran bir sitede temanın kendi işaretlemesini de (header, hero, footer) yerinde düzenler. Klasik editörle aynı
girdiyi düzenler ve aynı API ile kaydeder; bu yüzden yetkiler, [Markdown kuralları](/tr/guides/markdown/),
[eklentilerin önce çalışan hook'ları](/tr/plugins/hooks/), düzenleme kilitleri ve **History** aynı şekilde çalışır.

Editörde sayfa ağacı, düzenleme işlemleri, component/layout modeli, paneller ve bırakma kuralları vardır; hepsi
WuppyCMS'in dosya tabanlı MDX içeriği ve Git kayıtları üzerinde çalışır.

## Neler yapar

| Alan | Sayfa |
| --- | --- |
| Design ve Live tuval, cihazlar, zoom, seçme, yerinde metin düzenleme, sürükle-bırak | [Tuval ve cihazlar](/tr/visual-editor/canvas/) |
| GitHub temasının kendi öğelerini düzenleme; `.astro` dosyalarına Tailwind class'ı olarak kaydedilir | [Tema öğeleri](/tr/visual-editor/theme-elements/) |
| Layers ağacı, site sayfaları, hızlı kod, medya kütüphanesi | [Explorer](/tr/visual-editor/explorer/) |
| Hazır bloklar, layout'lar, componentler ve yapıştırılan HTML | [Blok ekleme](/tr/visual-editor/adding-blocks/) |
| Stiller, öznitelikler, class'lar, renk seçici, breakpoint ve durumlar | [Properties](/tr/visual-editor/properties/) |
| Site geneli token'lar, ortak seçiciler, breakpoint ve koşullar | [Framework ve seçiciler](/tr/visual-editor/framework-selectors/) |
| Parametreli ve slot'lu componentler, kayıtlı layout'lar, tema bileşenleri | [Componentler ve layout'lar](/tr/visual-editor/components/) |
| Sayfa, site CSS'i ve tema dosyaları için tam kod çalışma alanı | [Code görünümü](/tr/visual-editor/code-view/) |
| Seçili öğeleri değişikliği yazarak değiştirme | [AI](/tr/visual-editor/ai/) |
| Kısayollar ve Ctrl/⌘+K araması | [Klavye ve arama](/tr/visual-editor/keyboard/) |
| Kayıt biçimi, güvenlik kuralları ve sınırlar | [Kayıt ve sınırlar](/tr/visual-editor/saving/) |

## Açmak

- Üst çubuktaki **Site** editörü ana sayfada açar (Pages içinde `index` veya `home`, yoksa ilk sayfa). Hiç sayfa yoksa
  önce Content'te bir sayfa oluşturmanızı ister.
- Bir koleksiyonda girdiyi açıp **Edit with Visual** deyin. Adres `/admin/v/<koleksiyon>/<slug>` olur.
- Temanın `.astro` sayfaları Pages'te **Theme page** olarak listelenir ve burada da açılır: blokları sayfanın `<main>`
  öğesinin sonunda çizilir, temanın kendi işaretlemesi etraflarında düzenlenebilir (bkz.
  [GitHub temaları](/tr/guides/github-themes/#tema-sayfaları)).
- **Back** koleksiyona döner, **Open live page** sitedeki sayfayı açar, bir bağlantı klasik editöre geçer.
- Girdiyi başkası düzenlerken araç çubuğunda **… is editing** yazar ve kayıt kapalıdır (düzenleme kilidi).
  Kaydedilmemiş değişiklikle çıkarken önce sorulur.

## Ekran

| Alan | Görevi |
| --- | --- |
| Üst çubuk | hızlı ekleme **Container / Text / Image**, **Add** ızgarası, **Code** görünümü, arama (Ctrl/⌘+K), geri al/yinele, ayarlar, canlı sayfa, klasik editör, **Save** |
| Sol ray | **Explorer** (Layers, Site, Code, Media), **Framework**, **Selectors**, **AI** |
| Tuval | sitenin kendi stilleriyle iframe'ler içinde sayfa |
| Yüzen araç çubuğu (tuvalin üstü) | favori modüller, **Add**, **Design/Live**, cihaz menüsü, zoom ve sığdır |
| Properties (sağ) | seçili bloğun ya da tema öğesinin alanları, class'ları, bağlamı ve stilleri |
| Breadcrumbs | sayfadan seçime giden yol; bir parçaya tıklayınca o seçilir |

## Kimler kullanabilir

Girdiyi düzenleyebilen herkes editörü kullanabilir. Tema öğeleri ve tema dosyaları temanın kodunu değiştirdiği için
yalnız adminler için yazılır; AI paneli içerik yazma izni ve sunucuda bir AI sağlayıcısı ister.
