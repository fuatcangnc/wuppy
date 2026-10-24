---
title: Properties
description: Seçili blok için stiller, öznitelikler, class'lar, renk seçici, breakpoint ve durumlar.
sidebar:
  order: 6
---

Sağdaki **Properties** seçimi düzenler: bir blok ya da bir [tema öğesi](/tr/visual-editor/theme-elements/).

## Sekmeler ve seçiciler

- **Styles / Attributes** sekmeleri. Styles bloğu ve sınıfını, Attributes ise metni, tag'i ve öğe alanlarını düzenler.
- **Seçici alanı:** “Add or create selector…” yazısı, renkli sınıf etiketleri ve yanında **Componentize**.

## Stil grupları

İkonlu bölüm kartları: Text, Layout, Position, Size, Spacing, Typography, Background, Border, Effects ve Interaction.

| Grup | Kontroller |
| --- | --- |
| Layout | ikonlu Type geçişi (Flex/Grid), Direction, Distribute, Align, Wrap, Gap |
| Position | T/R/B/L offset kutusu, Type, Z index |
| Size | ikonlu width/height/min/max alanları, box-sizing seçici |
| Spacing | dört kenar seçicili padding/margin satırları |
| Typography | Align, Decor ve Capitalize ikon satırları |
| Background | Size, Position, Tile ve Fixed ikon satırları |
| Border | dört köşe seçicili radius |

Seçicinin ortası tüm kenarları/köşeleri, kenarı tek tarafı düzenler; bağlı kenarlar tek değişiklik olarak kaydedilir.
Enum özellikleri dropdown yerine satır içi ikon/metin seçenekleri kullanır; böylece tüm seçenekler görünür. Girişler
framework token'larını (`--v-*`) önerir; başka CSS özellikleri Other styles altında eklenebilir.

## Stil rayı ve arama

- **Sağ stil rayı:** modül ikonu ve her stil grubu için bir ikon. Panelin sağında sabit kalır, ilgili bölüme kaydırır ve
  değeri olan grupları işaretler.
- Alttaki **Search styles in .class...** alanı stil satırlarını filtreler.
- Bir override gerektiğinde (breakpoint, koşul ya da `:hover` gibi bir durum) bağlam ve durum, ray üzerindeki ikondan
  açılır. Breakpoint ve koşullar [Ayarlar](/tr/visual-editor/framework-selectors/#ayarlar) içinde tanımlanır.

## Renk seçici

Renk alanları pencerenin içinde kalan bir seçici açar: renk alanı, ton kaydırıcısı, hex girişi ve (Chromium'da)
damlalık. Renk sürüklerken uygulanır; **Escape** eski rengi geri koyar.

## Componentler

Bir component instance için Properties parametrelerini, **Edit component** ve **Detach**'i gösterir; bkz.
[Componentler ve layout'lar](/tr/visual-editor/components/).
