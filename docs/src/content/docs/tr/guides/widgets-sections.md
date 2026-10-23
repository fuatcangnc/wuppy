---
title: Widget'lar ve bölümler
description: Kenar çubukları, alt bilgiler ve sayfalar için yeniden kullanılabilir bloklar.
sidebar:
  order: 7
---

## Widget'lar

Bir widget alanı (örneğin "sidebar" veya "footer") sıralı bir widget listesi tutar:

- metin, HTML (temizlenmiş), menü, son içerikler, taksonomi listesi veya özel Markdown.

Her widget bir dile, bir koleksiyona veya `/blog/*` gibi yollara sınırlanabilir. Şablonda bir alanı `wuppy`
paketindeki `getWidgetArea(name)` ile okuyun.

## Bölümler (Sections)

Bölüm; adı ve slug'ı olan, yeniden kullanılabilir bir içerik bloğudur, örneğin bir eylem çağrısı veya fiyat
tablosu. Bölümleri oluşturun, düzenleyin, çoğaltın ve silin; sayfalardan istediğiniz sırayla referans verin ve
hangi sayfaların hangi bölümü kullandığını görün. Bölümlerin dil varyantları olabilir.

Gövde [MDX](/tr/guides/markdown/) olarak yazılır ve kaydederken denetlenir; sitede `wuppy/mdx` içindeki `mdxContent` (yalnız Markdown bölümler için `markdownContent`) ile gösterilir.
