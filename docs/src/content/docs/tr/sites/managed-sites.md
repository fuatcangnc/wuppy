---
title: Çoklu site yönetimi
description: Birçok Wuppy sitesini tek bir hub'dan yönetin ve her müşteriye yalnızca kendi sitesine erişim verin.
sidebar:
  order: 1
---

Kendi Wuppy kurulumunuz bir **hub** (merkez) olabilir. Diğer Wuppy siteleri (örneğin her müşteri için bir tane)
ona bağlanır ve hepsini hub'ın panelinden yönetirsiniz. Her site kendi sunucusunu, içeriğini ve Git geçmişini
korur; hub yalnızca API'siyle konuşur.

## Site bağlama

1. **Müşteri sitesinde**: **Users → API tokens → Connect to a hub**. Bu, son kullanma tarihli (en çok 365 gün)
   bir *hub token'ı* oluşturur. Riskli izinler (`users:manage`, `site:transfer`, `plugins:manage`) siz açmadıkça
   kapalıdır.
2. **Hub'da**: **Sites → Add site**, sitenin `https://` adresini girin ve token'ı yapıştırın.

Hub adresi kontrol eder, token'ı doğrulamak için siteyi bir kez çağırır ve token'ı şifreli saklar (AES-256-GCM,
anahtar `WUPPY_SECRET`'tan türetilir). Token bir daha gösterilmez, yalnızca son dört karakteri görünür.

## Bir sitede çalışma

Kenar çubuğunun üstündeki **site seçici** ile bir siteye geçin. Panel artık o sitede çalışır: sayfalar, yazılar,
medya, ayarlar ve diğerleri, sanki oraya giriş yapmışsınız gibi. Bir bant hangi siteyi yönettiğinizi gösterir.

Arka planda her istek hub'ın proxy'sinden geçer:

- Yalnızca API yolları iletilir; giriş, token, kullanıcı, davet ve hub'ın kendi uçları engellenir.
- Çerezler ve hub kimlik bilgileriniz asla gönderilmez; hub kendi token'ını ekler ve siteye işlemi **kimin** ve
  **hangi rolle** yaptığını bildirir. Site o kişinin e-postasını kendi denetim kaydına yazar.
- Özel ağ adresleri reddedilir, yönlendirmeler izlenmez ve isteklerin süre ve boyut sınırları vardır.

## Sites sayfası

**Sites** bağlı her siteyi durumuyla listeler. Her site için şunları yapabilirsiniz:

- **Manage this site** (siteye geç), bağlantıyı **Check**, **Replace token** veya **Disconnect**,
- **üyeleri** düzenleme,
- [yapay zekâ asistanı](/tr/ai/assistant/) için **ajans kuralları** ve **müşteri özeti** yazma,
- **güvenlik taraması** çalıştırma, **müşteri raporunu** açma ve aylık kime gideceğini seçme
  (bkz. [Site bakımı](/tr/ai/site-care/)).

Bir token'ın süresi dolduğunda veya iptal edildiğinde site **Connection error** gösterir; düzeltmek için token'ı
değiştirin. Hub'ın `WUPPY_SECRET` değeri değişirse kayıtlı token'lar okunamaz ve her site yeniden bağlanmak ister.

## Müşteriler

Bir müşteriye yalnızca kendi sitesine erişim verin:

1. Sitenin **Members** bölümünü açın ve bir hub kullanıcısı seçin ya da birini e-postayla davet edin.
2. O sitedeki rolünü seçin: `editor`, `author` veya `viewer`.

Davet edilen müşteriler hub'da `client` rolünü alır. Yalnızca üyesi oldukları siteleri görürler (yerel site
görünmez), ilk sitelerinde açılırlar ve başka bir müşterinin sitesine asla ulaşamazlar; bu süzme sunucuda yapılır.
