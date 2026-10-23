---
title: GitHub'dan temalar
description: Yönetim panelinde GitHub'daki bir Astro sitesini seçip bu sitenin tasarımı olarak çalıştırın.
sidebar:
  order: 21
---

Yönetim panelinin kenar çubuğundaki **Themes**, GitHub hesabınızdaki Astro sitelerini listeler. Birini seçtiğinizde Wuppy onu sunucuya klonlar, [`wuppy init`](/tr/guides/existing-astro-project/) gibi sarar, derler ve siteyi ona geçirir. Tema yalnız tasarımdır: yazılarınız, sayfalarınız, medya ve menüler sitede kalır, tema değişse de korunur.

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
2. **Wrapping**: `wuppy init` içerik koleksiyonlarını bulur, `wuppy.config.mjs` dosyasını yazar.
3. **Installing packages**: `npm install`.
4. **Building**: site, kendi ayarı hangi adapter'ı kullanırsa kullansın (Cloudflare, Vercel…) Node adapter'ıyla derlenir.
5. **Importing sample content**: temanın kendi `.md` girdileri bir kez siteye kopyalanır (WordPress'teki demo içe aktarma gibi). Sitede aynı adla bulunan girdinin üzerine asla yazılmaz.

Derleme başarılı olunca tema etkinleşir ve sunucu yeniden başlar; sayfa kendiliğinden yenilenir. Hesaplar, şifreler ve oturumlar aynı kalır. Bir adım başarısız olursa hata gösterilir ve mevcut site çalışmaya devam eder.

**Active** bölümü yerleşik siteyi ve burada derlenen her temayı listeler. **Activate** yeniden derlemeden aralarında geçiş yapar. **Rebuild** kurulu bir temayı yeniden derler.

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
- `map`: temanın alan adı ve sitenin alan adı. Tema `pubDate` okur, site `date` saklar. `wuppy init` bilinen adları kendisi yazar (`pubDate`, `publishDate` → `date`; `heroImage`, `image` → `cover`).
- `route`: herkese açık adresleri tema belirler.
- Yalnız temanın kullandığı alanlar (`description`, `pinned`) sitenin koleksiyonuna eklenir, editörler doldurabilir. Temanın zorunlu tuttuğu bir alanı eksik olan girdi, alan doldurulana kadar temada görünmez.

## Tema sayfaları

Temanın Markdown sayfaları (`src/pages/about.md`, `src/pages/docs/intro.mdx`) da içeriktir. Tema etkinleştirilince
sitenin **Pages** koleksiyonuna kopyalanır (temanın `layout` satırı olmadan); admin'de her sayfa gibi düzenlenir.
Tema onları aynı adreste kendi layout'uyla sunmaya devam eder ve her istekte sitedeki girdiyi okur: kaydetmek hemen
görünür, yeniden build gerekmez. Sitede girdisi olmayan sayfa temanın kendi metnini gösterir.

Temanın `.astro` sayfaları (`index.astro`, `about.astro`, `tags/index.astro`, `404.astro`) da **Pages** listesinde
**Theme page** etiketiyle görünür; sitenin bütün sayfaları tek yerde durur. Kendi metinleri temanın kodundadır; girdi
sayfanın başlığını, `template` alanını (dosya, ör. `src/pages/index.astro`), SEO alanlarını ve bir gövdeyi tutar:

- Gövdeye (görsel editörde ya da Body alanında) eklenen bloklar ve tema bileşenleri sayfanın `<main>` öğesinin sonunda,
  `<main>` yoksa son öğesinin içinde çizilir. Görsel editör onları canlı sayfanın üzerinde yerinde düzenler.
- **Edit** ekranındaki **Open in Code view** düğmesi, sayfanın kendi işaretlemesini değiştirmek için `.astro` dosyasını
  görsel editörün Code görünümünde açar.
- Buradaki **SEO title**, **SEO description** ve **noindex**, tema sayfayı sunarken `<title>`, açıklama ve robots
  etiketlerinin yerine geçer.

Sitede aynı adla bir sayfa varsa o korunur ve tema sayfası onun için listelenmez. Parametreli sayfalar
(`[slug].astro`), `_` ile başlayan dosyalar ve uç noktalar (`rss.xml.js`) listelenmez: Code görünümünde düzenlenir.

## Gereksinimler

- Sunucu `node serve.mjs` ile başlatılmalı (Docker imajı bunu yapar) ve kapanınca onu yeniden başlatan bir süreç yöneticisi olmalı; örneğin Docker'ın `restart: unless-stopped` ayarı. Geliştirmede `pnpm dev` (`node dev.mjs`) `astro dev`'i etkin temanın içinde sitenin içeriğiyle çalıştırır; önizleme temadır. Tema değiştirince yeniden başlatın.
- Sunucuda `git` ve `npm`, GitHub'a ve npm kayıt deposuna ağ erişimi.
- Depo, Markdown içerik koleksiyonları olan bir Astro 7 sitesi olmalı. `.mdx` örnek girdileri içe aktarılmaz.

## Bilinmesi gerekenler

- Themes'i yalnız yöneticiler (admin) kullanabilir: kurulum, deponun kurulum betiklerini ve derlemesini sunucuda çalıştırır. Yalnız güvendiğiniz depoları kurun.
- İçerik düzenlemeleri sitenin Git deposuna commit edilir. Görsel editörün Code görünümünde (**theme: owner/repo** kökü) düzenlenen tema kodu yalnız temanın klasörüne kaydedilir; GitHub'a hiçbir şey push edilmez.
- Temanın göreli yolla (`../../assets/x.png`) gösterdiği örnek görseller içe aktarılan girdilerle gelmez; Media'dan değiştirin.
- Derleme depodaki bir sorun yüzünden başarısız olursa (örneğin bir yazıda içerik şemasının zorunlu tuttuğu bir alan eksikse) sorunu GitHub'da düzeltip yeniden **Install**'a basın: hiç derlenmemiş tema baştan klonlanır.
- **Rebuild** GitHub'dan yeni commit çekmez. Güncellemek için sunucuda `.wuppy/themes/<sahip>__<ad>/` klasörünü silip yeniden kurun.
- Tema derlemesi, derlendiği Wuppy sürümünü içerir. Wuppy'yi güncelledikten sonra **Rebuild** düğmesine basın.
- Etkin tema başlatılamazsa `serve.mjs` hatayı loglar ve yerleşik siteyi çalıştırır.
- Yalnız sitenin kökündeki `package.json` kontrol edilir; monorepo alt klasöründeki Astro siteleri listelenmez.
