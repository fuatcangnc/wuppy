---
title: Componentler ve layout'lar
description: Parametreli ve slot'lu tekrar kullanılabilir componentler, kayıtlı layout'lar ve temanın kendi Astro bileşenleri.
sidebar:
  order: 8
---

## Componentler

- **Componentize** (Layers menüsü veya Properties) seçili alt ağaçtan bir component yapar.
- Bir component en fazla 20 **parametre** alabilir: metin ve özniteliklerindeki `{{ad}}` her instance'ın değeriyle
  değişir. İçindeki **Slot**, her instance'ın kendi içeriğini tutar.
- **Edit component** tüm instance'ların işaretlemesini değiştirir; **Detach** bir instance'ı normal bloklara çevirir.
- Explorer → Site içindeki **Update pages** güncel işaretlemeyi component'i kullanan her sayfaya yazar.

## Layout'lar

**Save as layout** seçili alt ağacı stilleriyle saklar. Add → Layouts veya Explorer → Site (Templates) içinden eklenir.

## Tema bileşenleri

Bir GitHub teması etkinse `src/components/*.astro` dosyaları `ASTRO` rozetiyle Add → Components altında görünür.

- Birini seçmek sayfaya gerçek bir Astro bileşeni bloğu ekler. Wuppy, bileşen haritasını temanın `<Content />` öğesine
  otomatik verir; içe aktarma satırı yazılmaz.
- Tuval bileşenin gerçek çıktısını temanın stilleriyle gösterir (prop olmadan, Wuppy entegrasyonunun siteye eklediği
  `/_wuppy/component/<Ad>` sayfasıyla işlenir). Seçilebilmesi için çerçeveli ve etiketlidir; içindeki script'ler
  tuvalde çalışmaz.
- Verilmeyen prop'lara ihtiyaç duyan bir bileşen (`headings` olmadan içindekiler tablosu) sayfayı bozmaz: site onu atlar
  (bir HTML yorumu, hata sunucu günlüğünde) ve tuval prop gerektiğini yazar.
- Bileşen eklenen bir `.md` girdisi `.mdx` olarak kaydedilir, bu yüzden gövdesi geçerli MDX olmalıdır: `</div>` gibi
  fazladan bir kapanış etiketi satırıyla birlikte `invalid MDX` olarak bildirilir.
