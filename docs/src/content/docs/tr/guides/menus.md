---
title: Menüler
description: Gezinme menüleri oluşturun ve temanıza yerleştirin.
sidebar:
  order: 6
---

**Menus**; üst bilgi, alt bilgi, kenar çubuğu veya diğer konumlar için gezinme menüleri oluşturur.

- **Pages**, **Posts**, **Categories** veya **Custom links** kaynaklarından öğe ekleyin.
- Öğeleri sürükleyerek sıralayın, alt menü yapmak için iç içe yerleştirin ya da klavye kontrollerini kullanın.
- Menü oluşturun, yeniden adlandırın, silin; **Manage locations** altında konumlara atayın.
- Her dilin kendi menü varyantı olabilir.

Bağlantılar denetlenir: site içi yollar ve `http(s)` adresleri kabul edilir, `javascript:` bağlantıları reddedilir.

Bir şablonda:

```astro
---
import { getMenu } from "wuppycms";
const menu = await getMenu("header", Astro.currentLocale);
---
```
