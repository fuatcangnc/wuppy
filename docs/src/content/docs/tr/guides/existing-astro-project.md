---
title: Mevcut Astro projesi
description: Elinizdeki Astro sitesini içeriğini taşımadan Wuppy ile sarın; düzenlemeler anında yayında.
sidebar:
  order: 16
---

Siteniz Git deposunda duran ve içeriği Markdown olan bir Astro projesiyse Wuppy onun üzerine oturabilir. Dosyalar yerinde kalır, sayfalarınız ve tasarımınız değişmez. Yönetim panelindeki her düzenleme aynı depoda bir commit olur.

## Projeyi sarmak

Proje kökünde:

```sh
npx wuppycms init
npm install
npm run dev   # sonra /admin adresini açın
```

Ya da klonlayıp tek adımda sarın:

```sh
npx wuppycms import https://github.com/acme/site.git acme-site
```

### GitHub'dan depo seçin

Yönetim panelinde **Themes** aynı işi sunucuda yapar: bkz. [GitHub'dan temalar](/tr/guides/github-themes/). Komut satırında, kendi GitHub depolarınızdan seçmek için `wuppycms import` komutunu adres vermeden çalıştırın:

```sh
npx wuppycms import
```

Sahibi olduğunuz, katkıcı olduğunuz ya da bir organizasyon üzerinden eriştiğiniz depoları son push'a göre sıralar ve yalnız `package.json` dosyasında Astro olanları gösterir. Özel depolar işaretlenir. İstediğinizin numarasını yazın: depo adıyla bir klasöre klonlanır ve sarılır.

Bu, [GitHub CLI](https://cli.github.com/) kullanır; özel depolar kendi girişinizle çalışır. Kurun ve bir kez `gh auth login` çalıştırın. Monorepo'nun alt klasöründeki Astro sitesi listelenmez; onun adresini verin.

`wuppycms init` şunları yapar:

- `src/content.config.ts` (ya da `src/content/config.ts`) dosyasını okur ve `.md` dosyası olan her koleksiyonu alır. Koleksiyonun adı `export const collections` içindeki anahtarıdır (`post: postCollection` → `post`). JSON/YAML veri koleksiyonları, uzak loader'lar ve küçük harf, rakam ve tire dışında karakter içeren adlar (`blogPosts`) "atlandı" diye listelenir, dokunulmaz. İçerik ayarı olmayan projelerde `src/content/<ad>/` klasörleri okunur.
- Markdown koleksiyonu olmayan bir proje de `collections: []` ve bir uyarıyla sarılır: admin, medya, menüler, ayarlar ve görsel editör çalışır; yazı veya sayfa yönetmek için sonradan koleksiyon eklenebilir.
- Her alanı dosyalardaki frontmatter'dan tahmin eder: tarih, boolean, sayı, metin listesi, görsel (anahtar adından ya da dosya uzantısından), uzun metin ve düz metin. Her dosyada bulunan alan zorunlu olur. Tanımadığı anahtarlar kayıtta yine korunur.
- Her koleksiyonun public adresini `getCollection("<ad>")` çağıran `[slug]` ya da `[...slug]` sayfasından bulur.
- `wuppy.config.mjs` dosyasını yazar, `astro.config` içindeki `integrations`'a `wuppycms()` ekler, adapter yoksa Node adapter'ı ekler.
- `@astrojs/mdx` ekler, `.md` glob'larını `.mdx` için genişletir ve `.mdx` dosyalarında bulduğu bileşenleri izin listesine alır. `wuppycms mdx-to-md` bileşen içermeyen `.mdx` dosyalarını hâlâ `.md`'ye çevirebilir.
- `package.json`'a `wuppycms` (gerekirse `@astrojs/node`), `.gitignore`'a Wuppy satırlarını, `.env`'e rastgele bir `WUPPY_SECRET` ekler.

Hiçbir şeyin üzerine yazılmaz: `wuppy.config.mjs` zaten varsa komut `--force` verilmedikçe durur. `astro.config` güvenle değiştirilemeyecek biçimdeyse elle eklenecek satırı yazdırır.

Oluşan `wuppy.config.mjs` dosyasını gözden geçirin, o bir başlangıç noktası. Bir `string` alanı `select` yapabilir, `help` metni ekleyebilir ya da bulunamayan `route` değerini yazabilirsiniz.

## Sitenin zaten sunduğu adresler

Wuppy `/sitemap.xml`, `/robots.txt` ve `/rss.xml` sunar. Projede bu dosyalardan biri zaten varsa (örneğin `public/robots.txt`), `init` Wuppy'nin sürümünü kapatır. `@astrojs/sitemap` `/sitemap-index.xml` yazdığı için çakışmaz:

```js
integrations: [wuppycms({ robots: false }), sitemap()],
```

`src/pages/admin`, `src/pages/api` ya da `src/pages/uploads` varsa uyarır, çünkü Wuppy bu adresleri kullanır.

## Anında yayın

Yönetim panelinde kaydedilen değişiklik, sayfa bir sonraki açılışında public sitede görünür. Yeniden derleme yok, hiçbir yere push edilmez: sunucu kendi proje kopyasındaki dosyaları düzenler ve orada commit eder. Böylece her değişikliğin geçmişi kalır ve geri alınabilir.

Sayfalarınız değişmez. `astro:content` içinden `getCollection()`, `getEntry()` ve `render()` çağırmaya devam ederler; `wuppy.config.mjs` içindeki koleksiyonlar için bunlar artık dosyaları diskten okur:

- Derlemeden beri değişmeyen dosya, Astro'nun derlediği hâliyle sunulur.
- Yeni ya da düzenlenmiş `.md` dosyası koleksiyonun kendi şemasıyla ayrıştırılır ve Astro'nun Markdown işleyicisiyle çizilir.
- Koleksiyon okuyan sayfalar derleme yerine istek anında çizilir. Böyle bir sayfada `getStaticPaths()` varsa Wuppy onu her istekte çağırıp sayfanın props'larını bulur; eşleşen yol yoksa sitenin 404 sayfasıyla cevap verir. Koleksiyon okumayan sayfalar statik kalır.
- Çizilen sayfalar bir sonraki kayda kadar önbellekte tutulur; ek iş her değişiklikte bir kez yapılır.

Derleme sırasında Astro bu sayfalar için `getStaticPaths() ignored in dynamic page` yazar. Bu beklenen bir durumdur; `prerender = true` eklemeyin, yoksa sayfa güncellenmez.

Kapatıp her değişiklikte yeniden derlemeye dönmek için: `wuppycms({ live: false })`.

Değişiklikleri Git sunucunuza göndermek isterseniz sunucuda istediğiniz zaman kendiniz `git push` yapın. Wuppy asla push etmez.

## Bilinmesi gerekenler

- Düzenlenen Markdown, Astro'nun varsayılan Markdown ayarlarıyla çizilir. Ayarınızdaki remark/rehype eklentileri ve göreli yolla verilen görseller (`./foto.jpg`) bir sonraki derlemeden sonra uygulanır. `public/` altındaki ya da Wuppy ile yüklenen görseller hemen çalışır.
- Projenin kendi `.mdx` dosyaları panelde listelenmez, derlendiği gibi sunulur.
- `@astrojs/sitemap` yalnız derleme sırasında üretilen sayfaları listeler. Wuppy'nin `/sitemap.xml` dosyası koleksiyon sayfalarını listeler; onu `robots.txt` içine `sitemap-index.xml` yanına ekleyin.
- Yönetim paneli bir sunucu ister: sarılmış site Node adapter ile sunucu rotaları kazanır. Statik olan sayfalar statik kalır.
