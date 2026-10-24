---
title: Görsel editör
description: Bir sayfayı canlı bir tuvale bloklar yerleştirerek kurun, sonra her girdi gibi MDX olarak kaydedin.
sidebar:
  order: 2.6
---

Görsel editör, bir girdinin gövdesini Markdown/MDX yazmak yerine tuvale bloklar ekleyerek kurmanızı sağlar. Klasik
editörle aynı girdiyi düzenler ve aynı API ile kaydeder; bu yüzden yetkiler, [Markdown kuralları](/tr/guides/markdown/),
[eklentilerin önce çalışan hook'ları](/tr/plugins/hooks/), düzenleme kilitleri ve **History** aynı şekilde çalışır.

Editör [Instatic](https://github.com/corebunch/instatic) (MIT) uyarlamasıdır: aynı sayfa ağacı, düzenleme işlemleri,
component/layout modeli, paneller ve bırakma kuralları; Wuppy'nin dosya tabanlı MDX içeriği ve Git kayıtları
üzerinde.

## Açmak

- Üst çubuktaki **Site** editörü ana sayfada açar (Pages içinde `index` veya `home`, yoksa ilk sayfa). Hiç sayfa yoksa
  önce Content'te bir sayfa oluşturmanızı ister.
- Bir koleksiyonda girdiyi seçip **Edit with Visual** deyin. Adres `/admin/v/<koleksiyon>/<slug>` olur.
- **Back** koleksiyona döner, **Open live page** sitedeki sayfayı açar, bir bağlantı klasik editöre geçer.
- Girdiyi başkası düzenlerken araç çubuğunda **… is editing** yazar ve kayıt kapalıdır (düzenleme kilidi).
  Kaydedilmemiş değişiklikle çıkarken önce sorulur.

## Ekran

| Alan | Görevi |
| --- | --- |
| Araç çubuğu | hızlı ekleme **Container / Text / Image**, **Add** ızgarası, **Code** görünümü, arama (Ctrl/⌘+K), geri al/yinele, ayarlar, canlı sayfa, klasik editör, **Save** |
| Sol ray | **Explorer** (Layers, Site, Code, Media), **Framework**, **Selectors** |
| Tuval | sitenin stilleriyle iframe'ler içinde sayfa |
| Properties (sağ) | seçili bloğun alanları, sınıfları, bağlamı ve stilleri |
| Notch (alt) | **Design/Live** geçişi, zoom, sığdır |
| Breadcrumbs | sayfadan seçili bloğa giden yol; bir parçaya tıklayınca o seçilir |

### Tuval

- **Design** temel (masaüstü) çerçeveyi ve tüm breakpoint'leri yan yana gösterir; örneğin Desktop 1440px, Tablet
  768px, Mobile 375px. Tekerlek kaydırır, Ctrl/⌘ + tekerlek yakınlaştırır, **Fit** tüm çerçeveleri sığdırır.
- **Live** ziyaretçinin gördüğü gibi tek çerçeve gösterir.
- Bloğa tıklayınca seçilir. Metne çift tıklayınca yerinde düzenlenir: tek satırlık blokta **Enter**, çok satırlıda
  Ctrl/⌘+Enter onaylar (Shift+Enter satır ekler), **Escape** geri alır.
- Blokları sürükleyerek sıralayın: üst veya alt kenar önüne/arkasına, container'ın ortası içine yerleştirir.
- Seçili bloğun küçük bir araç çubuğu (sürükleme tutamacı, üst öğeyi seç, arkasına ekle, çoğalt, sil) ve sağ tık menüsü
  (kopyala/kes/yapıştır, çoğalt, sar, gizle, kilitle, layout olarak kaydet, componentize, detach, sil) vardır.
- Markdown blokları sitenin işlediği gibi işlenmiş görünür (sunucu bunları kayıttaki gibi kontrol eder). Kaynakları
  Properties'te düzenlenir.

- Temanın canlı sayfasında temanın kendi işaretlemesi de düzenlenir (yalnız dev sunucusu). Blokların dışındaki bir öğeye
  tıklayınca seçilir: Properties etiketini ve dosyasını gösterir; metnini, class'larını ve inline stilini düzenler,
  yukarı/aşağı taşır, çoğaltır, siler ya da dosyayı Code görünümünde açar. Yalnız metin içeren öğelere çift tıklayınca
  yerinde düzenlenir. Değişiklik temanın `.astro` dosyasına yazılır ve sayfa yenilenir. Kodla üretilen metin ya da
  öznitelikler (`{...}`, `.map()` öğeleri) Code görünümünde düzenlenir; `Footer.astro` gibi ortak bir bileşendeki öğe
  her sayfada değişir.
- Tema öğesinin denetçisi Instatic'inkiyle aynıdır: metin, etiket (`p`, `h2`, `section`…), tüm stil grupları (Layout,
  Position, Size, Spacing, Typography, Background, Border, Effects, Interaction) ve HTML öznitelikleri. Layout, Position,
  Spacing ve Border grupları sayfa bloğuyla aynı ikonlu kontrolleri kullanır: Flex/Grid türü,
  direction/distribute/align/wrap/gap, T/R/B/L offset kutusu, dört kenarlı padding/margin seçicileri ve dört köşeli
  radius seçicisi. Tema Tailwind 4 kullanıyorsa stiller class olarak kaydedilir: `align-self: center` `self-center`,
  `320px` genişlik `w-[320px]` olur;
  karşılığı olmayan özellikler arbitrary property olarak yazılır (`[filter:blur(4px)]`). Tailwind değeri (`4`, `full`,
  `red-500`) ya da CSS (`320px`, `#fff`) yazılabilir. Breakpoint ve state seçilince class `max-[768px]:` ve `hover:`
  altında yazılır; başka variant'lardaki class'lar korunur. Tailwind kullanmayan temada stiller inline style olur. Boş
  alanlar tarayıcının değerini gösterir. Panel; **Styles / Attributes** sekmeleri, class pill'leri, bölüm kartları, sağ
  stil rayı ve **Search styles** altlığıyla sayfa bloğuyla aynıdır; Tailwind temasında context kontrolleri rayın
  Context & state düğmesinden açılır.

### Explorer

- **Layers:** arama, ekleme düğmesi, renkli HTML tag etiketleri, modül ikonları ve aç/kapat oklarıyla sayfa ağacı.
  Satırları sürükleyerek taşıyın (üst kenar: önüne, alt kenar: arkasına, container'ın ortası: içine); kapalı container
  üzerinde beklerken açılır. Çift tıklayınca yeniden adlandırılır. Sağ tık: Hide, Rename, Duplicate, Componentize, Save
  as layout, Copy, Cut, Paste, Wrap, Select parent, **Insert module here**, Lock ve Delete.
- **Site:** Pages koleksiyonunun sayfaları, **Templates** (kayıtlı layout'lar) ve **Components**; sayaçlar ve boş
  durumlarla. Sayfaya tıklayınca açılır; template'i tuvale sürükleyin veya ekleme düğmesine basın.
- **Code:** site stylesheet'i ve açık sayfanın MDX/Markdown kaynağı için hızlı editör.
- **Media:** arama, All/Images/Videos filtreleri, liste/ızgara görünümü, küçük resimler ve yükleme. Dosyayı tuvale
  sürükleyin veya kullanmak için tıklayın.

### Tuvale ekleme

**Add** (veya **A**) ekleyiciyi açar. Sol rayda sayaçlı **Modules / Layouts / Components / Recent** ve vurgulanan
öğenin önizlemesi; sağ panelde arama, liste/ızgara görünümü, wireframe küçük resimler ve favoriler (yıldız) vardır.
**Paste HTML** yapıştırılan HTML'i bloklara çevirir; JSX'ten gelen `className` `class` olarak okunur. Yeni blok seçili
bloğun arkasına, seçili blok container ise içine eklenir.

| Kategori | Hazır bloklar |
| --- | --- |
| Layout | Section, Container, Columns, Stack, Row, Card, Hero, Spacer |
| Basic | Heading, Text, Button, Link, List, Quote, Divider |
| Media | Image, Video |
| Advanced | Code, Markdown |

| Blok | Yazdığı | Alanlar |
| --- | --- | --- |
| Container | `<section>`, `<div>`, `<header>`, `<footer>`, `<main>`, `<article>`, `<aside>`, `<nav>` | öğe, sınıflar |
| Heading | `<h1>`–`<h6>` | seviye, sınıflar |
| Text | `<p>` | sınıflar |
| Button, Link | `<a>` | bağlantı, sınıflar |
| Image | `<img>` | görsel (yükleme veya Media), alt metin, sınıflar |
| Video | `<video controls>` | `.mp4`/`.webm` adresi, sınıflar |
| List | `<ul>` / `<ol>` | maddeler (satır başına bir), numaralı |
| Quote, Code, Divider | `<blockquote>`, `<pre><code>`, `<hr>` | sınıflar |
| Component instance | component'in işaretlemesi | parametreleri, slot içeriği |
| Markdown | serbest Markdown, aynen korunur | kaynak |
| Astro bileşeni | `<Callout data-ve="component" data-ve-name="Callout">`; tema haritası render eder | bileşen adı |

### Properties

- **Styles / Attributes** sekmeleri. Styles bloğu ve sınıfını, Attributes ise metni, tag'i ve öğe alanlarını düzenler.
- **Seçici alanı:** “Add or create selector…” yazısı, renkli sınıf etiketleri ve yanında **Componentize**.
- **İkonlu bölüm kartları:** Text, Layout, Position, Size, Spacing, Typography, Background, Border, Effects ve
  Interaction. Layout'ta ikonlu Type geçişi (Flex/Grid), Direction, Distribute, Align, Wrap ve Gap; Position'ta
  T/R/B/L offset kutusu ile Type ve Z index; Spacing'te dört kenar seçicili padding/margin satırları; Border'da dört
  köşe seçicili radius bulunur. Seçicinin ortası tüm kenarları/köşeleri, kenarı tek tarafı düzenler; bağlı kenarlar tek
  değişiklik olarak kaydedilir.
- **Sağ stil rayı:** modül ikonu ve her stil grubu için bir ikon. Panelin sağında sabit kalır, ilgili bölüme kaydırır ve
  değeri olan grupları işaretler.
- Alttaki **Search styles in .class...** alanı stil satırlarını filtreler. Breakpoint, koşul veya `:hover` gibi bir
  override gerekince bağlam ve durum, ray üzerindeki ikondan açılır.
- Girişler framework token'larını (`--v-*`) önerir; başka CSS özellikleri Other styles altında eklenebilir.
- **Componentize**; bir instance için parametreleri, **Edit component** ve **Detach**.

### Framework

**Overview**, **Colors**, **Type** ve **Space** sekmelerinde site geneli tasarım token'ları:

- sınıf öneki, kök font boyutu ve akışkan ölçeklerin en küçük/en büyük ekran genişliği;
- isteğe bağlı koyu değerli renkler, en fazla 9 koyu ve 9 açık ton, şeffaf varyantlar ve utility sınıfları;
- akışkan **type** ve **space** ölçekleri (en küçük/en büyük boyut ve oran, adım adları, temel adım), Instatic'teki gibi
  hesaplanır;
- isteğe bağlı `https` stylesheet bağlantılı font yığınları.

Her token bir CSS değişkeni, utility'leri açıksa bir utility sınıfı da olur (varsayılan önek `v-`).

### Selectors

Ortak seçici kütüphanesi (`.card`, `h2`, `.hero > p`…). Birini açınca her sayfada eşleşen tüm öğeleri, Properties ile
aynı bağlam ve durum seçenekleriyle stillendirirsiniz. Sınıf seçicileri sınıf seçicide önerilir.

### Ayarlar

Temel çerçeve genişliği, bağlam seçicideki **breakpoint'ler** (max-width, önce masaüstü; en fazla 8) ve **koşullar**
(`@media`, `@container` veya `@supports` sorguları; en fazla 20), ayrıca kısayol listesi.

### Arama (Ctrl/⌘+K)

Adıyla herhangi bir katmana gidin veya bir komut çalıştırın: Add, Undo, Redo, Paste, Live veya Design modu, tuvali
sığdır, Framework, Selectors veya Explorer'ı aç, Settings.

## Code görünümü

Araç çubuğundaki **Code** tam genişlikte bir çalışma alanı açar:

- Gerçek yollarla aranabilir dosya ağacı. **site** sayfayı (`content/pages/about.md`), site CSS'ini
  (`.wuppy/data/visual/site.css`), componentleri (`.wuppy/data/visual/components/*.json`) ve `visual.json`'u tutar.
  **New page** yeni sayfa için koleksiyona gider.
- GitHub teması aktifken ikinci bir **theme: owner/repo** kökü adminlere temanın kodunu (`.astro`, CSS, script, config)
  gösterir. İçerik **site** altında kalır, bu yüzden temanın örnek içerik klasörleri listelenmez. Kaydedilen tema
  dosyası `pnpm dev` altında hemen görünür; production'da durum çubuğundaki **Rebuild** düğmesine basın. Bağımlılıklar,
  build çıktısı, lockfile'lar ve `.env` hiç listelenmez ve yazılamaz. Bkz.
  [GitHub'dan temalar](/tr/guides/github-themes/).
- Sekmeler, satır numaralı ve renklendirmeli editör, **Saved/Unsaved** durumu ve Ctrl/⌘+S ile kayıt.
- Breakpoint ve zoom kontrollü önizleme ve seçili blok için altta **Styles/Computed** paneli.
- Sayfa kaynağı (`.mdx` veya `.md`), site CSS'i ve tema dosyaları düzenlenebilir; component ve `visual.json` dosyaları salt okunurdur. Site
  kayıtları Git tabanlı aynı içerik ve görsel veri API'lerini kullanır.
- Yazdığınız tek satırlık HTML görsel bloklara çevrilir. Geçerli Tailwind utility'leri kayıtta derlenir (starter
  içeriği `@source` ile tarar) ve önizleme CSS'i yeniden yükler; `text-red-10` gibi geçersiz bir sınıf CSS üretmez.

## Componentler ve layout'lar

- **Componentize** (katman menüsü veya Properties) seçili alt ağaçtan bir component yapar. Bir component en fazla 20
  **parametre** alabilir: metin ve özniteliklerindeki `{{ad}}` her instance'ın değeriyle değişir. İçindeki **Slot**,
  her instance'ın kendi içeriğini tutar.
- **Edit component** tüm instance'ların işaretlemesini değiştirir; **Detach** bir instance'ı normal bloklara çevirir.
  Explorer → Site içindeki **Update pages** güncel işaretlemeyi component'i kullanan her sayfaya yazar.
- **Save as layout** seçili alt ağacı stilleriyle saklar; Add → Layouts veya Explorer → Site'tan eklenir.
- **Tema bileşenleri:** bir GitHub teması etkinse `src/components/*.astro` dosyaları `ASTRO` rozetiyle Add → Components altında görünür. Birini seçmek sayfaya gerçek bir Astro bileşeni bloğu ekler. Wuppy, bileşen haritasını temanın `<Content />` öğesine otomatik verir; içe aktarma satırı yazılmaz. Canvas bileşenin gerçek çıktısını temanın stilleriyle gösterir (prop olmadan, Wuppy entegrasyonunun siteye eklediği `/_wuppy/component/<Ad>` sayfasıyla işlenir); seçilebilmesi için çerçeveli ve etiketlidir, içindeki script'ler canvas'ta çalışmaz. Verilmeyen prop'lara ihtiyaç duyan bir bileşen (`headings` olmadan içindekiler tablosu) sayfayı bozmaz: site onu atlar (bir HTML yorumu, hata sunucu günlüğünde) ve canvas prop gerektiğini yazar. Bileşen eklenen bir `.md` girdisi `.mdx` olarak kaydedilir, bu yüzden gövdesi geçerli MDX olmalıdır: `</div>` gibi fazladan bir kapanış etiketi satırıyla birlikte `invalid MDX` olarak bildirilir.

## Klavye

| Tuşlar | İşlem |
| --- | --- |
| Ctrl/⌘+S | kaydet (yazarken de) |
| Ctrl/⌘+K | katman ve komut ara |
| Ctrl/⌘+Z; Ctrl/⌘+Shift+Z veya Ctrl/⌘+Y | geri al; yinele (100 adım, bir alana yazmak tek adımdır) |
| Ctrl/⌘+C / X / V | kopyala, kes, yapıştır (seçili bloğun arkasına) |
| Ctrl/⌘+D | çoğalt |
| Delete, Backspace | seçili bloğu sil |
| Alt+↑ / Alt+↓ | seçili bloğu yukarı veya aşağı taşı |
| A | Add'i aç |
| Ctrl/⌘+0; Ctrl/⌘++ / −; Shift+1 | %100 zoom; yakınlaştır/uzaklaştır; sığdır |
| Escape | menüyü kapat, stillenen seçiciden çık, sonra üst öğeyi seç ve seçimi kaldır |

## Ne kaydedilir

Her üst düzey blok gövdede `data-ve="…"` ile işaretli tek satır HTML olarak kaydedilir, örneğin:

```html
<section data-ve="container" style="padding: 32px 16px"><h2 data-ve="heading">Hoş geldiniz</h2></section>
```

- Görsel bloklar `.mdx` girdisinin içinde HTML benzeri JSX'tir; mevcut MDX sayfaları da görsel olarak düzenlenebilir. Bir bileşen eklendiğinde `.md` sayfası `.mdx`'e yükseltilir; düz Markdown girdileri `.md` kalır.
- Editörün yazmadığı her şey (Markdown, çok satırlı HTML, kod blokları) tek bir **Markdown** bloğu olur ve aynen geri
  yazılır.
- Metin karakter referanslarıyla saklanır; `*`, `{`, `<` gibi karakterler yazıldığı gibi görünür.
- Inline stiller filtrelenir (`;`/`{}`/`<>`/tırnak/ters bölü, `expression()`, `javascript:` yok; `url()` yalnız https
  veya site yolları). Responsive ve durum stilleri `data-ve-r` ile taşınır; site bunları CSS'e çevirir.
- Gizli bloklar `hidden` ile kaydedilir: gövdede kalır ama görünmez. Kilitli bloklar editörde taşınamaz ve silinemez.
- Framework, seçiciler, componentler, layout'lar, breakpoint'ler ve site stylesheet'i `.wuppy/data/visual.json`'a
  kaydedilir. Site sayfaları bunları `/api/public/visual.css` ve sayfa başına üretilen küçük bir `<style>` ile alır. Her
  kayıt diğer içerik gibi bir Git commit'idir.

## Sınırlar

- Formlar, script'ler, dinamik döngü/bağlamalar, canlı ortak düzenleme (Wuppy düzenleme kilidi kullanır) ve npm
  bağımlılık paneli bu editörün parçası değildir: Wuppy Markdown'ı doğrular ve düz dosya saklar; bunlar ayrı bir
  güvenlik modeli gerektirir.
- Bir Markdown bloğu sayfanın üst düzeyinde kalır (kapsayıcı içine giremez) ve bütün olarak seçilir.
- Kaydedilen satırları elle düzenlemek, her görsel blok tek satırda kaldığı sürece sorun değildir.
- Yerel sitede tuval girdinin canlı sayfasını yükler ve gövdeyi yerinde, temanın kendi header, footer, stil ve
  script'leri içinde düzenler (karanlık mod dahil). Bu, girdiyi `<Content />` ile çizen her Astro temasında çalışır:
  entegrasyon çizildiği yeri `<!--wuppy:body-->` yorumlarıyla işaretler. Temanın link ve formları tuvalde sayfa
  değiştirmez. İşaretli gövde yoksa (kaydedilmemiş veya yayımlanmamış girdi, girdiden üretilmeyen sayfa, uzak site,
  component düzenleme) tuval sitenin stylesheet'i, fontları, `<html>`/`<body>` öznitelikleri ve head inline
  script'leriyle boş bir çerçeveye döner.
