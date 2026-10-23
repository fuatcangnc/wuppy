# Wuppy — Multiple Managed Sites (tek admin'den çoklu site)

> Hedef: Dollie / uiXpress'teki gibi tek Wuppy admin'inden birden fazla Wuppy
> sitesini yönetmek ve sitelere müşteri (client) atamak. Güvenlik önceliklidir.
> Yapılacaklar listesi: `yapılacaklar.md` → bölüm 15.

## 1. Model: Hub + uzak siteler

```
Tarayıcı (admin SPA)
   │  oturum çerezi, X-Wuppy-Request: 1
   ▼
HUB Wuppy (= "Local" site)          ← kullanıcılar, üyelikler, şifreli token'lar
   │  /api/sites/:siteId/proxy/*    ← sunucu tarafında, token tarayıcıya hiç gitmez
   │  Authorization: Bearer <hub token>, X-Wuppy-Acting-*
   ▼
UZAK Wuppy sitesi (Node veya Cloudflare)   ← kendi Git'i, kendi içeriği, kendi API'si
```

- Her Wuppy kurulumu aynı zamanda hub olabilir; kendisi listede **Local** olarak
  görünür (`siteId = "local"`, silinemez).
- Uzak site, **çalışan başka bir Wuppy kurulumudur**. Hub uzak sitenin Git
  deposunu klonlamaz, dosya yazmaz; uzak sitenin mevcut `/api/*` uç noktalarını
  çağırır. Git, her sitede kendi içeriğinin source of truth'u olarak kalır.
- Admin SPA tek; site değiştirmek yalnızca API isteklerinin hangi siteye
  gideceğini değiştirir. Uzak siteye ayrı giriş gerekmez.
- Wuppy olmayan siteler (WordPress, düz Astro) kapsam dışı.

## 2. Kavramlar

| Kavram | Nerede yaşar | Açıklama |
| --- | --- | --- |
| Managed site | Hub DB `wuppy_sites` | Ad, URL, şifreli token, durum, son kontrol |
| Hub token | Uzak sitenin `wuppy_api_tokens` | `kind = "hub"`, süreli, izin listesi sınırlı |
| Site üyeliği | Hub DB `wuppy_site_members` | `(site_id, user_id, role)` — müşteri ataması |
| Client | Hub kullanıcısı | Global rolü `client`; yalnızca atandığı siteleri görür |
| Etkin izin | Uzak site hesaplar | `token.permissions ∩ permissionsFor(actingRole)` |

## 3. Kod yerleşimi (mevcut yapıya göre)

