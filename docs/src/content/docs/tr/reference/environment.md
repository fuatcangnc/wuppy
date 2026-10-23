---
title: Ortam değişkenleri
description: Wuppy'nin ortamdan okuduğu tüm ayarlar.
---

| Değişken | Zorunlu | Anlamı |
| --- | --- | --- |
| `WUPPY_SECRET` | evet | En az 32 rastgele karakter. Oturumları ve önizleme bağlantılarını imzalar, yönetilen site token'larını şifreler. Değiştirmeyin. |
| `WUPPY_URL` | üretimde | Genel adres, örneğin `https://example.com`. Giriş yalnızca bu adresten gelen istekleri kabul eder. |
| `WUPPY_TRUSTED_PROXIES` | proxy arkasında | Ters proxy'nizin virgülle ayrılmış IP/CIDR değerleri; hız sınırları gerçek istemci IP'sini kullanır. |
| `WUPPY_SESSION_DAYS` | hayır | Gün olarak oturum süresi (varsayılan 7). |
| `WUPPY_SESSION_UPDATE_HOURS` | hayır | Oturumun ne sıklıkla yenileneceği (varsayılan 24). |
| `WUPPY_PASSKEY_RP_ID`, `WUPPY_PASSKEY_ORIGIN` | hayır | Passkey alan adını ve kökenini değiştirir. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | hayır | GitHub ile giriş. `<WUPPY_URL>/api/auth/callback/github` adresini kaydedin. |
| `WUPPY_GITHUB_CLIENT_SECRET`, `WUPPY_GITHUB_CLIENT_ID` | hayır | [GitHub'dan temalar](/tr/guides/github-themes/) için GitHub OAuth uygulaması; callback `<WUPPY_URL>/api/themes/github/callback`. Id verilmezse Wuppy'nin uygulaması kullanılır. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_HOSTED_DOMAIN` | hayır | Google ile giriş; isterseniz tek bir Workspace alan adıyla sınırlı. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | hayır | Microsoft ile giriş (tenant varsayılanı `common`). |
| `RESEND_API_KEY` | hayır | Resend ile e-posta. |
| `SMTP_PASSWORD` | hayır | SMTP e-posta sağlayıcısının parolası. |
| `WUPPY_AI_BASE_URL`, `WUPPY_AI_API_KEY`, `WUPPY_AI_MODELS` | hayır | [Yapay zekâ asistanını](/tr/ai/assistant/) açar. |
| `WUPPY_PLUGIN_<ID>_<AD>` | hayır | Bunları beyan eden eklentiler için gizli değerler. |
| `WUPPY_ALLOW_PRIVATE_URLS` | hayır | `1`, webhook ve yönetilen siteler için özel adreslere izin verir. Yalnızca yerel test için. |

OAuth bilgileri çift olarak verilmelidir; yarım bırakılan bir çift sunucunun açılmasını engeller.
