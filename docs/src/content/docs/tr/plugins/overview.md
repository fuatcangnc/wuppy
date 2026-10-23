---
title: Eklentiler
description: Önce izin isteyen, sandbox içinde çalışan eklentilerle Wuppy'yi genişletin.
sidebar:
  order: 1
---

Eklentiler, süre ve bellek sınırlı bir WebAssembly (QuickJS) sandbox'ında çalışır. Bir eklenti yalnızca
manifestinde beyan ettiğini (**yeteneklerini**) yapabilir ve admin bu yetenekleri düz bir dille onaylar. Yüklenemeyen
veya kurallarını çiğneyen eklenti kapatılır; site çalışmaya devam eder.

## Yetenekler

Onaylanırsa bir eklenti:

- içerik, medya ve yorum olaylarına tepki verebilir, bir değişikliği yapılmadan önce denetleyebilir (reddedebilir
  ya da değiştirebilir); bkz. [Hook'lar](/tr/plugins/hooks/),
- içerik yazabilir (`content.write`),
- e-posta gönderebilir (`email`, dakikada 10),
- `WUPPY_PLUGIN_<ID>_<AD>` ortam değişkenlerinden gizli değer okuyabilir,
- izinli internet adreslerini çağırabilir (her çağrı kaydedilir),
- `/api/plugins/<id>/*` altında uç sunabilir ve panele sayfa ekleyebilir.

Bir güncelleme daha fazlasını isterse eklenti yeniden onaylanana kadar kapalı kalır.

## Kurulum

- **Registry'den**: **Plugins** tanımlı registry'lerde arar, kurar ve mevcut güncellemeleri gösterir. Paketler
  imzalıdır (Ed25519) ve sağlama toplamıyla sabitlenir; her registry'nin kendi güvenilir anahtarları vardır. Bozuk
  bir registry diğerlerini etkilemez.
- **Klasörden**: onay hash'iyle birlikte `wuppy.config` dosyasına ekleyin:

```sh
pnpm wuppy plugin hash plugins/search
```

```js
plugins: [{ dir: "plugins/search", approve: "<hash>" }],
```

**Plugins** her eklentinin durumunu, sürümünü, kaynağını, yeteneklerini, son hatasını, günlüklerini, çağrı ve hata
sayılarını ve ayarlarını gösterir. Eklentiler açılıp kapatılabilir, ayarlanabilir ve (registry'den kurulduysa)
kaldırılabilir.

## Eklenti yazma

`wuppy-plugin` komutu eklentileri oluşturur, derler ve imzalar:

```sh
wuppy-plugin init my-plugin       # manifest.json + plugin.js
wuppy-plugin validate my-plugin   # manifesti doğrula
wuppy-plugin build my-plugin      # kod beyan edilmemiş bir yetenek kullanırsa başarısız olur
wuppy-plugin keygen               # yeni bir Ed25519 anahtar çifti
wuppy-plugin pack my-plugin <key> # imzalı registry paketi ve indeks kaydı
```
