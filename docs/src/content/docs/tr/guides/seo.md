---
title: SEO ve genel site
description: Meta etiketleri, site haritası, akışlar, arama ve başlangıç sayfaları.
sidebar:
  order: 11
---

## SEO

- Her kaydın **Page settings** panelinde **General**, **Access control**, **SEO settings**, **Open Graph settings**,
  **Site search settings**, **Schema markup** ve **Custom code** bölümleri vardır.
- **Access control** sayfayı herkese açık veya taslak olarak işaretler; taslaklar yalnızca imzalı önizleme bağlantısıyla açılır.
- **SEO settings** başlık etiketi, meta açıklama, canonical adres ve **Sitemap indexing** anahtarını, arama sonucu
  önizlemesiyle birlikte sunar.
- **Open Graph settings** paylaşım başlığını, açıklamasını ve görselini yönetir. Her alanın “SEO ile aynı” seçeneği
  vardır; siz değiştirene kadar SEO değerini izler.
- **Site search settings** bir sayfayı aramadan çıkarabilir ve ona kendi arama başlığını, açıklamasını ve görselini
  verebilir.
- **Schema markup** sayfa için JSON-LD saklar; **Generate schema markup** sayfa başlığı, açıklaması, görseli ve canonical
  adresinden başlangıç verisi üretir. **Custom code** sayfaya özel head ve body kodu ekler (yalnızca güvendiğiniz kodu
  yapıştırın).
- **Settings → SEO** site geneli varsayılanları ve başlık şablonunu belirler.
- Sayfalar canonical, Open Graph, Twitter ve `hreflang` etiketleri alır; JSON-LD sayfa şemasından yazılır.
- `sitemap.xml` taslakları ve sitemap indekslemesi kapalı sayfaları dışarıda bırakır; hangi koleksiyonları içereceğini
  ve önceliklerini seçin. `robots.txt` da oluşturulur.

## Başlangıç sitesi

Başlangıç şablonunda şunlar bulunur:

- `/rss.xml` adresinde RSS akışı,
- `/search` adresinde yayındaki yazı ve sayfalarda, site araması ayarlarını izleyen istemci tarafı arama,
- kategori, etiket ve yazar arşiv sayfaları,
- sayfalama, okuma süresi ve ilgili yazılar (`wuppycms/site` içindeki `paginate`, `readingTime` ve `related`),
- aramalı bir 404 sayfası,
- içeriğe atlama bağlantısı, görünür odak stilleri ve anlamlı başlıklar.

Genel sayfalar ETag ile önbelleğe alınır ve her commit'te önbellek temizlenir.
