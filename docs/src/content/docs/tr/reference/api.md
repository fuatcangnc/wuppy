---
title: REST API
description: Wuppy API'sini betiklerden ve diğer uygulamalardan çağırma.
---

Yönetim paneli, sizin de çağırabileceğiniz aynı REST API'yi kullanır. Şemanın tamamı OpenAPI 3.1 olarak
`/api/openapi.json` adresinde yayınlanır.

## Kimlik doğrulama

- **Tarayıcı oturumu**: panelin kendi çerezi. Bir şeyi değiştiren her istek `X-Wuppy-Request: 1` başlığını
  göndermelidir (CSRF koruması).
- **API token'ı**: **Users → API tokens** altında oluşturulan `Authorization: Bearer wuppy_…`.

```sh
curl -H "Authorization: Bearer $TOKEN" -H "X-Wuppy-Request: 1" \
  https://example.com/api/content/posts
```

## Kurallar

- **Hatalar** her zaman `{ "error": { "code": "SLUG_TAKEN", "message": "…" } }` biçimindedir. Kodlar OpenAPI
  şemasında listelenir.
- **İzinler**: her uç tam olarak bir izin ister; bkz. [Roller ve izinler](/tr/concepts/roles-permissions/).
- **Çakışmalar**: okumalar bir `ETag` döner. Kaydederken bunu `If-Match` olarak geri gönderin; eskimiş bir yazma
  sunucudaki sürümle birlikte `409 CONFLICT` alır.
- **Yeniden denemeler**: bir `POST` isteğinin yeniden denenmesini güvenli kılmak için `Idempotency-Key` başlığı
  gönderin.
- **Hız sınırları**: yazmalar kullanıcı başına, girişler istemci başına sınırlıdır.
- **TypeScript**: `AppType`, tipli bir API için Hono'nun `hc` istemcisiyle çalışır.
