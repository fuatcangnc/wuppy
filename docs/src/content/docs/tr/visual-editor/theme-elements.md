---
title: Tema öğeleri
description: Bir GitHub temasının kendi işaretlemesini tuvalde seçip düzenleyin; değişiklikler .astro dosyalarına, tema Tailwind kullanıyorsa Tailwind class'ı olarak yazılır.
sidebar:
  order: 3
---

Bir [GitHub teması](/tr/guides/github-themes/) etkinken yalnız girdinin blokları değil, temanın kendi işaretlemesi de
canlı sayfasında düzenlenir. Bu hem dev sunucusunda (`pnpm dev`) hem production sunucusunda çalışır. Production'da her
düzenleme (metin, class, stil, ekleme, silme, çoğaltma, taşıma, etiket) canlı sitede hemen, ziyaretçiler için de görünür:
temanın dosyasına yazılır ve tema yeniden derlenene kadar derlenmiş sayfaların üstüne uygulanır. Bu derleme, düzenlemeye
bir buçuk dakika kadar ara verince arka planda kendiliğinden çalışır; çalışırken site açık kalır ve düzenlemeye devam
edebilirsiniz (sırasında düzenleme gelen derleme bırakılır, yenisi yapılır). Build'in hiç görmediği bir Tailwind class'ının CSS'i temanın kendi Tailwind'iyle hemen
üretilir. Eklediğiniz bir öğe derlemeden önce de yeniden düzenlenebilir. Code view'da (ya da AI geri almasıyla) yapılan
değişiklik o derlemeden sonra görünür; dokunmadığı öğeler bu arada düzenlenebilir kalır.

## Seçme

- Blokların dışındaki herhangi bir öğeye tıklayınca seçilir. Properties etiketini ve dosyasını
  (`src/components/Hero.astro`) gösterir.
- **Layers** temanın öğelerini de listeler (etiket ve metin ya da ilk class). Sayfanın blokları (**body**) temanın onları
  çizdiği yerdedir. Satıra tıklayınca öğe tuvaldeki gibi seçilir; arama tema öğelerini etiket, metin ya da class ile
  bulur.

## Düzenleme

- Metnini, class'larını, inline stilini ve özniteliklerini düzenleyin, etiketini değiştirin, yukarı/aşağı taşıyın,
  çoğaltın, silin ya da dosyayı [Code görünümünde](/tr/visual-editor/code-view/) açın. Yalnız metin içeren bir öğeye çift
  tıklayınca yerinde düzenlenir.
- Metin, class, stil ve öznitelikler yazarken tuvalde değişir ve kısa bir duraklamadan sonra sayfa yenilenmeden temanın
  `.astro` dosyasına yazılır. Etiket değiştirmek, taşımak ya da çoğaltmak sayfayı yeniler; silmek yenilemez.
- Layers'ta bir tema satırını sürükleyerek öğeyi kendi dosyası içinde taşıyın (bloklardaki kenarlarla aynı). Sağ tık
  menüsünde Insert module after, Duplicate, Move up/down, Select parent, Open in Code ve Delete vardır.
- Bir tema öğesi seçiliyken Add'den ya da Layers'tan eklenen modül tema dosyasına hemen onun arkasına (inline stilli düz
  HTML olarak) yazılır ve seçilir. Seçim yoksa sayfanın bloklarına eklenir. Markdown blokları her zaman sayfanın
  bloklarına gider.
- Kodla üretilen metin ya da öznitelikler (`{...}`, `.map()` öğeleri) Code görünümünde düzenlenir. `Footer.astro` gibi
  ortak bir bileşendeki öğe, onu kullanan her sayfada değişir.
