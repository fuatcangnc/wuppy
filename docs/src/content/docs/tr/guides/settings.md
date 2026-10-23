---
title: Ayarlar, temalar ve webhook'lar
description: Site kimliği, SEO varsayılanları, e-posta, medya sınırları, güvenlik, yedekler, temalar ve webhook'lar.
sidebar:
  order: 14
---

Her ayar değişikliği bir commit ve bir denetim kaydıdır. Ayarlar geri okunurken gizli değerler maskelenir.

| Bölüm | Neleri ayarlarsınız |
| --- | --- |
| General | Site adı, adresi, logo, favicon, saat dilimi, varsayılan dil |
| SEO ve sosyal | Varsayılan başlık ve açıklama, paylaşım görseli, canonical, `noindex`, sosyal hesaplar |
| Email | Sağlayıcı (console, Resend veya SMTP), gönderen, şablonlar, **Send test email** düğmesi |
| Media | Yükleme boyut sınırı ve izinli dosya türleri (yalnızca varsayılandan sıkı olabilir) |
| Comments | Açık/kapalı, moderasyon, bildirim adresi |
| Security | Oturum süresi, davet için izinli alan adları, iki adımlı giriş politikası |
| Backups | Elle yedek, zamanlama, kaç yedeğin tutulacağı, indirme |

## E-posta

- **console** e-postaları sunucu günlüğüne yazar (geliştirme için).
- **Resend** için `RESEND_API_KEY` gerekir.
- **SMTP** her sağlayıcıyla çalışır (örneğin Amazon SES); parola `SMTP_PASSWORD` değişkeninden okunur.

Davet, parola sıfırlama ve sihirli bağlantı e-postaları burada düzenleyebileceğiniz `{{değişken}}` içeren
şablonlardır.

## Yedekler

Yedek; içeriğinizi ve site verilerinizi içeren tek bir dosyadır. İndirin veya başka bir sitede **Import** ile geri
yükleyin. Zamanlanmış yedekler yeniden başlatmadan sonra devreye girer.

## Temalar

**Themes** kurulu temaları listeler ve birini etkinleştirir. Panelin kendisinde açık, koyu ve sistem modları ile
renk ön ayarları vardır.

## Webhook'lar

Webhook'lar `content.updated`, `content.deleted`, `content.reverted` veya `media.uploaded` olaylarından sonra
adresinizi çağırır. JSON gövdesinde olay türü, koleksiyon, slug, commit ve zaman bulunur. Gizli anahtar
verilirse her istekte `X-Wuppy-Signature: sha256=<gövdenin HMAC'i>` başlığı gelir. Gönderimler en iyi çaba
iledir (yeniden deneme yok) ve özel ağ adresleri reddedilir.
