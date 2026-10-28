---
title: GitHub'dan temalar
description: Yönetim panelinde GitHub'daki bir Astro sitesini seçip bu sitenin tasarımı olarak çalıştırın.
sidebar:
  order: 21
---

Yönetim panelinin kenar çubuğundaki **Themes**, GitHub hesabınızdaki Astro sitelerini listeler. Birini seçtiğinizde Wuppy onu sunucuya klonlar, [`wuppycms init`](/tr/guides/existing-astro-project/) gibi sarar, derler ve siteyi ona geçirir. Tema yalnız tasarımdır: yazılarınız, sayfalarınız, medya ve menüler sitede kalır, tema değişse de korunur.

## GitHub'ı bağlayın

**Themes** sayfasında **Connect GitHub** düğmesine basın. GitHub'ın izin sayfası açılır ve Wuppy'nin herkese açık ve özel tüm depolarınıza erişmesine izin vermenizi ister (`repo` kapsamı). Onayladığınızda **Themes** sayfasına geri dönersiniz ve depolarınız listelenir.

Her admin kendi GitHub hesabını bağlar. Token sitenin veritabanında (`WUPPY_SECRET` ile) şifreli saklanır, tarayıcıya hiç gönderilmez. **Disconnect** onu siler; GitHub'da Settings → Applications altından da iptal edebilirsiniz. GitHub token'ı artık kabul etmezse (iptal edilmiş ya da daha yeni bir girişle değişmişse) Wuppy onu unutur ve **Connect GitHub** yeniden görünür.

### Sunucu ayarı

Sunucuya GitHub OAuth uygulamasının secret'ı bir kez verilir:

1. OAuth uygulamasında (GitHub → Settings → Developer settings → OAuth Apps) **Authorization callback URL** alanını `<WUPPY_URL>/api/themes/github/callback` yapın. Bir uygulamanın tek callback alan adı olur; her alan adı için ayrı uygulama gerekir.
2. Sunucuda `WUPPY_GITHUB_CLIENT_SECRET` değişkenini, uygulama Wuppy'ninki değilse `WUPPY_GITHUB_CLIENT_ID` değişkenini de ayarlayıp sunucuyu yeniden başlatın.

## Depo seçin

Liste; sahibi olduğunuz, katkıcı olduğunuz ya da bir organizasyon üzerinden eriştiğiniz depoları son push'a göre sıralar ve yalnız `package.json` dosyasında Astro olanları gösterir. **Install** düğmesine basın:

