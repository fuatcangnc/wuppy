---
title: Yapay zekâ asistanı
description: Sitelerinizi okuyup üzerinde çalışan hazır ajanlarla sohbet edin.
sidebar:
  order: 1
---

Hub'daki **Assistant** sayfası, düz bir dille soru sormanızı ve iş vermenizi sağlar. Asistan, sitelerinizden gerçek
veriyi okumak ve izin verirseniz taslak yazmak için araçlar kullanır.

## Kurulum

Hub sunucusunda OpenAI uyumlu bir sağlayıcı ayarlayın:

```sh
WUPPY_AI_BASE_URL=https://api.example.com/v1
WUPPY_AI_API_KEY=...
WUPPY_AI_MODELS=deepseek-v4.1-flash   # virgülle ayrılır; ilki varsayılandır
```

OpenAI uyumlu her uç nokta çalışır (OpenAI, OpenRouter, Ollama, EVREN…). Model araç çağrısını (tool call)
desteklemelidir. Anahtar sunucuda kalır, tarayıcıya asla gönderilmez.

## Ajanlar

| Ajan | Ne yapar |
| --- | --- |
| **Agency assistant** | Erişebildiğiniz tüm sitelerde her türlü iş |
| **Site care** | Sağlık kontrolleri, bağlantı sorunları, güvenlik taramaları, son etkinlik |
| **Client reporter** | Gerçek verilerden müşteri raporu yazar ve site üyesine e-postayla gönderebilir |
| **Content editor** | Müşterinin üslubuyla içerik taslağı yazar ve düzenler |

Bir ajan ve isterseniz bir site seçin. Cevaplar yazıldıkça akarak gelir; asistanın çalıştırdığı her araç
sonucuyla birlikte gösterilir.

## Değişiklikler izninizi gerektirir

Yazma araçları varsayılan olarak kapalıdır. Asistanın içerik oluşturması veya düzenlemesi için o mesajda **Allow
changes** seçeneğini açın. Yeni içerik her zaman **taslak** olarak kaydedilir; **Changes to review** paneli her
birine bağlantı verir, böylece bir kişi kontrol edip yayınlar.

Asistan **sizin** izinlerinizle çalışır: her araç çağrısı, diğerleri gibi denetlenen normal bir API isteğidir.
Araç çıktısı talimat olarak değil, veri olarak ele alınır.

## Bağlam notları

**Sites** sayfasında her sitenin, asistanın önce okuduğu iki notu vardır:

- **Agency playbook** (ajans kuralları): ajansınızın çalışma biçimi (ton, kurallar, neyin kontrol edileceği).
- **Client brief** (müşteri özeti): müşterinin marka dili, hedef kitlesi ve istekleri.

Bunları yalnızca `sites:manage` iznine sahip kullanıcılar okuyup düzenleyebilir.

## Kayıtlı sohbetler

Sohbetler kullanıcı başına saklanır; sizinkileri yalnızca siz listeleyebilir, açabilir veya silebilirsiniz.
Listeden yeni bir sohbet başlatın veya eskisini yeniden açın. Her kullanıcı en çok 200 sohbet saklar.

## Sınırlar

Kullanıcı başına dakikada 20 mesaj, cevap başına en çok 8 araç adımı ve bir sağlayıcı zaman aşımı.
