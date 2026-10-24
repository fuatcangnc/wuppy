---
title: Komut satırı
description: wuppy ve wuppycms-plugin komutları.
---

## wuppy

| Komut | Ne yapar |
| --- | --- |
| `wuppycms init [--force]` | Bu klasördeki Astro projesini sarar: içerik koleksiyonlarından `wuppy.config.mjs` yazar ve entegrasyonu ekler. Bkz. [Mevcut Astro projesi](/tr/guides/existing-astro-project/). |
| `wuppycms import <git-url> <dir>` | Depoyu `<dir>` klasörüne klonlar, sonra orada `wuppycms init` çalıştırır. |
| `wuppycms import` | GitHub'daki Astro depolarınızı listeler (`gh` gerekir), seçtiğinizi klonlar ve `wuppycms init` çalıştırır. |
| `wuppycms doctor` | Yapılandırmayı, içerik klasörlerini, Git'i ve `WUPPY_SECRET` değerini kontrol eder. Sorun varsa 1 ile çıkar. |
| `wuppycms types` | Her koleksiyon için tipleri içeren `wuppy-env.d.ts` dosyasını yazar. |
| `wuppycms mdx-to-md [dir]` | Bileşen veya ifade içermeyen `.mdx` girdilerini `.md`'ye çevirir; MDX kalması gereken dosyaları saklar ve listeler. |
| `wuppycms upgrade [--force]` | Paket güncellemesinden sonra veri geçişlerini uygular. Bkz. [Yükseltme](/tr/deployment/upgrading/). |
| `wuppycms plugin hash <dir>` | Bir eklentinin yeteneklerini ve `wuppy.config` içinde onaylamak için hash'i yazdırır. |

## wuppycms-plugin

| Komut | Ne yapar |
| --- | --- |
| `wuppycms-plugin init <dir>` | `manifest.json` ve `plugin.js` oluşturur. |
| `wuppycms-plugin validate <dir>` | Manifesti doğrular. |
| `wuppycms-plugin hash <dir>` | Onaylanacak yetenek hash'ini yazdırır. |
| `wuppycms-plugin build <dir>` | Kod beyan edilmemiş bir yetenek kullanırsa başarısız olur. |
| `wuppycms-plugin keygen` | Yeni bir Ed25519 anahtar çifti yazdırır. |
| `wuppycms-plugin pack <dir> [privateKey]` | Registry paketi ve indeks kaydı yazdırır; anahtar verilirse imzalar. |

## create-wuppycms

`npm create wuppycms <klasör>` başlangıç şablonundan yeni bir site oluşturur.
