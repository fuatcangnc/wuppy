---
title: Wuppy nasıl çalışır
description: Dosyalar, Git commit'leri ve tek bir panelin arkasında bir Node.js sunucusu.
sidebar:
  order: 1
---

## İçerik dosyadır

Her kayıt YAML frontmatter'lı bir Markdown (`.md`) dosyasıdır, örneğin `content/posts/en/hello.md`.
Wuppy'nin tanımadığı alanlar olduğu gibi korunur. Astro aynı dosyaları Content Collections (`glob` loader) ile
okur; şablonlarınız normal Astro API'lerini kullanır.

Diğer site verileri (menüler, widget'lar, bölümler, taksonomiler, yazar profilleri, ayarlar, yönlendirmeler)
`.wuppy/data` altında JSON olarak tutulur ve aynı şekilde commit edilir.

## Her kayıt bir commit

İçerik kaydetmek, medya yüklemek veya ayar değiştirmek, giriş yapmış kullanıcıyı yazar olarak gösteren bir Git
commit'i oluşturur. Böylece:

- her kaydın satır ve alan farklarıyla tam geçmişi olur,
- herhangi bir eski sürüm tek tıkla geri yüklenir,
- bağımlılık olmaz: depo yedeğin kendisidir.

Otomatik kaydetme farklıdır: yazmaya ara verdiğinizde `.wuppy/autosave/` altında bir kurtarma kopyası tutar ve
asla commit oluşturmaz.

## Node.js üzerinde çalışır

Wuppy bir Astro entegrasyonu ve bir [Hono](https://hono.dev) API'sidir. Normal bir Node.js sunucusu olarak
(örneğin Docker'da) çalışır. Kullanıcılar, oturumlar ve yorumlar `.wuppy/` içindeki SQLite'ta (`node:sqlite`)
tutulur.

## Paketler

| Paket | Görevi |
| --- | --- |
| `wuppy` | İçerik motoru, REST API, Astro entegrasyonu, medya, SEO, yönlendirmeler, webhook'lar, eklenti sandbox'ı, yapay zekâ ve çoklu site |
| `@wuppy/admin` | `/admin` altındaki React yönetim paneli |
| `@wuppy/auth` | Giriş (Better Auth), roller ve izinler |
| `@wuppy/git` | Commit, geçmiş, fark ve geri alma |
| `@wuppy/plugin-types` | Eklenti manifesti ve yetenek kontrolleri |
| `create-wuppy` | `npm create wuppy` |
