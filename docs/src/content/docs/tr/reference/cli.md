---
title: Komut satırı
description: wuppy ve wuppy-plugin komutları.
---

## wuppy

| Komut | Ne yapar |
| --- | --- |
| `wuppy init [--force]` | Bu klasördeki Astro projesini sarar: içerik koleksiyonlarından `wuppy.config.mjs` yazar ve entegrasyonu ekler. Bkz. [Mevcut Astro projesi](/tr/guides/existing-astro-project/). |
| `wuppy import <git-url> <dir>` | Depoyu `<dir>` klasörüne klonlar, sonra orada `wuppy init` çalıştırır. |
| `wuppy import` | GitHub'daki Astro depolarınızı listeler (`gh` gerekir), seçtiğinizi klonlar ve `wuppy init` çalıştırır. |
| `wuppy doctor` | Yapılandırmayı, içerik klasörlerini, Git'i ve `WUPPY_SECRET` değerini kontrol eder. Sorun varsa 1 ile çıkar. |
| `wuppy types` | Her koleksiyon için tipleri içeren `wuppy-env.d.ts` dosyasını yazar. |
| `wuppy mdx-to-md [dir]` | Bileşen veya ifade içermeyen `.mdx` girdilerini `.md`'ye çevirir; MDX kalması gereken dosyaları saklar ve listeler. |
| `wuppy upgrade [--force]` | Paket güncellemesinden sonra veri geçişlerini uygular. Bkz. [Yükseltme](/tr/deployment/upgrading/). |
| `wuppy plugin hash <dir>` | Bir eklentinin yeteneklerini ve `wuppy.config` içinde onaylamak için hash'i yazdırır. |

## wuppy-plugin

| Komut | Ne yapar |
| --- | --- |
| `wuppy-plugin init <dir>` | `manifest.json` ve `plugin.js` oluşturur. |
| `wuppy-plugin validate <dir>` | Manifesti doğrular. |
| `wuppy-plugin hash <dir>` | Onaylanacak yetenek hash'ini yazdırır. |
| `wuppy-plugin build <dir>` | Kod beyan edilmemiş bir yetenek kullanırsa başarısız olur. |
| `wuppy-plugin keygen` | Yeni bir Ed25519 anahtar çifti yazdırır. |
| `wuppy-plugin pack <dir> [privateKey]` | Registry paketi ve indeks kaydı yazdırır; anahtar verilirse imzalar. |

## create-wuppy

`npm create wuppy <klasör>` başlangıç şablonundan yeni bir site oluşturur.
