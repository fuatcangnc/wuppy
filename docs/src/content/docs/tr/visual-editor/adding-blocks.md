---
title: Blok ekleme
description: Add paneli, hazır modüller, layout'lar, componentler ve yapıştırılan HTML.
sidebar:
  order: 5
---

**Add** (veya **A**, ya da yüzen araç çubuğundaki **+**) ekleyiciyi açar. Üst çubukta ayrıca hızlı **Container**,
**Text** ve **Image** düğmeleri vardır.

- Sol rayda sayaçlı **Modules / Layouts / Components / Recent** ve vurgulanan öğenin önizlemesi vardır.
- Sağ panelde arama, liste/ızgara görünümü, wireframe küçük resimler ve favoriler (yıldız) vardır. Favoriler yüzen araç
  çubuğunda da görünür.
- **Paste HTML** yapıştırılan HTML'i bloklara çevirir; JSX'ten gelen `className` `class` olarak okunur.
- Yeni blok seçili bloğun arkasına, seçili blok container ise içine eklenir. Bir tema öğesi seçiliyse tema dosyasına
  gider (bkz. [Tema öğeleri](/tr/visual-editor/theme-elements/)).
- Layers menüsündeki **Insert module here** tam bir noktaya ekler.

## Modüller

| Kategori | Modüller |
| --- | --- |
| Layout | Section, Container, Columns, Stack, Row, Card, Hero, Spacer |
| Basic | Heading, Text, Button, Link, List, Quote, Divider |
| Media | Image, Video |
| Advanced | Code, Markdown |

## Her bloğun yazdığı

| Blok | Yazdığı | Alanlar |
| --- | --- | --- |
| Container | `<section>`, `<div>`, `<header>`, `<footer>`, `<main>`, `<article>`, `<aside>`, `<nav>` | öğe, sınıflar |
| Heading | `<h1>`–`<h6>` | seviye, sınıflar |
| Text | `<p>` | sınıflar |
| Button, Link | `<a>` | bağlantı, sınıflar |
| Image | `<img>` | görsel (yükleme veya Media), alt metin, sınıflar |
| Video | `<video controls>` | `.mp4`/`.webm` adresi, sınıflar |
| List | `<ul>` / `<ol>` | maddeler (satır başına bir), numaralı |
| Quote, Code, Divider | `<blockquote>`, `<pre><code>`, `<hr>` | sınıflar |
| Component instance | component'in işaretlemesi | parametreleri, slot içeriği |
| Markdown | serbest Markdown, aynen korunur | kaynak |
| Astro bileşeni | `<Callout data-ve="component" data-ve-name="Callout">`; tema haritası render eder | bileşen adı |

Layout ve componentler [Componentler ve layout'lar](/tr/visual-editor/components/) sayfasında.
