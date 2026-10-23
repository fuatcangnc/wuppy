---
title: Medya kütüphanesi
description: Görsel ve dosyaları yükleyin, düzenleyin, kırpın ve optimize edin.
sidebar:
  order: 4
---

## Yükleme

**Media → Upload to library** ile dosyaları sürükleyip bırakın, panodan yapıştırın veya seçin. Yükleme hemen
başlar; her satır ilerlemeyi gösterir, iptal edilebilir veya yeniden denenebilir. **Retry failed** kalanları yeniden
dener.

Yüklemeler sunucuda denetlenir: gerçek dosya türü içerikten okunur (uzantısı değiştirilmiş dosya reddedilir), SVG
reddedilir ve varsayılan boyut sınırı 5 MB'tır. Ayarlardan boyut sınırı ve izinli türler daraltılabilir.

## Kütüphane

Üç panelli görünüm: arama ve filtreli liste (klasör, tür, tarih, sayfa), büyük önizleme ve ayrıntılar.

- **Details**: alt metin, açıklama, başlık, kredi ve dosya adresi.
- **Edit image**: odak noktası ve kırpma için en-boy oranı ön ayarları.
- **Used in**: dosyanın kullanıldığı yerler. Kullanımdaki bir dosyayı silmek onay ister.
- **Bulk edit** birçok dosyanın alanlarını tek seferde değiştirir.
- **Replace** dosyayı aynı türden bir dosyayla yerinde değiştirir; eskisi Git geçmişinde kalır.
- **Convert to WebP** dönüştürmeyi tarayıcıda yapar ve sonucu yeni bir dosya olarak yükler.

Klasörler üç seviyeye kadar iç içe olabilir; yeniden adlandırılabilir, taşınabilir ve silinebilir (içindeki
dosyalar klasörsüz olarak kalır). Bir temizlik aracı, hiçbir yerde kullanılmayan dosyaları bulur.

## Optimize görseller

`sharp` kuruluysa Wuppy, izinli genişliklerde yeniden boyutlandırılmış WebP, AVIF, JPEG veya PNG varyantları sunar
(`?w=800&format=webp`), bunları uzun ömürlü adreslerle diskte önbelleğe alır ve yüklemede küçük bir yer tutucu ile
görsel boyutunu kaydeder. Şablonlarda `wuppy/site` paketindeki `imageSrcset()` sizin için `srcset` üretir.