1. **Cloning**: depo sunucuda `.wuppy/themes/<sahip>__<ad>/` klasörüne klonlanır.
2. **Wrapping**: `wuppycms init` içerik koleksiyonlarını bulur, `wuppy.config.mjs` dosyasını yazar.
3. **Installing packages**: `npm install`. Astro'su 7.4'ten eski bir tema önce `^7.4.0`'a çıkarılır: eski Astro elementleri kaynak satırlarıyla işaretlemez, bu yüzden görsel editör temanın elementlerini listeleyemez ve seçemezdi. npm yine de eski bir Astro kurarsa (örneğin bir `overrides` kaydı yüzünden), kurulum editörün düzenleyemeyeceği bir tema bırakmak yerine bir mesajla durur. Astro'nun dev araç çubuğunu kapatan bir temada araç çubuğu, tema bir site için çalışırken yeniden açılır; işaretler onunla gelir. Bundan önce kurulmuş bir tema için bir kez **Rebuild** kullanın.
4. **Building**: site, kendi ayarı hangi adapter'ı kullanırsa kullansın (Cloudflare, Vercel…) Node adapter'ıyla derlenir.
5. **Importing sample content**: temanın kendi `.md` girdileri bir kez siteye kopyalanır (WordPress'teki demo içe aktarma gibi). Sitede aynı adla bulunan girdinin üzerine asla yazılmaz.

Derleme başarılı olunca tema etkinleşir ve sunucu yeniden başlar; sayfa kendiliğinden yenilenir. Hesaplar, şifreler ve oturumlar aynı kalır. Bir adım başarısız olursa hata gösterilir ve mevcut site çalışmaya devam eder.

**Active** bölümü yerleşik siteyi ve burada derlenen her temayı listeler. **Activate** yeniden derlemeden aralarında geçiş yapar. **Rebuild** önce o zamandan beri GitHub'a gönderilenleri çeker, sonra temayı yeniden derler. Sunucuda yapılan düzenlemeler (görsel editör, Code görünümü) korunur. GitHub aynı dosyayı değiştirdiyse ya da sildiyse GitHub'ınki kazanır; sunucudaki sürüm tema klasörünün `git stash`'inde kalır. `package.json`, kilit dosyası ve `astro.config` değişiklikleri çekmeden sonra yeniden yapılır; `wuppy.config.mjs` korunur.

## İçerik nerede durur

```
site/
├─ content/posts/, content/pages/   ← girdileriniz (Posts, Pages)
├─ content/<ad>/                    ← temanın diğer koleksiyonları
├─ public/uploads/, .wuppy/data/    ← medya, menüler, ayarlar
└─ .wuppy/themes/<sahip>__<ad>/     ← tema: layout, bileşen, örnek içerik
```

Temanın `wuppy.config.mjs` dosyası hangi koleksiyonunun hangi site koleksiyonunu okuduğunu söyler:

```js
{ name: "blog", dir: "src/content/blog", kind: "posts", map: { pubDate: "date" }, route: "/{slug}", fields: { … } }
```

- `kind: "posts"` / `"pages"`: temanın `blog`'u sitenin Posts'unu, `about`'u sitenin Pages'ini gösterir. `kind` olmayan koleksiyon sitenin `content/<ad>` klasöründe tutulur.
- `map`: temanın alan adı ve sitenin alan adı. Tema `pubDate` okur, site `date` saklar. `wuppycms init` bilinen adları kendisi yazar (`pubDate`, `publishDate` → `date`; `heroImage`, `image` → `cover`).
- `route`: herkese açık adresleri tema belirler.
- Yalnız temanın kullandığı alanlar (`description`, `pinned`) sitenin koleksiyonuna eklenir, editörler doldurabilir. Temanın zorunlu tuttuğu bir alanı eksik olan girdi, alan doldurulana kadar temada görünmez.

## GitHub’a otomatik senkron

GitHub bağlıyken ve bir tema etkinken Wuppy deponun iki tarafını da güncel tutar:

- **Tema kaynağı**: Code view veya görsel editörde yapılan değişiklikler.
- **Site içeriği ve ayarları**: sayfa/yazı, menü, widget, bölüm, taksonomi, byline, içerik tipi, ayar veya görsel editör
  verisi kaydedildiğinde.

Değişiklikler birkaç saniye bekletilip commit edilir ve push edilir. GitHub bu arada ilerlediyse Wuppy otomatik
fetch + rebase yapar; çakışmada canlı tema korunur ve hata **Themes** ekranında görünür. Art arda gelen düzenlemeler
tek commit olur.

Site içeriği ve `.wuppy/data` ayarları tema deposundaki `wuppy-site/` klasörüne yansıtılır; böylece sayfa ayarları,
menüler ve diğer admin CRUD işlemleri de GitHub’da görünür. Tema build’i bu klasörü yok sayar. Webhook sırları
kopyalanmaz, medya dosyaları oraya çoğaltılmaz. Wuppy’nin tema için ürettiği yapılandırma dosyaları (`package.json`,
`wuppy.config.mjs`, build config ve lockfile) push edilmez.

**Themes → Push changes**, otomatik push açılmadan önce diskte kalan değişiklikleri gönderir veya hata sonrası yeniden
dener. **Themes** ekranında `Pushing theme changes…`, son push zamanı veya hata görünür. Otomatik push için GitHub
hesabı bağlı olmalıdır; bağlı değilse tema yerelde çalışmaya devam eder.

Taslak veya özel içerik varsa özel (private) bir depo kullanın. Wuppy her tema sayfasına Open Graph ve Twitter
etiketlerini kendisi ekler; temanın bu tekrarı yapmasına gerek yoktur.

## Tema sayfaları

Temanın Markdown sayfaları (`src/pages/about.md`, `src/pages/docs/intro.mdx`) da içeriktir. Tema etkinleştirilince
sitenin **Pages** koleksiyonuna kopyalanır (temanın `layout` satırı olmadan); admin'de her sayfa gibi düzenlenir.
Tema onları aynı adreste kendi layout'uyla sunmaya devam eder ve her istekte sitedeki girdiyi okur: kaydetmek hemen
görünür, yeniden build gerekmez. Sitede girdisi olmayan sayfa temanın kendi metnini gösterir.

Temanın `.astro` sayfaları (`index.astro`, `about.astro`, `tags/index.astro`, `404.astro`) da **Pages** listesinde
**Theme page** etiketiyle görünür; sitenin bütün sayfaları tek yerde durur. Kendi metinleri temanın kodundadır; girdi
sayfanın başlığını, `template` alanını (dosya, ör. `src/pages/index.astro`), sayfa ayarlarını (SEO, Open Graph, site araması, schema ve custom code) ve bir gövdeyi tutar:

- Gövdeye (görsel editörde ya da Body alanında) eklenen bloklar ve tema bileşenleri sayfanın `<main>` öğesinin sonunda,
  `<main>` yoksa son öğesinin içinde çizilir. Görsel editör onları canlı sayfanın üzerinde yerinde düzenler.
- **Edit** ekranındaki **Open in Code view** düğmesi, sayfanın kendi işaretlemesini değiştirmek için `.astro` dosyasını
  görsel editörün Code görünümünde açar.
- Buradaki **SEO title**, **SEO description** ve **noindex**, tema sayfayı sunarken `<title>`, açıklama ve robots
  etiketlerinin yerine geçer; Open Graph, schema markup ve custom code da uygulanır.

Sitede aynı adla bir sayfa varsa o korunur ve tema sayfası onun için listelenmez. Parametreli sayfalar
(`[slug].astro`), `_` ile başlayan dosyalar ve uç noktalar (`rss.xml.js`) listelenmez: Code görünümünde düzenlenir.

**Pages**'te eklenen ve temada karşılığı olmayan bir sayfa (örneğin `/test`) temanın ana sayfasının
(`src/pages/index.astro`) düzeninde gösterilir: başlık ve alt bilgi kalır, ana sayfanın `<main>` içindekilerin yerine
sayfanın gövdesi gelir. Başlığı sayfanın başlığıdır (ya da SEO başlığı). Görsel editörde bloklar ve tema bileşenleriyle
doldurulur. Ana sayfasında `<main>` olmayan ya da ana sayfası `.astro` olmayan bir tema bu sayfalar için 404 döner;
taslak ya da zamanlanmış sayfa yayınlanana kadar 404'tür.

## Gereksinimler

- Sunucu `node serve.mjs` ile başlatılmalı (Docker imajı bunu yapar) ve kapanınca onu yeniden başlatan bir süreç yöneticisi olmalı; örneğin Docker'ın `restart: unless-stopped` ayarı. Geliştirmede `pnpm dev` (`node dev.mjs`) `astro dev`'i etkin temanın içinde sitenin içeriğiyle çalıştırır; önizleme temadır. Admin'de tema değiştirince yeni temayla kendiliğinden yeniden başlar.
- Sunucuda `git` ve `npm`, GitHub'a ve npm kayıt deposuna ağ erişimi.
- Depo bir Astro 7 sitesi olmalı. Markdown/MDX içerik koleksiyonları isteğe bağlıdır: yoksa da tema kurulur ve sayfaları görsel editörde düzenlenir. `.mdx` örnek girdileri içe aktarılmaz. Etkin temanın gösteremediği bir girdi (başka bir temanın `<Callout>`'u gibi sahip olmadığı bir bileşen ya da bir paketten import) gövdesi olmadan gösterilir ve sunucu günlüğü dosyayı adlandırır; sayfanın geri kalanı yine çalışır.

## Bilinmesi gerekenler

- Themes'i yalnız yöneticiler (admin) kullanabilir: kurulum, deponun kurulum betiklerini ve derlemesini sunucuda çalıştırır. Yalnız güvendiğiniz depoları kurun.
- İçerik düzenlemeleri sitenin Git deposuna commit edilir. GitHub bağlıysa tema kaynağı ve içerik/ayar değişiklikleri ayrıca tema deposuna otomatik commit edilip push edilir. GitHub yoksa sunucuda kalır.
- Temanın göreli yolla (`../../assets/x.png`) gösterdiği örnek görseller içe aktarılan girdilerle gelmez; Media'dan değiştirin.
- Derleme depodaki bir sorun yüzünden başarısız olursa (örneğin bir yazıda içerik şemasının zorunlu tuttuğu bir alan eksikse) sorunu GitHub'da düzeltip yeniden **Install**'a basın: hiç derlenmemiş tema baştan klonlanır.
- Tema derlemesi, derlendiği Wuppy sürümünü içerir. Wuppy'yi güncelledikten sonra **Rebuild** düğmesine basın.
- Etkin tema başlatılamazsa `serve.mjs` hatayı loglar ve yerleşik siteyi çalıştırır.
- Yalnız sitenin kökündeki `package.json` kontrol edilir; monorepo alt klasöründeki Astro siteleri listelenmez.
