# Wuppy

Astro için dosya tabanlı, taşınabilir ve müşteri dostu CMS.

- **İçerik = Markdown/MDX dosyaları.** Wuppy'yi kaldırsanız da içeriğiniz okunur kalır.
- **Her kayıt bir Git commit'i.** Değişiklikleri görün, geri alın; geçmiş silinmez.
- **Node.js'te çalışır.** Cloudflare gerekmez (opsiyonel adaptör olarak düşünüldü, ADR-001).
- **`/admin`** altında sade bir yönetim paneli: alan formları, Markdown editörü, medya, çeviri durumu, kullanıcılar ve roller (admin/editor/author/viewer), yedekleme/içe aktarma, iki faktörlü doğrulama, güvenlik günlüğü; shadcn tabanlı form kontrolleri ve per-page sayfalama.

## Hızlı başlangıç

```sh
pnpm install
pnpm test:e2e          # admin + starter'ı derler, gerçek tarayıcıda "ilk yazı" yolculuğunu çalıştırır
```

Yeni bir site (paketler yayınlanınca): `npm create wuppy my-site`.

`templates/starter` çalışan örnektir: `wuppy.config.mjs` içeriği tanımlar, `astro.config.mjs` içinde `wuppy()` entegrasyonu vardır.
`.env` içinde `WUPPY_SECRET` (en az 32 karakter) ve üretimde `WUPPY_URL` (sitenin kök adresi) gerekir. Oturum ömrü `WUPPY_SESSION_DAYS` (varsayılan 7 gün) ve yenileme aralığı `WUPPY_SESSION_UPDATE_HOURS` (varsayılan 24 saat) ile ayarlanır. Ters proxy arkasında gerçek istemci IP’si için `WUPPY_TRUSTED_PROXIES` (virgülle IP/CIDR) ayarlayın; doğrudan bağlantıda Astro’nun `clientAddress` değeri kullanılır. Passkey/WebAuthn `localhost` veya gerçek alan adı üzerinden çalışır; `127.0.0.1` geçerli bir RP ID değildir. Gerekirse `WUPPY_PASSKEY_RP_ID` ve `WUPPY_PASSKEY_ORIGIN` ile override edin. Yerelde passkey denemek için admin’i `127.0.0.1` yerine `http://localhost:<port>` üzerinden açın. GitHub/Google/Microsoft OAuth isteğe bağlıdır; `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` gibi çiftleri ayarlayın ve sağlayıcıda `<WUPPY_URL>/api/auth/callback/<provider>` adresini kaydedin. OAuth yalnızca hesap güvenliğinden açıkça bağlanmış mevcut hesaplarla giriş yapar; genel kayıt kapalı kalır.
İlk açılışta `/admin` sahip hesabını oluşturmanızı ister; genel kayıt bundan sonra kapanır, kullanıcıları yönetici ekler.

## Yapılandırma (`wuppy.config.mjs`)

```js
export default {
	site: { url: "https://example.com", name: "Example" },
	locales: ["en", "tr"], // slug'ın ilk parçası dil: en/hello, tr/hello
	components: ["Callout"], // içerikte kullanılabilecek bileşenler (başka JSX/import/script reddedilir)
	collections: [
		{
			name: "posts",
			dir: "content/posts",
			route: "/blog/{slug}",
			fields: { title: "string", date: "date", draft: "boolean", publishAt: "date", tags: "list", cover: "image" },
		},
	],
	redirects: [{ from: "/old", to: "/new" }],
	webhooks: [{ url: "https://ci.example.com/hook", secret: "…", events: ["content.updated"] }],
	plugins: [{ dir: "plugins/search", approve: "<wuppy plugin hash çıktısı>" }],
};
```

Alan tipleri: `string`, `text`, `date`, `image`, `boolean`, `number`, `list`. Bildirilmeyen frontmatter alanları korunur.

## Mimari

| Paket | Görev |
| --- | --- |
| `packages/core` (`wuppy`) | İçerik motoru, Hono API, Astro entegrasyonu, medya, SEO/sitemap, yönlendirme, webhook, eklenti sandbox'ı |
| `packages/admin` | React yönetim paneli (Nanostores, TanStack Router, Lexical, Tailwind v4) |
| `packages/auth` | Better Auth yapılandırması, roller ve izin haritası |
| `packages/git` | Git adaptörü (commit, geçmiş, diff, revert) |
| `packages/plugin-types` | Eklenti manifesti ve yetenek (capability) denetimi |
| `packages/create-wuppy` | Yeni proje oluşturucu |
| `templates/starter` | Çalışan örnek site |
| `e2e` | Playwright kabul yolculukları |

Tasarım sistemi: `design-system.md`. Kararlar: `.opencode/KARARLAR.md`. Mimari: `.opencode/PROJE-YAPISI.md`. İlerleme: `yapılacaklar.md`. Kalite çıtası: `CONSTRAINTS.md`.

## Güvenlik özeti

- Yol aşımı korumalı slug'lar; yüklemede magic-byte tür tespiti (SVG kabul edilmez), 5 MB sınırı, sunucunun seçtiği dosya adı.
- Durum değiştiren her API çağrısı `X-Wuppy-Request: 1` ister (CSRF); tüm `/api` yanıtları `no-store`.
- İçerikte izinsiz bileşen, `import`/`export`, `<script>`/`<iframe>` ve `javascript:` bağlantıları kaydedilmez.
- Rol → izin haritası tek yerde (`packages/auth`); bilinmeyen rol hiçbir izin almaz. Giriş denemeleri hız sınırlıdır; parola girişi TOTP tabanlı iki faktörlü doğrulama ister (yedek kodlarla). Magic link yeni hesap açamaz ve 2FA açık hesaplara gönderilmez; passkey ile bağlı OAuth sağlayıcıları güçlü alternatif olarak kabul edilir ve ek doğrulama kodu istemez.
- Eklentiler WASM (QuickJS) içinde çalışır: Node, ağ ve dosya erişimi yoktur; yalnızca onaylanmış yetenekler (`wuppy plugin hash <dir>`), her ağ çağrısı loglanır.
- Güvenlik olayları (`/admin` → Security log) ve içerik değişiklikleri (Git geçmişi) denetlenebilir.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `pnpm check` | lint + tip denetimi + tüm testler |
| `pnpm test:e2e` | admin ve starter derlenir, tarayıcı testleri koşar |
| `pnpm build` | paketleri derler ve yayın düzenini doğrular |
| `pnpm format` | Prettier |
