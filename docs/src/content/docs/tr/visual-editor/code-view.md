---
title: Code görünümü
description: Sayfa kaynağı, site CSS'i, componentler ve etkin temanın dosyaları için tam genişlikte kod çalışma alanı.
sidebar:
  order: 9
---

Üst çubuktaki **Code** tam genişlikte bir çalışma alanı açar.

## Dosyalar

- Gerçek yollarla aranabilir dosya ağacı. **site** sayfayı (`content/pages/about.md`), site CSS'ini
  (`.wuppy/data/visual/site.css`), componentleri (`.wuppy/data/visual/components/*.json`) ve `visual.json`'u tutar.
  **New page** yeni sayfa için koleksiyona gider.
- GitHub teması etkinken ikinci bir **theme: owner/repo** kökü adminlere temanın kodunu (`.astro`, CSS, script, config)
  gösterir. İçerik **site** altında kalır, bu yüzden temanın örnek içerik klasörleri listelenmez. Bağımlılıklar, build
  çıktısı, lockfile'lar ve `.env` hiç listelenmez ve yazılamaz. Bkz. [GitHub'dan temalar](/tr/guides/github-themes/).
- Sayfa kaynağı (`.mdx` veya `.md`), site CSS'i ve tema dosyaları düzenlenebilir; component ve `visual.json` dosyaları
  salt okunurdur.

## Düzenleme

- Sekmeler, satır numaralı ve renklendirmeli editör, **Saved/Unsaved** durumu ve Ctrl/⌘+S ile kayıt.
- Site kayıtları tuvalle aynı Git tabanlı içerik ve görsel veri API'lerini kullanır.
- Kaydedilen tema dosyası `pnpm dev` altında hemen görünür; production'da durum çubuğundaki **Rebuild** düğmesine basın.
- Yazdığınız tek satırlık HTML görsel bloklara çevrilir. Geçerli Tailwind utility'leri kayıtta derlenir (starter
  içeriği `@source` ile tarar) ve önizleme CSS'i yeniden yükler; `text-red-10` gibi geçersiz bir sınıf CSS üretmez.

## Önizleme

Cihaz menüsü ve zoom kontrollü önizleme, seçili blok için altta **Styles/Computed** paneli.