- Bir yerde birkaç kez kullanılan bileşen (sayfa bölümündeki `<SectionHeader … />`) her kullanımı ayrı seçilir. Dış
  öğesinde class düzenlemesi, taşıma, çoğaltma, silme ve yanına ekleme yalnız o kullanımı değiştirir: class o çağrının
  `className`'ine (`.astro`'da `class`) yazılır, bileşenin bir class'ı temanın `tailwind-merge`'üyle değiştirilir
  (`gap-5` yerine `gap-8`). İçindeki öğeler ve diğer düzenlemeler her kullanımı değiştirir; Properties hangisi olduğunu
  söyler. `.map()` ile üretilen kopyalar birlikte seçilir.
- Kodla kurulan class listesi (`className={cn("flex gap-5", …)}`) içindeki metinlerden düzenlenir: kaldırılan class
  onlardan çıkar, eklenen ilkine girer.

## Denetçi

Tam denetçidir: metin, etiket (`p`, `h2`, `section`…), tüm stil grupları (Layout, Position, Size, Spacing,
Typography, Background, Border, Effects, Interaction) ve HTML öznitelikleri; sayfa bloğuyla aynı ikonlu kontrollerle
(bkz. [Properties](/tr/visual-editor/properties/)). **Styles / Attributes** sekmeleri, class pill'leri, bölüm kartları,
sağ stil rayı ve **Search styles** de ortaktır. Boş alanlar tarayıcının hesapladığı değeri gösterir.

## Tailwind temaları

Tema Tailwind 4 kullanıyorsa stiller class olarak kaydedilir:

| Ayarladığınız | Kaydedilen |
| --- | --- |
| `align-self: center` | `self-center` |
| `320px` genişlik | `w-[320px]` |
| utility'si olmayan bir özellik | arbitrary property, `[filter:blur(4px)]` |
| bir breakpoint ya da durumdaki stil | `max-[768px]:…`, `hover:…` |

Tailwind değeri (`4`, `full`, `red-500`) ya da CSS (`320px`, `#fff`) yazılabilir. Başka variant'lardaki class'lar
korunur. Bağlam ve durum kontrolleri rayın Context & state düğmesinden açılır. Tailwind kullanmayan temada stiller
inline `style` olur.

## Gereksinimler

- Astro 7.4 veya üstü. Eski Astro öğeleri kaynak dosya ve satırıyla işaretlemez; bu yüzden listelenemez ve seçilemezler.
  Tema kurulurken Astro'su `^7.4.0`'a çıkarılır; daha önce kurulmuş bir tema bir kez **Rebuild** ister.
- Dev sunucusunda işaretler Astro'nun dev araç çubuğuyla gelir; Wuppy, temanın kendi ayarı kapatsa bile tema bir site
  için çalışırken onu yeniden açar. Production build aynı işaretleri Wuppy'den alır; bu değişiklikten önce derlenmiş bir
  tema bir kez **Rebuild** ister. Ziyaretçilere hiç gitmezler: yalnız editörün tuvali (`?wuppy-visual`) alır.
- Bir bileşenin koddan aldığı metin (kullanıldığı yerde `title="…"` verilen `<h2>{title}</h2>` ya da bir veri
  dizisinden `{item.title}`) yazıldığı yerde düzenlenir: eski metin temanın `src/` kodunda tırnak içinde tam bir kez
  geçiyorsa o metin değişir. Birden çok yerde geçen ya da parçalardan oluşan metin Code görünümünde düzenlenir.
- Sunucuda çizilen React bileşenleri (`.tsx`/`.jsx`) `.astro` dosyaları gibi düzenlenir. Wuppy HTML öğelerini kendisi
  işaretler ve düzenleme React'in yazımıyla kaydedilir: `class` `className` olur, `style` bir nesne
  (`style={{ "paddingTop": "1rem" }}`), eklenen boş etiketler kendini kapatır. Kodla üretilen `className` ya da `style`
  (`className={cn(...)}`) salt okunur kalır; Code görünümünde düzenleyin.
- Tema dosyalarını değiştirmek admin (`site:settings` yetkisi) ister. GitHub'a hiçbir şey push edilmez: düzenlemeler
  sunucuda temanın klasöründe kalır.
