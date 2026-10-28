---
title: Başlangıç teması
description: Her yeni Wuppy sitesinin geldiği tasarım ve nasıl değiştirileceği.
sidebar:
  order: 20
---

`create-wuppycms` ile açılan her site **başlangıç temasıyla** gelir. Temada şunlar var: koyu bir üst şerit, kaydırınca koyulaşıp üstte sabit kalan kutulu bir başlık, büyük bir giriş alanı (hero), numaralı yazı kartları, koyu bir çağrı (CTA) bandı ve koyu bir alt bilgi. Yazı tipi Space Grotesk, vurgu rengi turuncu, köşeler keskin.

## Wuppy'den ne okur

| Sayfa bölümü | Kaynağı |
| --- | --- |
| Site adı, üst şerit yazısı, logo | **Ayarlar** → site adı, açıklama, logo (logo yoksa site adının ilk harfi turuncu bir karede gösterilir) |
| Başlık bağlantıları ve açılır menüler | **header** konumuna atanmış menü. İç içe öğeler açılır menü olur, telefonda menü düğmesi çıkar |
| Alt bilgideki bağlantı sütunu | **footer** konumuna atanmış menü (yoksa başlık menüsü) |
| Alt bilgi kutuları | **footer** bileşen alanı |
| Sayfanın `lang` değeri | **Ayarlar** → dil |
| Başlık, açıklama, sosyal kartlar | **Page settings** (SEO ve Open Graph) ve **Settings → SEO** varsayılanları; son etiketleri Wuppy yazar |
| Arama sonuçları | Her içeriğin **Site search settings** ayarları ve başlangıç `/search` sayfası |

Yazılar, sayfalar, yazar, kategori ve etiket sayfaları, arama, yorumlar ve 404 sayfası aynı tasarımı kullanır. Başlığı sayfada düzenleme, önizleme bağlantıları ve **Edit this page** düğmesi çalışmaya devam eder.

## Görünümü değiştirme

Tema **Tailwind CSS 4** ve **bejamas/ui** bileşenleriyle kurulu. Başlık menüsü bejamas `NavigationMenu`, düğmeler bejamas `Button` bileşenidir.

- `src/styles/theme.css` Tailwind'i, `tw-animate-css`'i ve bejamas stillerini yükler, ardından marka değişkenlerini tanımlar. Markanızı burada değiştirin:

```css
:root {
	--primary: #dd641e; /* vurgu: düğmeler, öne çıkanlar, kart numaraları */
	--ink: #111111; /* yazı rengi */
	--navy: #121820; /* üst şerit, iç sayfa başlığı, alt bilgi */
	--font: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
}
```

- bejamas bileşenleri `src/ui/` altındadır. Yeni bir bileşen eklemek için `npx bejamas add <bileşen>` komutunu çalıştırın (ayarlar `components.json` dosyasında, `@/` kısayolu `src/` klasörünü gösterir).
- Sayfa iskeleti `src/layouts/Base.astro`, başlık `src/components/SiteHeader.astro` dosyasındadır. İç sayfalar `PageHero.astro`, listeler `PostCard.astro` bileşenini kullanır.
- Kendi sayfalarınızda Tailwind sınıflarını her zamanki gibi kullanın.
