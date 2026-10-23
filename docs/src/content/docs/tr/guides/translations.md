---
title: Çeviriler
description: Siteyi birden çok dilde yayınlayın.
sidebar:
  order: 10
---

Dillerinizi `wuppy.config` içinde listeleyin:

```js
locales: ["en", "tr"],
```

Slug'ın ilk parçası dildir: `en/about` ve `tr/about` birbirinin çevirisidir.

- **Translations** her kaydı ve dillerini bir tabloda gösterir. Eksik çeviriler ve **güncel olmayan** çeviriler
  (kaynak sonradan değişmiş) işaretlenir.
- Editörde **Translate to …** diğer dil sürümünü oluşturur veya açar.
- Menü, widget ve bölümlerin bir `locale` değeri, byline'ların çevirileri vardır.
- Genel sitede dil değiştirici, varsayılan dile geri dönüş ve `hreflang` etiketleri bulunur.
