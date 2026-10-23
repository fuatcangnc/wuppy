---
title: Görsel editör
description: Bir sayfayı canlı bir tuvale bloklar yerleştirerek kurun, sonra her girdi gibi MDX olarak kaydedin.
sidebar:
  order: 2.6
---

Görsel editör, bir girdinin gövdesini Markdown yazmak yerine tuvale bloklar ekleyerek kurmanızı sağlar. Bir
koleksiyonu açın, bir girdi seçin ve **Edit with Visual**'a tıklayın. Klasik editörle aynı girdiyi düzenler ve aynı
API ile kaydeder; bu yüzden yetkiler, [MDX kuralları](/tr/guides/mdx/), [eklentilerin önce çalışan hook'ları](/tr/plugins/hooks/),
düzenleme kilitleri ve **History** aynı şekilde çalışır.

Editör [Instatic](https://github.com/corebunch/instatic)'ten (MIT) uyarlanmıştır: aynı sayfa ağacı, düzenleme
işlemleri, component/layout modeli, paneller ve bırakma kuralları, Wuppy'nin dosya tabanlı MDX içeriği ve Git
kayıtları üzerinde.

## Ekran

- **Üst araç çubuğu:** hızlı **Container / Text / Image**, beyaz **Add** grid’i **Add to canvas**’ı açar, **Code**
  tam ekran kod çalışma alanını açar, katman/komut ara (Ctrl/⌘+K), geri/ileri al, editör ayarları, canlı sayfayı aç,
  klasik editöre geç ve kaydet.
- **Explorer** (sol ray): **Layers** alanında arama ve ekleme düğmesi, renkli HTML etiketi pill'leri, modül
  ikonları ve aç/kapat okları vardır; satırları sürükleyerek taşıyın (üst: önüne, alt: arkasına, kapsayıcının ortası:
  içine), yeniden adlandırmak için çift tıklayın, sağ tıkla ikonlu menüden çoğaltın, componentleştirin,
  kopyalayın/kesin/yapıştırın, sarın, modül ekleyin, kilitleyin veya silin. Sürüklerken Instatic tarzı yüzen satır,
  cyan öncesi/sonrası çizgisi ve div/kapsayıcı satırının neredeyse tamamında yeşil iç-vurgu görünür; kapalı
  kapsayıcılar kısa süre sonra açılır.
  **Site** sayfaları, template'leri (kayıtlı layoutlar) ve componentleri Instatic tarzı sayaçlı bölümlerde ve boş
  durumlarla listeler. **Code** site stylesheet'ini ve mevcut MDX kaynağını düzenler. **Media** arama,
  All/Images/Videos filtreleri, list/grid görünümü, görsel/video küçük resimleri ve yükleme düğmeleri sunar.
- **Code görünümü:** arama yapılabilen dosya ağacı (`src/pages`, `src/styles`, `src/components`, `.wuppy/data`),
  breakpoint/zoom önizleme çubuğu, satır numaralı sözdizimi editörü, sekmeler, **Saved/Unsaved** durumu, Ctrl/⌘+S
  kaydı ve altta **Styles/Computed** denetçisi olan Instatic tarzı tam ekran çalışma alanı. Sayfa kaynağı ve site CSS'i
  düzenlenebilir; component/visual JSON dosyaları salt okunurdur. Kayıtlar aynı Git tabanlı içerik ve görsel veri
  API'lerini kullanır. Tek satırlık elle yazılmış HTML görsel düğümlere çevrilir; geçerli Tailwind utility'leri
  kayıtta derlenir (starter'da content için `@source` vardır). Önizleme kayıttan sonra yenilenir; kaydedilmemiş veya
  geçersiz sınıflar (örneğin `text-red-500` yerine `text-red-10`) Tailwind tarafından üretilemez. Kurulu bir GitHub
  teması aktifse yöneticiler `theme: owner/repo` altında `.astro` sayfa ve component dosyalarını da görür; tema
  kaynak dosyaları düzenlenebilir; Astro değişikliklerinin çalışan siteye geçmesi için alt çubuktaki **Rebuild**
  düğmesi temayı yeniden derler ve sunucuyu yeniden başlatır.
- **Framework** (sol ray): shade/tint/şeffaflık renk token'ları, fluid type/space ölçekleri, font stack'leri ve
  stylesheet bağlantıları. **Overview**, **Colors**, **Type**, **Space** sekmeleri.
- **Selectors** (sol ray): ortak class/element selector kütüphanesi; bir selector'ı açıp tüm sayfalarda eşleşen
  elemanları biçimlendirin.
- **Canvas** (orta): sayfa iframe içinde. Seçmek için tıklayın, metni yerinde düzenlemek için çift tıklayın (Enter
  kaydeder, Escape geri alır), sürükleyerek sıralayın, sağ tıkla kopyala/kes/yapıştır, çoğalt, sar, gizle, kilitle,
  layout olarak kaydet, componentleştir, ayır veya sil. **Design/Live** görünümünü ve breakpoint/condition'ı yüzen
  context selector'dan seçin.
- **Properties** (sağ): class pill'leri (selector düzenlemek için tıklayın), responsive/state context'i, blok alanları,
  component parametreleri ve gruplanmış stiller (Layout, Position, Spacing, Size, Typography, Background, Border,
  Effects). Token datalist'leri `--v-*` framework değerlerini önerir. **Componentize** seçili alt ağacı yeniden
  kullanılabilir component yapar.

| Blok | Yazdığı |
| --- | --- |
| Container, Columns, Stack, Row, Card, Hero | diğer blokları tutan semantik kapsayıcılar |
| Heading, Text, Quote, Code | `<h1>`–`<h6>`, `<p>`, `<blockquote>`, `<pre>` |
| Button, Link | `<a>` |
| Image, Video | `<img>` (Properties'ten yükle), `<video controls>` |
| List, Divider, Spacer | `<ul>`/`<ol>`, `<hr>`, boş kapsayıcı |
| Component | bir Visual Component örneği, kendi slot içeriğiyle |
| Markdown | serbest Markdown/MDX metni, aynen korunur |

Kısayollar: **Ctrl/⌘+Z** geri, **Ctrl/⌘+Shift+Z** veya **Ctrl/⌘+Y** ileri, **Ctrl/⌘+D** çoğalt, **Delete** sil,
**Ctrl/⌘+C/X/V** kopyala/kes/yapıştır, **Ctrl/⌘+S** kaydet, **Ctrl/⌘+0** zoom sıfırla, **Ctrl/⌘++/−** zoom,
**Shift+1** sığdır, **Alt+↑/↓** kaydır, **A** inserter, **Escape** selector'dan çık/seçimi bırak. Geri alma 100 adım
tutar; tek alanda yazmak tek adım sayılır.

### Add to canvas

Instatic’teki gibi: solda **Modules / Layouts / Components / Recent** ve canlı sayıları, seçili öğenin önizlemesi;
sağda arama, list/grid geçişi, wireframe küçük resimleri, favoriler ve son kullanılanlar. Modüller kategori rengiyle
ayrılır; kayıtlı layoutlar ve görsel componentler kendi bölümlerinde görünür. HTML yapıştırma sol rayda kalır.

## Neler kaydedilir

Her üst düzey blok gövdeye `data-ve="…"` işaretli tek satır HTML olarak yazılır:

```html
<section data-ve="container" style="padding: 32px 16px"><h2 data-ve="heading">Welcome</h2></section>
```

- Aynı satır `.mdx` ve `.md` girdilerinde geçerlidir; mevcut Markdown sayfaları da görsel olarak düzenlenebilir.
- Editörün yazmadığı her şey (Markdown, componentler, kod blokları) tek bir **Markdown** bloğu olur ve aynen geri
  yazılır.
- Metin karakter referanslarıyla saklanır; `*`, `{`, `<` gibi karakterler yazıldığı gibi görünür, Markdown/JSX olmaz.
- Inline stiller filtrelenir (`;`/`{}`/`<>`/tırnak/ters bölü, `expression()`, `javascript:` yok; `url()` yalnız https
  veya site yolu). Responsive/state override'ları `data-ve-r` içinde taşınır; public site bunları CSS'e çevirir.
- Gizli bloklar `hidden` ile kaydedilir; gövdede kalır ama sitede görünmez.
- Site geneli framework, selector, component ve layout verisi `.wuppy/data/visual.json` içine yazılır; public sayfalar
  bunu `/api/public/visual.css` ve sayfa başına üretilen CSS ile alır. Kaydetmek diğer içerikler gibi Git commit'idir.

## Componentler ve layoutlar

- Bir katmanın context menüsünden veya Properties'teki düğmeden **Create component** yapın. Örnekler component
  markup'ını kendi slot içerikleriyle çizer; **Edit component** tüm örnekleri değiştirir, Explorer → Site'daki
  **Update pages** mevcut component markup'ını kullanan tüm sayfalara yazar.
- **Save as layout** seçili alt ağacı stilleriyle saklar; sonra Add → Layouts'tan ekleyin veya sürükleyin.

## Sınırlar

- Formlar, keyfi script'ler, dinamik döngü/binding'ler, Yjs ortak düzenleme ve npm bağımlılık paneli bu editörün
  parçası değildir: Wuppy MDX'i doğrular ve düz dosya saklar; bunlar ayrı bir güvenlik modeli gerektirir.
- Bir Markdown bloğu sayfanın üst düzeyinde kalır (kapsayıcı içine giremez).
- Kaydedilen satırları elle düzenlemek sorun değildir; yeter ki her görsel blok tek satırda kalsın.
- Tuval sitenin stylesheet'ini ve fontlarını kullanır; Astro'ya özgü componentler placeholder olarak gösterilir.
