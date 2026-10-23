---
title: Kullanıcılar ve güvenlik
description: Davetler, roller, iki adımlı giriş, passkey, oturumlar ve API token'ları.
sidebar:
  order: 13
---

## Kullanıcılar

**Users** hesapları rolleriyle listeler. Admin'ler rol değiştirebilir, hesapları devre dışı bırakabilir veya
silebilir, geçici parola verebilir ve iki adımlı girişi sıfırlayabilir. Son aktif admin korunur.

### Davetler

Sahip hesabından sonra genel kayıt yoktur. Kişileri e-postayla davet edin: bağlantı bir kez çalışır ve 7 gün sonra
geçersiz olur. Bekleyen davetler yeniden gönderilebilir veya iptal edilebilir. **Settings → Security → Allowed
domains** davetleri belirli e-posta alan adlarıyla sınırlar.

## Giriş yöntemleri

| Yöntem | Notlar |
| --- | --- |
| Parola + doğrulama kodu | İki adımlı giriş (TOTP) açıldıktan sonra parola tek başına yetmez. Yedek kodlar verilir. |
| Passkey | **Account security** altından passkey ekleyin. `localhost` veya gerçek bir alan adı gerekir. |
| GitHub, Google, Microsoft | Yalnızca sağlayıcıyı **Account security** altında bağlamış mevcut hesaplar için. Asla yeni hesap açmaz. |
| Sihirli bağlantı (e-posta) | Asla hesap açmaz ve iki adımlı girişi açık hesaplara gönderilmez. |

Parolanızı mı unuttunuz? Sıfırlama bağlantısı 30 dakika geçerlidir ve tüm oturumları kapatır.
Giriş denemeleri istemci başına dakikada 5 ile sınırlıdır.

## Hesap güvenliği

Her kullanıcı parolasını değiştirebilir, iki adımlı girişi açabilir, passkey'lerini ve bağlı hesaplarını
yönetebilir, oturumlarını görebilir. Tek bir cihazdan veya hepsinden çıkış yapın. Admin'ler başka bir kullanıcının
oturumlarını kapatabilir.

Oturum süresi `WUPPY_SESSION_DAYS` (varsayılan 7) ile belirlenir ve her `WUPPY_SESSION_UPDATE_HOURS` (varsayılan
24) saatte yenilenir.

## API token'ları

Betikler, CI ve [MCP sunucusu](/tr/ai/api-mcp/) için **Users → API tokens** altında token oluşturun. İzinleri ve
son kullanma tarihini seçin; token'ı istediğiniz an iptal edin. Bir token, sahibinin şu anki yetkisinden fazlasına
sahip olamaz. `Authorization: Bearer wuppy_…` olarak gönderin.

## Denetim kaydı

Girişler, kullanıcı değişiklikleri, token değişiklikleri, ayar değişiklikleri ve yönetilen site işlemleri denetim
kaydına (audit log) yazılır (`audit:read` izni).
