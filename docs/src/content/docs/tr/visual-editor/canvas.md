---
title: Tuval ve cihazlar
description: Design ve Live modları, cihaz menüsü, zoom, seçme, yerinde metin düzenleme ve sürükle-bırak.
sidebar:
  order: 2
---

Tuval sayfayı sitenin kendi stylesheet'leri, fontları ve `<html>`/`<body>` öznitelikleriyle iframe'ler içinde
gösterir; gördüğünüz ziyaretçinin gördüğüdür.

## Yüzen araç çubuğu

Tuvalin üstündeki küçük yüzen araç çubuğunda şunlar vardır:

- **favori** modülleriniz ([Add](/tr/visual-editor/adding-blocks/) içinde yıldızlayın) tek tıkla ekleme düğmeleri
  olarak, ve **Add** (**A**);
- tuval modu **Design / Live**;
- **cihaz** menüsü: geçerli cihazı (**Desktop**, **Tablet** veya **Mobile**) gösteren bir açılır menü;
- Design modunda uzaklaştır, zoom oranı (tıklayınca %100), yakınlaştır ve **Fit**.

## Design ve Live

- **Design** tek çerçeve gösterir; önce Desktop (temel genişlik, 1440px). Cihaz menüsü onu Tablet breakpoint'ine (600px
  ile 1100px arasındaki ilk breakpoint) ya da Mobile'a (600px altındaki ilk) geçirir; Properties'teki bağlam seçici tüm
  breakpoint'lere ulaşır. Tekerlek kaydırır, Ctrl/⌘ + tekerlek yakınlaştırır, **Fit** çerçeveyi sığdırır.
- **Live** cihazın genişliğinde, ziyaretçinin gördüğü gibi tek çerçeve gösterir.
- Design'da çerçeve sayfası kadar uzundur; bu yüzden sayfa CSS'indeki `vh` birimleri (`min-h-screen`,
  `calc(100vh - 5rem)`) gerçek bir cihazdaki gibi 900px yüksekliğinde bir ekrana göre ölçülür. Böyle olmasa ekran
  boyunda bir bölüm çerçeveyle birlikte büyür ve sayfanın geri kalanını görünmez yapardı.

## Seçme ve düzenleme

- Bloğa tıklayınca seçilir. **Breadcrumbs** sayfadan ona giden yolu gösterir; bir parçaya tıklayınca üst öğe seçilir.
  **Escape** önce üst öğeyi seçer, sonra seçimi kaldırır.
- Metne çift tıklayınca yerinde düzenlenir: tek satırlık blokta **Enter**, çok satırlıda Ctrl/⌘+Enter onaylar
  (Shift+Enter satır ekler), **Escape** geri alır.
- Blokları sürükleyerek sıralayın: üst veya alt kenar önüne/arkasına, container'ın ortası içine yerleştirir.
- Seçili bloğun küçük bir araç çubuğu (sürükleme tutamacı, üst öğeyi seç, arkasına ekle, çoğalt, sil) ve sağ tık menüsü
  (kopyala/kes/yapıştır, çoğalt, container'a sar, gizle, kilitle, layout olarak kaydet, componentize, detach, sil) vardır.
- Markdown blokları sitenin işlediği gibi işlenmiş görünür (sunucu bunları kayıttaki gibi kontrol eder). Kaynakları
  Properties'te düzenlenir.

## Temanın canlı sayfasında

Yerel sitede tuval girdinin canlı sayfasını yükler ve gövdeyi yerinde, temanın kendi header, footer, stil ve
script'leri içinde düzenler (karanlık mod dahil). Bu, girdiyi `<Content />` ile çizen her Astro temasında çalışır:
entegrasyon çizildiği yeri `<!--wuppy:body-->` yorumlarıyla işaretler. Temanın link ve formları tuvalde sayfa
değiştirmez.

Gövdenin etrafındaki tema öğeleri de seçilip düzenlenebilir: bkz. [Tema öğeleri](/tr/visual-editor/theme-elements/).

İşaretli gövde yoksa (kaydedilmemiş veya yayımlanmamış girdi, girdiden üretilmeyen sayfa, uzak site, component
düzenleme) tuval sitenin stylesheet'i, fontları, `<html>`/`<body>` öznitelikleri ve head inline script'leriyle boş bir
çerçeveye döner.
