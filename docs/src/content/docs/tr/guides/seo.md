---
title: SEO ve genel site
description: Meta etiketleri, site haritası, akışlar, arama ve başlangıç sayfaları.
sidebar:
  order: 11
---

## SEO

- Her kaydın **Page settings** panelinde **General**, **Access control**, **SEO settings**, **Open Graph settings**,
  **Site search settings**, **Schema markup** ve **Custom code** bölümleri vardır.
- **SEO settings** başlık etiketi, meta açıklama, canonical adres ve **Sitemap indexing** anahtarını, arama sonucu
  önizlemesiyle birlikte sunar.
- **Open Graph settings** paylaşım başlığını, açıklamasını ve görselini yönetir. Her alanın “SEO ile aynı” seçeneği
  vardır; siz değiştirene kadar SEO değerini izler.
- **Site search settings** bir sayfayı aramadan çıkarabilir ve ona kendi arama başlığını, açıklamasını ve görselini
  verebilir.
- **Schema markup** sayfa için JSON-LD saklar; **Generate schema markup** sayfa başlığı, açıklaması, görseli ve canonical
  adresinden başlangıç verisi üretir. **Custom code** sayfaya özel head ve body kodu ekler (yalnızca güvendiğiniz kodu
  yapıştırın).
- **Access control** sayfayı herkese açık veya taslak olarak işaretler. Taslaklar yalnızca imzalı önizleme bağlantısıyla
  açılır. Sayfa bazlı şifre koruması bu sürümde yoktur.
- **Settings → SEO** site geneli varsayılanları ve başlık şablonunu belirler.
- `sitemap.xml` taslakları ve sitemap indekslemesi kapalı sayfaları dışarıda bırakır; hangi koleksiyonları içereceğini
  ve önceliklerini seçin. `robots.txt` da oluşturulur.

### Open Graph değerleri nereden gelir?

Wuppy etiketleri sayfa sunulurken kendisi yazar; temanın ayrıca `og:` boilerplate’i eklemesi gerekmez. Her etiketin
değeri şu sırayla seçilir:

| Etiket | İlk seçim | Yedek | Son yedek |
| --- | --- | --- | --- |
| `og:title` | Page settings → Open Graph title | SEO title | Sayfa başlığı, sonra temanın mevcut `<title>` değeri |
| `og:description` | Page settings → Open Graph description | SEO description | Sayfanın mevcut meta description’ı |
| `og:image` | Page settings → Open Graph image | Sayfa kapak görseli | **Settings → SEO → varsayılan paylaşım görseli** |
| `og:url` | Page settings → Canonical URL | Mevcut genel URL | — |

`/uploads/2026/10/photo.png` gibi göreli bir görsel site adresiyle mutlak hale getirilir; etikette
`https://siteniz.com/uploads/2026/10/photo.png` bulunur. Wuppy `og:site_name`, `og:type`, `og:url` ve eşleşen Twitter
kart etiketlerini de ekler. Temada aynı etiket varsa sayfa ayarı onu değiştirir; yoksa Wuppy `<head>` içine ekler.

Görseli değiştirmek için **Pages → sayfa → Page settings → Open Graph settings → Choose image** yolunu kullanıp
kaydedin. Aynı görsel sayfanın paylaşım görseli ve site araması görseli için yedek olarak da kullanılır. Sosyal ağlar
eski kartları önbelleğe alır; görseli değiştirdikten sonra ağın paylaşım debugger’ıyla sayfayı yeniden taratın.

### Schema, custom code ve site araması

- **Generate schema markup**, sayfa başlığı, açıklaması, görseli ve canonical adresinden başlangıç JSON-LD’si üretir.
  AI’ya gönderilmez; yayınlamadan önce üretilen nesneyi kontrol edin. Geçerli JSON `<head>` içine yazılır; geçersiz JSON
  editör tarafından reddedilir.
- **Custom code** yalnızca o sayfaya özel ham head ve body kodudur. Yayınlanan sayfada çalışır; yalnızca güvendiğiniz
  kodu yapıştırın.
- **Site search settings** arama indeksini yönetir: sayfayı aramadan çıkarın veya arama başlığı, açıklaması ve görselini
  değiştirin. Başlangıç temasının genel `/search` sayfası ve admin araması bu değerleri kullanır.

## Başlangıç sitesi

Başlangıç şablonunda şunlar bulunur:

- `/rss.xml` adresinde RSS akışı,
- `/search` adresinde yayındaki yazı ve sayfalarda, site araması ayarlarını izleyen istemci tarafı arama,
- kategori, etiket ve yazar arşiv sayfaları,
- sayfalama, okuma süresi ve ilgili yazılar (`wuppycms/site` içindeki `paginate`, `readingTime` ve `related`),
- aramalı bir 404 sayfası,
- içeriğe atlama bağlantısı, görünür odak stilleri ve anlamlı başlıklar.

Genel sayfalar ETag ile önbelleğe alınır ve her commit'te önbellek temizlenir.
