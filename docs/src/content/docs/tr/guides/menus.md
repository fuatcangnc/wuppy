---
title: Menüler
description: Gezinme menüleri oluşturun ve temanıza yerleştirin.
sidebar:
  order: 6
---

**Menus**; üst bilgi, alt bilgi, kenar çubuğu veya diğer konumlar için gezinme menüleri oluşturur.

- **Pages**, **Posts**, **Categories**, **Custom links** veya herhangi bir **Custom Fields** koleksiyonundaki girdiler
  arasından öğe ekleyin (her koleksiyon seçicide kendi grubunu alır).
- Öğeleri sürükleyerek sıralayın, alt menü yapmak için iç içe yerleştirin ya da klavye kontrollerini kullanın.
- Menü oluşturun, yeniden adlandırın, silin; **Manage locations** altında konumlara atayın.
- Her dilin kendi menü varyantı olabilir.
- Bir bağlantıya kısa bir **açıklama** (description) yazılabilir. Bunu destekleyen temalar açıklamayı etiketin altında gösterir, örneğin açılır menüde.

Bağlantılar denetlenir: site içi yollar ve `http(s)` adresleri kabul edilir, `javascript:` bağlantıları reddedilir.

Bir şablonda:

```astro
---
import { getMenu } from "wuppycms";
const menu = await getMenu("header", Astro.currentLocale);
---
```

`menu.items` içinde `label`, `href`, isteğe bağlı `description` ve `children` (tek seviye) bulunur.

## GitHub temasında menüler

[GitHub teması](/tr/guides/github-themes/) önceden derlenir; sayfaları son derlemedeki menüyü gösterir. Bir menüyü (ya da ayarları, bölümleri, widget'ları) kaydetmek temayı yaklaşık bir buçuk dakika sonra yeniden derler ve değişiklik kendiliğinden yayına girer.

Wuppy dışında kendi başına da derlenmesi gereken bir tema, `wuppycms` içe aktarmak yerine menü dosyasını doğrudan okuyabilir: Wuppy temayı site klasörü `WUPPY_BASE_ROOT` içindeyken derler ve menüler oradaki `.wuppy/data/menus.json` dosyasındadır. Dosya yoksa temanın kendi bağlantılarına dönün.
