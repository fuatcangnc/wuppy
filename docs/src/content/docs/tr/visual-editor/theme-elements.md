---
title: Tema öğeleri
description: Bir GitHub temasının kendi işaretlemesini tuvalde seçip düzenleyin; değişiklikler .astro dosyalarına, tema Tailwind kullanıyorsa Tailwind class'ı olarak yazılır.
sidebar:
  order: 3
---

Bir [GitHub teması](/tr/guides/github-themes/) etkinken yalnız girdinin blokları değil, temanın kendi işaretlemesi de
canlı sayfasında düzenlenir. Bu dev sunucusunda (`pnpm dev`) çalışır; production'da tema değişikliklerini kaydedip
**Rebuild** kullanın.

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
  `.astro` dosyasına yazılır. Etiket ya da yer değişikliği (taşı, çoğalt, sil) sayfayı yeniler.
- Layers'ta bir tema satırını sürükleyerek öğeyi kendi dosyası içinde taşıyın (bloklardaki kenarlarla aynı). Sağ tık
  menüsünde Insert module after, Duplicate, Move up/down, Select parent, Open in Code ve Delete vardır.
- Bir tema öğesi seçiliyken Add'den ya da Layers'tan eklenen modül tema dosyasına hemen onun arkasına (inline stilli düz
  HTML olarak) yazılır ve seçilir. Seçim yoksa sayfanın bloklarına eklenir. Markdown blokları her zaman sayfanın
  bloklarına gider.
- Kodla üretilen metin ya da öznitelikler (`{...}`, `.map()` öğeleri) Code görünümünde düzenlenir. `Footer.astro` gibi
  ortak bir bileşendeki öğe, onu kullanan her sayfada değişir.

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
- İşaretler onunla geldiği için Astro'nun dev araç çubuğu açık olmalı. Wuppy, temanın kendi ayarı kapatsa bile tema bir
  site için çalışırken onu yeniden açar.
- Tema dosyalarını değiştirmek admin (`site:settings` yetkisi) ister. GitHub'a hiçbir şey push edilmez: düzenlemeler
  sunucuda temanın klasöründe kalır.
