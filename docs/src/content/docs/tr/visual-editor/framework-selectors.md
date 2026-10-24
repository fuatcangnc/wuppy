---
title: Framework ve seçiciler
description: Site geneli tasarım token'ları, ortak CSS seçicileri, breakpoint ve koşullar.
sidebar:
  order: 7
---

## Framework

**Overview**, **Colors**, **Type** ve **Space** sekmelerinde site geneli tasarım token'ları:

- sınıf öneki, kök font boyutu ve akışkan ölçeklerin en küçük/en büyük ekran genişliği;
- isteğe bağlı koyu değerli renkler, en fazla 9 koyu ve 9 açık ton, şeffaf varyantlar ve utility sınıfları;
- akışkan **type** ve **space** ölçekleri (en küçük/en büyük boyut ve oran, adım adları, temel adım)
  hesaplanır;
- isteğe bağlı `https` stylesheet bağlantılı font yığınları.

Her token bir CSS değişkeni, utility'ler açıksa bir utility sınıfı da olur (varsayılan önek `v-`). Properties
girişleri bunları önerir.

## Selectors

Ortak seçici kütüphanesi (`.card`, `h2`, `.hero > p`…). Birini açınca her sayfada eşleşen tüm öğeleri, Properties ile
aynı bağlam ve durum seçenekleriyle stillendirirsiniz. Sınıf seçicileri seçici alanında önerilir.

## Ayarlar

Üst çubuktaki dişli editör ayarlarını açar:

- temel (masaüstü) çerçeve genişliği;
- bağlam seçici ve cihaz menüsü için **breakpoint'ler** (max-width, önce masaüstü; en fazla 8), her biri id, etiket ve
  genişlikle;
- **koşullar**: `@media`, `@container` veya `@supports` sorguları, en fazla 20;
- kısayol listesi.

Bunların hepsi `.wuppy/data/visual.json`'a kaydedilir (bkz. [Kayıt ve sınırlar](/tr/visual-editor/saving/)).
