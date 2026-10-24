# WuppyCMS Cloud ve açık kaynak ayrımı

Karar: 2026-10-24 (KARARLAR Ek 18). WuppyCMS iki şekilde kullanılır; ürün aynı, fark kimin barındırdığı.

## İki yol

| | Açık kaynak (self-host) | WuppyCMS Cloud (ücretli) |
| --- | --- | --- |
| Kurulum | `npm create wuppycms@latest`, kendi sunucusu / Docker | `app.wuppycms.com`'da kayıt, **tek tıkla** proje |
| Barındırma | Kullanıcının kendisi | Biz, AWS'de |
| Güncelleme, yedek, SSL, e-posta | Kullanıcı yapar | Biz yaparız |
| Panel | Her site kendi `/admin`'i | Aynı `/admin` + `app.` altında **projelerim** listesi |
| Lisans / özellik | Tam ürün, kilitli özellik yok | Aynı paketler; fark hizmet (barındırma, yönetim) |

Kural: Cloud için açık kaynak pakete özellik kilidi, lisans kontrolü veya "pro" dalı eklenmez. Cloud'a özel kod
(kayıt, ödeme, proje oluşturma, sağlama) bu repoya girmez; ayrı, kapalı bir "control plane" deposunda yaşar ve
yayınlanmış npm paketlerini (`wuppycms`, `@wuppycms/*`) kullanır.

## Alan adları

| Adres | Ne |
| --- | --- |
| `wuppycms.com` | Tanıtım sayfası |
| `docs.wuppycms.com` | Dokümanlar (açık kaynak + Cloud) |
| `test.wuppycms.com` | Açık kaynak WuppyCMS'in **bizim** üretim kurulumumuz (demo + kendi kullanımımız). Eskiden `app.` idi. |
| `app.wuppycms.com` | **WuppyCMS Cloud** kontrol paneli: giriş, projelerim, yeni proje, faturalama. Açılana kadar `test.`'e 302 yönlendirir. |
| Proje adresleri | Her Cloud projesi kendi alt alan adında + isteğe bağlı kendi alan adı (bkz. açık sorular) |

## Cloud kullanıcı akışı

1. `app.wuppycms.com`'da kayıt / giriş (e-posta, GitHub, passkey).
2. **Yeni proje**: ad + tema seç → tek tık.
3. Sağlama (control plane): proje kaydı → kiracı instance'ı başlat → DNS + SSL → ilk yönetici hesabı → hazır e-postası.
4. **Projelerim**: her proje için durum, adres, "Yönet" (`<proje>/admin`'e SSO ile geçiş), alan adı bağlama, plan,
   yedekler, silme.
5. Faturalama: plan + kullanım (ödeme sağlayıcısı açık soru).

## AWS mimarisi (ilk sürüm)

Bugünkü sunucuda zaten çalışan desen (`musteri1`, `musteri2`: aynı `wuppy:deploy` imajı, siteye özel `.env` ve
dört volume — content, uploads, history (.git), state (.wuppy)) Cloud'un kiracı modelidir; Cloud bunu otomatikleştirir.

- **Control plane** (`app.`): kendi uygulaması + veritabanı (kullanıcılar, projeler, planlar, faturalar).
- **Kiracı başına bir WuppyCMS instance'ı**: aynı imaj, ayrı veri. İlk adım: EC2 üzerinde Docker Compose +
  Caddy (bugünkü düzen, betikle). Ölçeklenince: ECS Fargate görev/servis başına kiracı, içerik için EFS, medya S3'e.
- **Veri**: içerik zaten dosya + Git; yedek = Git deposu + uploads'ın S3'e kopyası. Kiracı silinince 30 gün saklanır.
- **DNS/SSL**: Route 53 (`wuppycms.com` hosted zone) + Caddy otomatik sertifika (özel alan adları için on-demand TLS,
  control plane'in onay uç noktasıyla).
- **Gizli değerler**: her kiracının `WUPPY_SECRET`'i ayrı; AI anahtarı ve SMTP paylaşımlı, Secrets Manager'da.
- **Gözlem**: CloudWatch (container logları, sağlık kontrolü `/healthz` benzeri), kiracı başına kota.

## Aşamalar

1. ✅ Mevcut kurulum `test.wuppycms.com`'a taşındı, `app.` Cloud için ayrıldı (bu değişiklik).
2. Kiracı sağlama betiği: `musteri*` desenini parametreli hale getir (oluştur / durdur / sil / yedekle).
3. Control plane MVP: kayıt, projelerim, yeni proje (betiği çağırır), projeye geçiş.
4. Faturalama + planlar, özel alan adı, otomatik yedek.
5. Fargate/EFS/S3'e geçiş, çoklu bölge gerekirse.

## Açık sorular

- Kiracı alt alan adı: `<proje>.wuppycms.com` mu, çerez yalıtımı için ayrı bir alan (ör. `wuppycms.site`) mı?
  Öneri: ayrı alan; `app.` oturum çerezleri kiracı sitelerine hiç gitmez.
- Ödeme sağlayıcısı (Stripe / iyzico) ve plan fiyatları.
- Control plane'in teknolojisi (WuppyCMS'in kendi `@wuppycms/auth`'unu yeniden kullanmak mantıklı).
- Kiracıların eklenti kurma yetkisi (sandbox zaten var; Cloud'da onaylı listeyle sınırlamak?).
