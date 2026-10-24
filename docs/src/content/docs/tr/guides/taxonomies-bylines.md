---
title: Kategoriler, etiketler ve yazarlar
description: İçeriği gruplayın ve emeği geçenleri belirtin.
sidebar:
  order: 8
---

## Taksonomiler

Bir taksonominin adı, slug'ı ve uygulandığı koleksiyonlar vardır; **hiyerarşik** (kategoriler gibi) veya **düz**
(etiketler gibi) olabilir.

- Kategoriler üst kategori ve sıralamayla bir ağaç oluşturur.
- Etiketler yeniden adlandırılabilir ve birleştirilebilir.
- Her terimin slug'ı, açıklaması ve kayıt sayısı vardır.

Başlangıç şablonunda kategori ve etiket arşiv sayfaları bulunur; kendi şablonlarınızda `wuppycms` paketindeki
`getTaxonomy()` yardımcısını kullanın.

## Yazar profilleri (Bylines)

Byline, herkese açık bir yazar profilidir: ad, slug, avatar, biyografi, sosyal bağlantılar ve gizli bir e-posta.
Kullanıcı hesaplarından ayrıdır; böylece misafir yazarlar ve fotoğrafçılar da belirtilebilir.

- Bir kayda, her biri bir kredi rolüyle (yazar, editör, fotoğrafçı…) bir veya birden çok byline atayın.
- **Byline schema** profillere sıralama ve zorunluluk ayarıyla kendi alanlarınızı ekler (metin, görsel, URL, sosyal).
- Byline'lar çevrilebilir.
- Başlangıç şablonu yazar sayfalarını `/authors/[slug]` adresinde gösterir; şablonlarda `getByline()` kullanın.
