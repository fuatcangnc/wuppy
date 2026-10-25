---
title: Temada kod ajanları
description: Bir Astro temasını Claude Code, Cursor ya da opencode ile WuppyCMS'e uyarlayın.
sidebar:
  order: 4
---

Bir Astro teması, editörlerin admin'de ayarladıklarını yalnızca kodunun okuduğu yerlerde gösterir: linkleri koda yazılmış bir tema, başlığı **Menus**'ü okuyana kadar onu yok sayar. Wuppy'nin verisini nasıl sakladığını bilen bir yapay zekâ kod ajanı bu değişikliği sizin için yapabilir. Wuppy bu rehberi iki biçimde verir:

- **`AGENTS.md`**: `wuppycms init` ve `wuppycms import` projede yoksa bu dosyayı yazar. Claude Code, Cursor, opencode ve Codex onu kendiliğinden okur.
- **`wuppy-theme` skill'i**: aynı rehber, ajan skill'i olarak [`skills/wuppy-theme/SKILL.md`](https://github.com/fuatcangnc/wuppy/blob/main/skills/wuppy-theme/SKILL.md) adresinde. `npx skills add fuatcangnc/wuppy` ile ekleyin ya da klasörü temadaki `.claude/skills/` içine kopyalayın.

**Themes** altından GitHub'dan kurulan bir tema sunucuda ikisini de almaz; birini temanın kendi deposuna ekleyin.

Rehber şunları anlatır:

- temanın kendi başına derlenmeye devam etmesi, mevcut linkleri ve metinleri yedek olarak kalması;
- menüleri konuma göre (header, footer), site ayarlarını, bölümleri ve widget'ları okuma;
- görsel editörün düzenleyebilmesi için class değerlerini düz metin tutma;
- `wuppy.config.mjs` ve `.wuppy/` dosyalarına dokunmama.

## Prompt'lar

Admin'de **AI › Theme prompts** bu prompt'ları bir **Copy** düğmesiyle listeler. Düğme prompt'u rehberle birlikte kopyalar; böylece `AGENTS.md` olmayan bir projede ya da ChatGPT gibi bir sohbette de çalışır. **Copy guide** yalnız rehberi kopyalar, `AGENTS.md` olarak kaydetmek için.

### Bütün temayı uyarla

```text
Adapt this Astro theme to WuppyCMS following the WuppyCMS theme guide (AGENTS.md): read the header and footer menus, the site settings (name, logo, meta tags) and the content collections from Wuppy, keep every current value as a fallback, and check that `npm run build` passes without a `.wuppy` folder.
```

### Menüleri bağla

```text
Following the WuppyCMS theme guide (AGENTS.md), make the header and footer use the WuppyCMS menus for the `header` and `footer` locations, with the current links as fallback. Show a link's description in dropdowns when it is set, and keep the existing markup and classes.
```

### Site ayarlarını kullan

```text
Following the WuppyCMS theme guide (AGENTS.md), use the WuppyCMS site settings for the site name, logo and default title, description and social image, with the theme's current values as fallback.
```

### Widget alanı ekle

```text
Following the WuppyCMS theme guide (AGENTS.md), render the WuppyCMS widget area named "sidebar" (created under Admin › Widgets) in the blog sidebar with `getWidgetArea` from "wuppycms", and show nothing when it has no widgets.
```

Değişikliği push edin ve Themes altında **Rebuild**'e basın. Bundan sonra bir menüyü, ayarları, bölümleri ya da widget'ları kaydetmek temayı kendiliğinden yeniden derler.
