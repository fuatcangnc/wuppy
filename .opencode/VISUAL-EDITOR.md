# Visual editor (Instatic uyarlaması) — durum

Son güncelleme: 2026-10-23. Kaynak: `/home/fuat/Downloads/Instatic-main` (MIT, © 2026 David Babinec), `architecture.md`.

## Bitenler

### `packages/visual-editor` (`@wuppy/visual-editor`, yeni paket)
+ [x] `css.ts`: Styles/Overrides, breakpoint/condition, STATES, güvenlik (`safeCssValue`, `safeSelector`, `safeQuery`, `safeStylesheet`), `ruleCss`, `nodeCss`, `pageCss` (render edilen HTML'den `data-ve-r` → `<style>`)
+ [x] `framework.ts`: renkler (shade/tint/transparent), fluid type/space scale (Instatic matematiği), fontlar, `v-` prefixli utility class'lar, `frameworkTokens`, `frameworkCss`
+ [x] `schema.ts`: zod `visualDataSchema` (baseWidth, breakpoints, conditions, selectors, framework, components, layouts, stylesheet), `visualCss`
+ [x] `tests/css.test.ts` (6 test)

### Core (`packages/core`)
+ [x] `dataSchemas.visual`, `dataDefaults.visual`, `readPermissions.visual = content:write`
+ [x] `GET /api/public/visual.css` (ETag/304)
+ [x] `src/astro/visual.ts` + `visual-middleware.ts` (post, page-cache'ten sonra): visual.css link, font linkleri, sayfa başına `<style data-wuppy-visual>`
+ [x] tsdown entry + smoke-dist 10 entrypoint
+ [x] `tests/integration/visual.test.ts` (3 test)

### Admin (`packages/admin/src/components/visual-editor/`)
+ [x] `tree.ts`: overrides, key, toJson/fromJson
+ [x] `modules.ts`: quote, code, ref (component instance), slot; kategorili presetler
+ [x] `markdown.ts` (eski `mdx.ts`): serialize/parse (overrides `data-ve-r`, ref + slot), `importHtml`
+ [x] `store.ts`: tek undo (sayfa + site verisi), context/state/target, clipboard, layouts, componentize/detach/edit, favorites/recents, `saveAll`, `updateInstances`. Paste artık seçilinin ARKASINA ekler.
+ [x] `Canvas.tsx`: Design (tüm breakpoint'ler yan yana, zoom/pan) ve Live mod, inline edit, toolbar, context menu
+ [x] `Explorer.tsx`: Layers / Site (sayfalar, **Templates** olarak layoutlar, componentler; Instatic sayaç/empty/row düzeni) / Code / Media (arama, All/Images/Videos filtreleri, list/grid, upload, görsel/video thumbnail; Site panel Pages/Templates/Components Instatic düzeni). Layers Instatic düzeninde: renkli HTML tag pill'leri, modül ikonları, aç/kapat okları, 28px satırlar.
+ [x] `CodeView.tsx`: toolbar Code switch, Instatic tarzı dosya ağacı + breakpoint/zoom önizleme + satır numaralı syntax editör + Styles/Computed paneli; sayfa MDX ve site CSS Ctrl+S ile Git içeriğine kaydediliyor. E2E testi eklendi.
+ [x] Tailwind code desteği: tek satırlık düz HTML (`<p class="text-red-500">`) görsel düğüme çevriliyor; starter/boilerplate `@source` ile content taranıyor; kayıt sonrası canvas taze Vite CSS'ini yeniden yüklüyor. `text-red-10` geçerli bir Tailwind utility değildir.
+ [x] Theme source in Code view — ayrı `theme: owner/repo` kökü (ADR-022 ek 2); temanın içerik klasörleri gizli.
+ [x] `Overlays.tsx` Layer context menu: Instatic tarzı koyu, 16px radius, ikonlu gruplar; Hide/Rename/Duplicate/Componentize/Save as layout/Copy/Cut/Paste/Wrap/Select parent/**Insert module here** alt menüsü/Lock/Delete.
+ [x] Layer DnD: Instatic edge hit-testing, cyan before/after çizgileri, container satırının neredeyse tamamında iç-vurgu (üst 2px hariç), kapalı container auto-expand, sürüklenen satır ghost'u; div/container içine bırakma çalışıyor.
+ [x] `Properties.tsx`: class pill'leri (selector moduna geçer), context + state seçimi, token datalist'li stil girişleri, component parametreleri
+ [x] `Framework.tsx`, `Selectors.tsx`
+ [x] `Overlays.tsx`: Inserter (arama, favori, son kullanılan, layout, component, HTML yapıştır), Notch (Design/Live, zoom, fit), Spotlight (Ctrl+K), Settings (breakpoint, condition, kısayollar), ContextMenu, Breadcrumbs
+ [x] `VisualEditorPage.tsx` yeniden yazıldı (panel rail, kısayollar, component düzenleme bandı); eski `Panels.tsx` silindi
+ [x] Admin typecheck temiz, oxlint `--deny-warnings` temiz
+ [x] `tests/setup.ts`: Node 25+ `localStorage` sorunu için bellek içi Storage
+ [x] `tests/visual-editor.test.ts`: 4 yeni test (responsive stiller, component/detach, copy/paste, importHtml). Admin 165/165, visual-editor 6/6 yeşil
+ [x] Değişen dosyalarda prettier uygulandı

### MDX + tema bileşenleri (2026-10-23, ADR-023)
+ [x] MDX geri geldi: `format: "md" | "mdx"`, `components` allowlist'i, `/api/editor/components`, görsel editör "component" modülü; mevcut `.md` bileşen eklenince `.mdx`'e yükselir. JSX'ten yapıştırılan `className` → `class`.
+ [x] Tema `src/components/*.astro` dosyaları Add → Components'ta `ASTRO` rozeti/kaynak yoluyla listelenir; seçim gerçek `data-ve="component"` düğümü ekler. `@wuppy/astro` `<Content />` çağrısına doğrudan import edilen bir `components` haritası verir; tuval placeholder, site gerçek çıktıyı gösterir.
+ [x] Code görünümü gerçek yollar: sayfa `<koleksiyon dir>/<slug>.mdx` (veya `.md`), site CSS/componentler `.wuppy/data/visual/…` (visual.json parçaları); sayfa tema içindeyse tek ağaç `theme: owner/repo`, sahte `src/` yok
+ [x] `pnpm dev` (`templates/starter/dev.mjs`) aktif temada `astro dev` çalıştırır; 4330 dev sunucusu bununla yeniden başlatıldı

## Kalanlar

- [x] e2e `e2e/tests/first-post.spec.ts` visual journey Inserter + Enter commit + desktop iframe'e göre güncellendi; `/admin/ai`, `/admin/site` smoke eklendi; 15/15 E2E geçti
- [x] Changeset: `@wuppy/visual-editor` fixed grubuna eklendi; admin/core/visual-editor changeset'i güncellendi
- [x] knip temiz
- [x] README + `.opencode/PROJE-YAPISI.md` paket listesi
- [x] `.opencode/KARARLAR.md` ADR-020 güncellendi (site verisi `.wuppy/data/visual.json`, middleware CSS, `v-` prefix, component markup'ı her entry'ye yazılır)
- [x] `yapılacaklar.md` ve `design-system.md` güncellendi
- [x] Docs EN+TR güncellendi; `pnpm --filter @wuppy/docs test` (37×2 sayfa) ve `build` (75 sayfa) temiz. rsync deploy yapılmadı.
+ [x] `graphify update .`, admin build, e2e (16/16)
- [ ] Prod deploy YOK (kullanıcıya sorulmadan)

## Bilerek atlananlar (Markdown + Git ile uyumsuz)
Formlar (`form` yasak), loop/dinamik binding (Markdown'da ifade yok), script'ler, Yjs ortak düzenleme (Wuppy'de kilit var), template'ler (Astro layout'ları), npm dependency paneli, AI agent.
