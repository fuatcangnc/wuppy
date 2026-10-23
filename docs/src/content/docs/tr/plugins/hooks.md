---
title: Hook'lar
description: Eklentinin tepki verebildiği olaylar ve bir değişiklik yapılmadan önce çalıştırabildiği denetimler.
sidebar:
  order: 2
---

Bir eklenti hook'larını `manifest.json` içinde listeler (`"hooks": [...]`) ve `plugin.js` içinde tanımlar. İki tür
vardır:

- **Sonra çalışan hook'lar** (`on…`) değişiklik yapıldıktan sonra haber alır. Yan yana çalışırlar, hiçbir şeyi
  değiştiremezler, hata yalnızca kaydedilir. WordPress'teki action'lara benzerler.
- **Önce çalışan hook'lar** (`before…`) değişiklik yapılmadan önce çalışır. Değişikliği reddedebilirler, bazıları
  değiştirebilir de. WordPress'teki filter'lara benzerler ama kuralları daha sıkıdır
  (bkz. [Güvenlik kuralları](#güvenlik-kuralları)).

```js
globalThis.__plugin = {
  beforeContentSave: (event) => (event.data.summary ? undefined : { reject: "Önce bir özet ekleyin." }),
  onContentUpdated: async (event, ctx) => ctx.log(`${event.collection}/${event.slug} değişti`),
};
```

## Sonra çalışan hook'lar

| Hook | Ne zaman | Olay |
| --- | --- | --- |
| `onContentUpdated` | Bir girdi oluşturuldu, kaydedildi ya da geri yüklendi | `{ collection, slug, at }` |
| `onContentDeleted` | Bir girdi çöp kutusuna taşındı | `{ collection, slug, at }` |
| `onMediaUploaded` | Bir dosya yüklendi | `{ url, at }` |
| `onCommentCreated` | Bir ziyaretçi yorumu kaydedildi | `{ id, collection, slug, status, at }` |

Sonra çalışan hook içerik değil, kimlik bilgisi alır. Girdiyi yüklemek için `ctx.content.get` kullanın
(`content.read` gerekir).

## Önce çalışan hook'lar

| Hook | Neden önce çalışır | Olay | Verebileceği yanıt |
| --- | --- | --- | --- |
| `beforeContentSave` | Bir girdi oluşturulur, kaydedilir ya da çöp kutusundan geri yüklenir | `{ collection, slug, isNew, data, body }` | Hiçbir şey, `{ reject }` ya da değiştirilmiş `{ data, body }` |
| `beforeContentDelete` | Bir girdi çöp kutusuna taşınır | `{ collection, slug }` | Hiçbir şey ya da `{ reject }` |
| `beforeMediaUpload` | Bir dosya kaydedilir (Wuppy'nin kendi tür ve boyut denetiminden sonra) | `{ mime, size, replaces? }` | Hiçbir şey ya da `{ reject }` |
| `beforeCommentCreate` | Bir ziyaretçi yorumu kaydedilir | `{ collection, slug, author, body, status }` | Hiçbir şey, `{ reject }` ya da `{ status: "pending" \| "spam" }` |

- **Hiçbir şey** (`undefined`) değişikliği olduğu gibi geçirir.
- **`{ reject: "neden" }`** değişikliği reddeder. Neden (1–500 karakter), deneyen kişiye eklentinin kimliğiyle birlikte
  düz metin olarak gösterilir (HTTP 422, `REJECTED_BY_PLUGIN`). Yorumu reddedilen ziyaretçi de nedeni görür.
- Eklentiler tek tek, önce `wuppy.config` sırasıyla, sonra kuruldukları sırayla çalışır. Her biri bir öncekinin
  döndürdüğünü görür.

## Güvenlik kuralları

Önce çalışan hook'lar güçlüdür: başkalarının işini durdurabilirler. Bu yüzden:

- **Onay gerektirirler.** Önce çalışan hook, site sahibinin onayladığı şeylerin parçasıdır. Yeni bir tane ekleyen
  eklenti yeniden onay bekler. Sonra çalışan hook'lar onayı değiştirmez.
- **Yalnızca eklentinin okuyabildiğini görürler.** `beforeContentSave` ve `beforeContentDelete` yalnızca eklentinin
  `content.read` ya da `content.write` içinde listelediği koleksiyonlarda çalışır. Bir girdiyi yalnızca o koleksiyonda
  `content.write` yetkisi olan eklenti değiştirebilir; salt okuyan eklenti yalnızca reddedebilir.
- **Hata durumunda reddederler.** Eklenti hata fırlatırsa, zaman aşımına uğrarsa, döndüremeyeceği bir şey döndürürse
  ya da boş bir neden verirse değişiklik reddedilir (HTTP 502, `PLUGIN_ERROR`). Hata editöre değil, **Plugins**
  sayfasındaki eklenti kaydına yazılır. Kaydetmeyi yeniden açmak için eklentiyi orada kapatın. Dakikalık çağrı sınırı
  önce çalışan hook'ları reddetmez; böylece bir ziyaretçi yorumu seli editörlerin kaydetmesini durduramaz. Zaman
  aşımı yine her çağrıda geçerlidir.
- **Yorum denetimi yorumu kaybetmez.** `beforeCommentCreate` hata verirse yorum moderasyona alınır.
- **Erişimi genişletemezler.** Eklenti bir girdiyi yayımlayamaz ya da yayından kaldıramaz: `draft` editörün
  verdiği değerde kalır. Yorum eklentisi bir yorumu yalnızca sıkılaştırabilir (beklemede ya da spam), asla
  onaylayamaz. Spam yorum gösterilmez, bildirim e-postası göndermez ve ziyaretçiye moderasyon beklediği söylenir.
- **Değiştirdikleri, editörün yazdığı gibi denetlenir.** Eklentilerden sonra sonuca [Markdown kuralları](/tr/guides/markdown/)
  ve (kaydederken) koleksiyonun şeması uygulanır; böylece bir eklenti araya script sokamaz.
- **İçeriden kaydedemezler.** `ctx.content.put` önce çalışan hook içinde hata verir (hook'ları yeniden çalıştırırdı).
  Bunun yerine değiştirilmiş girdiyi döndürün.
- **Kişisel veri görmezler.** `beforeCommentCreate` adı ve metni alır; e-posta ya da IP adresini asla görmez.

Önce çalışan hook'ların kapsamadıkları: çöp kutusundan kalıcı silme ve **History** içinde bir commit'i geri alma.

## WordPress ve EmDash ile karşılaştırma

Wuppy ikisinin de işe yarayan fikrini (action/filter ya da EmDash'in `before`/`after` hook'ları) alır, ama bir
eklentinin gizli bilgi okumasına ya da ziyaretçinin sayfasında kod çalıştırmasına yol açacak hook'ları dışarıda bırakır:

- **E-posta hook'ları** (`email:beforeSend`, `email:deliver`): bir e-posta eklentisi şifre sıfırlama ve davet
  bağlantılarını görürdü. Eklentiler `email` yeteneğiyle kendi e-postalarını gönderebilir.
- **Sayfa hook'ları** (`page:fragments`, `page:metadata`): herkese açık sayfalardaki script'lerin yeri, kodda gözden
  geçirildikleri sitenin temasıdır. SEO etiketlerini Wuppy kendisi yazar.
- **Öncelik ve `errorPolicy`**: sıra `wuppy.config` sırasıdır ve hata veren önce çalışan hook her zaman değişikliği
  reddeder; böylece bir doğrulayıcı hata verdirilerek atlatılamaz.
- **Cron ve yaşam döngüsü hook'ları**: henüz yok.