| Ne | Dosya |
| --- | --- |
| Rol + izin adları (`client` rolü, `sites:manage`, `sites:read`) | `packages/auth/src/permissions/index.ts` |
| Şifreleme (AES-256-GCM, anahtar `WUPPY_SECRET`'tan HKDF) | `packages/core/src/security/secret-box.ts` |
| Site kayıtları + üyelikler (node:sqlite, `ApiTokenService` kalıbı) | `packages/core/src/sites/store.ts` |
| Bağlanma / sağlık kontrolü (`whoami`) | `packages/core/src/sites/connect.ts` |
| Proxy (allowlist, limit, header temizliği) | `packages/core/src/sites/proxy.ts` |
| Hub route'ları + uzak taraf `/api/hub/*` | `packages/core/src/api/app.ts` (mevcut tek-dosya düzeni) |
| Bearer çözümü (`kind=hub`, acting role) | `packages/core/src/server.ts` → `getUser` |
| Hub token tablosu kolonları | `packages/core/src/security/api-tokens.ts` |
| Aktif site store'u | `packages/admin/src/stores/sites.ts` (nanostores, ADR-004) |
| İstek yönlendirme | `packages/admin/src/lib/api.ts` (tek giriş noktası) |
| Site seçici (sidebar marka alanının altında) | `packages/admin/src/components/sites/SiteSwitcher.tsx` |
| Sites sayfası, ekle/düzenle, üyeler | `packages/admin/src/components/sites/*` + `routes/router.tsx` |
| Testler | `packages/core/src/sites/*.test.ts`, `e2e/` (ikinci starter portu) |

Yeni paket açılmaz. Yeni bağımlılık eklenmez (`node:crypto`, `fetch`, Hono, Zod yeterli).

## 4. Bağlantı akışı

**Uzak sitede (sitenin admin'i yapar):**

1. Users → API tokens → **Connect to a hub** — `kind = "hub"` token oluşturur.
2. İzinler seçilir (varsayılan: `admin` hariç editör seti; `users:manage`,
   `site:transfer`, `plugins:manage` varsayılan kapalı). Süre zorunlu (en çok 1 yıl).
3. Token bir kez gösterilir.

**Hub'da (`sites:manage` izni olan admin yapar):**

1. Sites → **Add site**: ad + URL + token.
2. Hub URL'i doğrular: `https` zorunlu (dev'de `WUPPY_ALLOW_PRIVATE_URLS=1` ile
   `http`/private izinli), `assertPublicUrl` (SSRF), kimlik bilgisi içeren URL red.
3. Hub `GET {url}/api/hub/whoami` çağırır → `{ siteName, siteUrl, apiVersion,
   permissions, tokenExpiresAt }` (sürüm bilgisi sızdırılmaz).
4. `apiVersion` uyumsuzsa veya token `kind=hub` değilse kayıt reddedilir.
5. Token şifrelenip saklanır; tarayıcıya yalnızca son 4 karakter döner.
6. Audit: `site.connect`.

Bağlantıyı kaldırmak hub kaydını ve token'ı siler, uzak siteye dokunmaz. Uzak
admin token'ı kendi tarafında da iptal edebilir; hub bir sonraki istekte
`connection_error` gösterir.

## 5. Müşteri (client) atama

- Hub'a yeni `client` rolü eklenir: **Local üzerinde hiç izni yoktur.**
- Client mevcut davet akışıyla (`/api/invitations`) davet edilir; davette
  site + site rolü seçilebilir, kabul edilince üyelik oluşur.
- Bir siteye üye eklenirken site rolü `editor | author | viewer` olur.
  `admin` site rolü yalnızca hub admin'lerine verilebilir.
- Hub admin'leri (`sites:manage`) tüm siteleri görür; diğerleri yalnızca üye
  oldukları siteleri. Liste sunucu tarafında filtrelenir.
- Üyelik kaldırılınca sonraki istek anında reddedilir (her istekte DB kontrolü,
  önbellek yok).
- Client'ın sidebar'ında Local görünmez; varsayılan site ilk üyeliğidir.
  Hiç üyeliği yoksa "Henüz size atanmış site yok" ekranı.

## 6. Proxy kuralları (güvenlik çekirdeği)

`ALL /api/sites/:siteId/proxy/*` — mevcut `/api/*` zinciri (CSRF, auth, rate
limit, idempotency) zaten uygulanır. Ek olarak:

1. **Yetki:** kullanıcı hub admin'i değilse `wuppy_site_members`'ta kaydı olmalı;
   yoksa `404` (sitenin varlığını sızdırma).
2. **Yol allowlist'i:** yalnızca `/api/...`. Reddedilenler: `/api/auth/*`,
   `/api/hub/*`, `/api/tokens*`, `/api/sites/*` (zincirleme proxy yok),
   `..`, `%2e`, `//`, `\`. Yol normalize edildikten sonra kontrol edilir.
3. **İstek başlıkları:** allowlist — `content-type`, `accept`, `if-none-match`,
   `if-match`, `idempotency-key`. `cookie`, tarayıcıdan gelen `authorization`,
   `host`, `x-forwarded-*` asla iletilmez. Hub ekler: `Authorization: Bearer`,
   `X-Wuppy-Request: 1`, `X-Wuppy-Acting-Role`, `X-Wuppy-Acting-User` (e-posta, audit için).
4. **Yanıt başlıkları:** `set-cookie`, `www-authenticate`, `location` atılır;
   `content-type`, `etag`, `content-disposition` geçer. Hub'ın kendi
   `Cache-Control: no-store` / `nosniff` başlıkları korunur.
5. **Ağ:** her istekte `assertPublicUrl` (DNS değişmiş olabilir),
   `redirect: "error"`, 30 sn zaman aşımı, istek gövdesi ≤ `MAX_UPLOAD_BYTES`,
   yanıt gövdesi akışla en çok 50 MB.
6. **Hata eşleme:** uzak `401/403` (token) → hub `502 SITE_AUTH_FAILED` + site
   durumu `connection_error`; ağ hatası → `502 SITE_UNREACHABLE`; uzak
   doğrulama hataları (`400/404/409/422`) aynen geçer. Hata metinleri `redact()`
   ile süzülür, token asla mesaja/loga girmez.
7. **Rate limit:** kullanıcı başına mevcut limit + site başına yazma limiti.
8. **Audit (hub):** yazma isteklerinde `site.proxy.write` → kullanıcı, site,
   method, yol, durum kodu. Gövde kaydedilmez.

## 7. Uzak site tarafı

- `wuppy_api_tokens`'a `kind TEXT DEFAULT 'user'` kolonu (migration: `ALTER TABLE`
  `IF` kolon yoksa).
- `getUser`: Bearer token `kind=hub` ise etkin izin =
  `token.permissions ∩ permissionsFor(header X-Wuppy-Acting-Role)`.
  Başlık yoksa/bilinmeyen rolse izin yok. `kind=user` token'lar acting başlığını yok sayar.
- Token sahibinin rolü düşürülürse token izinleri de onunla kesişir (mevcut
  token'larda da açık: bugün rol düşse token eski izinleri tutuyor — birlikte düzelt).
- `GET /api/hub/whoami` — yalnızca `kind=hub` token ile; başka hiçbir veri döndürmez.
- Uzak audit'e `actor = token sahibi`, `email = acting user` (hub üzerinden) yazılır.
- Hub token'ları Users sayfasında ayrı rozetle listelenir, tek tıkla iptal edilir.

## 8. Admin UI

**Site seçici** (ekran görüntüsündeki gibi, sidebar'da "Wuppy / Content studio" altında):

- Combobox (shadcn): arama kutusu, Local (sunucu ikonu), uzak siteler (favicon
  harfi + URL), seçili sitede ✓.
- Seçim `localStorage`'da `wuppy.activeSite` olarak tutulur; sunucu her istekte
  yetkiyi yeniden doğrular, store'a güvenmez.
- Site değişince: tüm store'lar sıfırlanır (`content`, `dashboard`, `editor`,
  `git`, `comments`), açık editörde kaydedilmemiş değişiklik varsa onay sorulur,
  `/` (dashboard) açılır.
- Uzak site aktifken üstte ince bant: "Managing uixpress.instawp.xyz".
  "View site" uzak URL'i açar.

**İstek yönlendirme:** `lib/api.ts` içinde `/api/` ile başlayan yol, aktif site
uzaksa `/api/sites/:id/proxy/api/...` olur. İstisnalar: `/api/auth/*`,
`/api/setup`, `/api/sites*` her zaman hub'a gider. Doğrudan `fetch` kullanan iki
yer (`ImportPage`, `LoginPage`) `api()`'ye taşınır veya aynı yardımcıyı kullanır.

**İzinler:** uzak site aktifken menü görünürlüğü `GET /api/sites/:id/me`
yanıtındaki etkin izinlerden gelir (hub hesaplar: üyelik rolü ∩ token izinleri).

**Medya URL'leri:** uzak `/uploads/*` de hub proxy'sinden (yalnızca GET/HEAD)
geçer; görseller aynı origin'den gelir, kırpıcı (canvas) çalışır ve CSP değişmez.

**Sites sayfası** (`/sites`, `sites:manage`): iki panelli liste (mevcut çalışma
alanı kalıbı) — ad, URL, sürüm, durum (`connected | connection_error | unchecked`),
son kontrol, üye sayısı. Aksiyonlar: Add, Check connection, Edit, Rotate token,
Members, Disconnect (yazarak onay).

## 9. Kapsam dışı (v1)

Toplu işlem (birden çok siteye aynı anda yayın), siteler arası içerik kopyalama,
uzak plugin kurulumu, uzak kullanıcı yönetimi, otomatik arka plan sağlık
taraması, hub'dan yeni site kurma (provisioning), AI/agent bağlamı, faturalama,
white-label. İhtiyaç olursa ayrı madde açılır.

## 10. Kabul kriterleri

- [ ] Hub'a iki uzak site eklenir; seçiciyle geçilir; içerik/medya/menü düzenlenir, uzak sitede Git commit'i oluşur.
- [ ] Token tarayıcıya, loglara, audit'e, hata mesajlarına hiçbir zaman çıkmaz (test: yanıt gövdelerinde token yok).
- [ ] Client yalnızca atandığı siteleri listeler; başka `siteId` ile proxy → 404.
- [ ] Üyelik silinince açık sekmedeki sonraki istek reddedilir.
- [ ] `viewer` üye uzakta yazamaz (uzak site 403), menüde yazma aksiyonu görünmez.
- [ ] Hub token'ı `users:manage` içermiyorsa hub admin'i bile uzak kullanıcıları yönetemez.
- [ ] Proxy `/api/auth/*`, `/api/tokens`, `/api/hub/*`, `../` yollarını reddeder.
- [ ] Private IP / metadata adresine (169.254.169.254) site eklenemez (dev bayrağı hariç).
- [ ] Uzak site yönlendirme döndürürse takip edilmez.
- [ ] Uzak token iptal edilince site `connection_error` olur, kullanıcı anlaşılır mesaj görür.
- [ ] `WUPPY_SECRET` değişirse saklı token'lar çözülemez → "reconnect required", çökme yok.
- [ ] Tek site kullanımı (hiç uzak site yok) aynen çalışır; seçici yalnızca Local gösterir.
