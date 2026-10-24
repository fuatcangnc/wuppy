---
title: SEO ve genel site
description: Meta etiketleri, site haritası, akışlar, arama ve başlangıç sayfaları.
sidebar:
  order: 11
---

## SEO

- Her kaydın bir **SEO** paneli vardır: başlık, açıklama, görsel, canonical adres ve `noindex`; arama sonucu ve
  sosyal paylaşım önizlemesiyle.
- **Settings → SEO** site geneli varsayılanları ve başlık şablonunu belirler.
- Sayfalar canonical, Open Graph, Twitter ve `hreflang` etiketleri alır; JSON-LD yardımcıları da vardır.
- `sitemap.xml` taslakları dışarıda bırakır; hangi koleksiyonları içereceğini ve önceliklerini seçin. `robots.txt`
  da oluşturulur.

## Başlangıç sitesi

Başlangıç şablonunda şunlar bulunur:

- `/rss.xml` adresinde RSS akışı,
- `/search` adresinde yayındaki yazılarda istemci tarafı arama,
- kategori, etiket ve yazar arşiv sayfaları,
- sayfalama, okuma süresi ve ilgili yazılar (`wuppycms/site` içindeki `paginate`, `readingTime` ve `related`),
- aramalı bir 404 sayfası,
- içeriğe atlama bağlantısı, görünür odak stilleri ve anlamlı başlıklar.

Genel sayfalar ETag ile önbelleğe alınır ve her commit'te önbellek temizlenir.
