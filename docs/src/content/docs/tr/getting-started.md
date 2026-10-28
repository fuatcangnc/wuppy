---
title: Başlarken
description: Bir Wuppy sitesi oluşturun, yerelde çalıştırın ve yönetim paneline girin.
---

Wuppy, [Astro](https://astro.build) için bir CMS'tir. İçerik deponuzda Markdown dosyaları olarak durur, yönetim
paneli `/admin` adresindedir ve her değişiklik bir Git commit'idir.

## Gereksinimler

- Node.js 22.16 veya üstü
- Git
- pnpm (önerilir) veya npm

## Site oluşturun

```sh
npm create wuppycms my-site
cd my-site
```

Yeni proje başlangıç şablonunun bir kopyasıdır: **Pages** ve **Posts** koleksiyonları, menü, SEO etiketleri,
site haritası, RSS, arama ve 404 sayfası olan bir Astro sitesi.

GitHub'da zaten bir Astro siteniz mi var? Bunun yerine `npx wuppycms import` çalıştırıp listeden seçin; bkz. [Mevcut Astro projesi](/tr/guides/existing-astro-project/).

Kurulumu Claude Code, Cursor veya opencode'a mı yaptırmak istersiniz? [Kodlama ajanıyla kurulum](/tr/ai/setup-agents/) sayfasından bir prompt kopyalayın.

## Ortamı ayarlayın

`package.json` dosyasının yanına `.env` oluşturun:

```sh
# En az 32 rastgele karakter; oturumları ve önizleme bağlantılarını imzalar. Değiştirmeyin.
WUPPY_SECRET=...   # openssl rand -base64 32
# Sitenin genel adresi (üretimde zorunlu).
WUPPY_URL=http://localhost:4321
```

Diğer ayarların hepsi isteğe bağlıdır. Bkz. [Ortam değişkenleri](/tr/reference/environment/).

## Çalıştırın

```sh
pnpm install
pnpm dev
```

`http://localhost:4321/admin` adresini açın. İlk ziyarette site adını girer ve **sahip** hesabını oluşturursunuz.
İsterseniz örnek bir "Hello world" yazısı da eklenir. Bundan sonra genel kayıt kapanır; yeni kişiler yalnızca
davetle katılır.

:::tip
Passkey için gerçek bir alan adı gerekir. Paneli `127.0.0.1` yerine `http://localhost:4321` üzerinden açın.
:::

## Kurulumu kontrol edin

```sh
pnpm wuppycms doctor
```

`doctor`; yapılandırmanın yüklendiğini, içerik klasörlerinin var olduğunu, Git'in hazır olduğunu ve
`WUPPY_SECRET` değerinin yeterince uzun olduğunu kontrol eder.

## Sonraki adımlar

- [Wuppy nasıl çalışır](/tr/concepts/how-it-works/)
- [Koleksiyon ve alanları yapılandırın](/tr/concepts/configuration/)
- [İçerik yazın ve yayınlayın](/tr/guides/content/)
- [Docker ile yayına alın](/tr/deployment/docker/)
