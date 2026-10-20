# EmDash analizi (`emdash-main`)

Kaynak açık olduğu için birincil yöntem kaynak okumadır. Buna ek olarak admin
kabuğu REA ile de incelendi (aşağıda).

## REA analizi (admin uygulaması)

- Araç: `rea.analyze_javascript_application`
- Girdi: `emdash-main/packages/admin/src` (directory)
- Kapsam: `router.tsx`, `components/Shell.tsx`, `App.tsx`
- Artefakt SHA-256: `61253180c1f8b98929d4edf4fa28095c3d7fc78d750d23c4b947b992c93862dd`
- Sonuç: 3 JS/TSX dosyası ayrıştırıldı, 15.678 AST düğümü, 353 bulgu.
- Sınır: 314 dosyadan 311'i kapsam dışı; uygulama grafiği `partial`, semantik
  grafik `partial`. Bu yüzden özellik envanteri ağırlıklı olarak kaynak
  okumaya dayanır; REA çıktısı rota/kabuk ilişkilerini doğrulamak için
  kullanıldı, davranış kanıtı olarak değil.

## Gözlenenler

- Monorepo: `packages/{core,admin,auth,blocks,cloudflare,plugin-*,registry-*,x402,...}`, pnpm catalog.
- `core/src/api`: `handlers/` (iş mantığı) + `schemas/` + `csrf.ts` + `errors.ts` + `authorize.ts` + `parse.ts`. Katmanlı: route → handler.
- `core/src/content`: yalnızca **dönüştürücüler** (ProseMirror ↔ Portable Text). Asıl içerik **DB'de** (`ec_*` tabloları). → Wuppy'de bu tersine çevrilir: kaynak = dosya.
- `core/src/security/ssrf.ts` (549 satır): SSRF koruması; Wuppy medya/içe aktarmada gerekecek.
- `api/csrf.ts`: durum değiştiren uçlarda `X-EmDash-Request: 1` başlığı → Wuppy: `X-Wuppy-Request: 1`.
- Tedarik zinciri: `minimumReleaseAge`, `trustPolicy`, `strictDepBuilds` (pnpm-workspace.yaml).
- Sürümler: astro ^7.3.2, hono 4.12.27, kysely ^0.29.0, typescript ^6.0.3, vitest 4.1.10, zod 4.5.4.

## Admin rota envanteri (kaynak: `packages/admin/src/router.tsx`)

| Grup | Rotalar |
| --- | --- |
| Auth | `/setup`, `/login`, `/login/magic-link`, `/signup`, `/invite/accept`, `/device` |
| Genel | `/`, `/calendar` |
| İçerik | `/content/$collection`, `/content/$collection/new`, `/content/$collection/$id` |
| Medya | `/media` |
| Yorumlar | `/comments` |
| Ayarlar | `/settings`, `/settings/{general,seo,social,email,media-usage,security,allowed-domains,api-tokens,backups,transfer}` |
| Eklenti | `/plugins-manager`, `/plugins-manager/$pluginId/settings`, `/plugins/registry`, `/plugins/registry/$publisher/$slug`, `/plugins/marketplace`, `/plugins/marketplace/$pluginId`, `/plugins/$pluginId/$` |
| Tema | `/themes/marketplace`, `/themes/marketplace/$themeId` |
| İçe aktarma | `/import/wordpress` |
| Menü | `/menus`, `/menus/$name` |
| Taksonomi | `/taxonomies/$taxonomy` |
| Widget | `/widgets` |
| Yönlendirme | `/redirects` |
| Bölüm | `/sections`, `/sections/$slug` |
| Kullanıcı | `/users` |
| Byline | `/bylines`, `/byline-schema` |
| İçerik tipi | `/content-types`, `/content-types/new`, `/content-types/relations`, `/content-types/$slug` |
| 404 | `*` |

## Sidebar bilgi mimarisi (ekran görüntüsü + `Shell`)

- **Üst:** Dashboard, Calendar
- **Content:** Pages, Posts
- **Manage:** Comments, Menus, Redirects, Widgets, Sections, Categories, Tags, Bylines
- **Admin:** Content Types, Byline Schema, Users, Plugins, Import, Settings
- **Topbar:** View Site, Edit/Preview, kullanıcı
- **Dashboard:** Draft / Media files / User kartları; içerik türü sayaçları;
  Recent Activity; +Page / +Post / Upload Media.

## Wuppy'ye aktarım

| EmDash | Wuppy |
| --- | --- |
| içerik DB'de | içerik `content/**/*.md(x)` dosyası, Git'te |
| handlers/schemas/csrf | aynı katman ayrımı |
| Cloudflare iç içe | adaptör arkasında |
| Kumo admin | Bejamas token'ları + kopyalanmış React primitives |
| Tiptap editör | Lexical |
| TanStack Query | Nanostores |
| Özel auth | Better Auth |
