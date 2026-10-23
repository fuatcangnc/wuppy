---
title: GitHub'dan temalar
description: Yönetim panelinde GitHub'daki bir Astro sitesini seçip bu sitenin tasarımı olarak çalıştırın.
sidebar:
  order: 21
---

Yönetim panelinin kenar çubuğundaki **Themes**, GitHub hesabınızdaki Astro sitelerini listeler. Birini seçtiğinizde Wuppy onu sunucuya klonlar, [`wuppy init`](/tr/guides/existing-astro-project/) gibi sarar, derler ve siteyi ona geçirir. Depodaki içerik panelden düzenlenebilir olur ve düzenlemeler anında yayına girer.

## GitHub'ı bağlayın

**Themes** sayfasında **Connect GitHub** düğmesine basın. GitHub'ın izin sayfası açılır ve Wuppy'nin herkese açık ve özel tüm depolarınıza erişmesine izin vermenizi ister (`repo` kapsamı). Onayladığınızda **Themes** sayfasına geri dönersiniz ve depolarınız listelenir.

Her admin kendi GitHub hesabını bağlar. Token sitenin veritabanında (`WUPPY_SECRET` ile) şifreli saklanır, tarayıcıya hiç gönderilmez. **Disconnect** onu siler; GitHub'da Settings → Applications altından da iptal edebilirsiniz.

### Sunucu ayarı

Sunucuya GitHub OAuth uygulamasının secret'ı bir kez verilir:

1. OAuth uygulamasında (GitHub → Settings → Developer settings → OAuth Apps) **Authorization callback URL** alanını `<WUPPY_URL>/api/themes/github/callback` yapın. Bir uygulamanın tek callback alan adı olur; her alan adı için ayrı uygulama gerekir.
2. Sunucuda `WUPPY_GITHUB_CLIENT_SECRET` değişkenini, uygulama Wuppy'ninki değilse `WUPPY_GITHUB_CLIENT_ID` değişkenini de ayarlayıp sunucuyu yeniden başlatın.

## Depo seçin

Liste; sahibi olduğunuz, katkıcı olduğunuz ya da bir organizasyon üzerinden eriştiğiniz depoları son push'a göre sıralar ve yalnız `package.json` dosyasında Astro olanları gösterir. **Install** düğmesine basın:

1. **Cloning**: depo sunucuda `.wuppy/themes/<sahip>__<ad>/` klasörüne klonlanır.
2. **Wrapping**: `wuppy init` içerik koleksiyonlarını bulur, `wuppy.config.mjs` dosyasını yazar.
3. **Installing packages**: `npm install`.
4. **Building**: site, kendi ayarı hangi adapter'ı kullanırsa kullansın (Cloudflare, Vercel…) Node adapter'ıyla derlenir.

Derleme başarılı olunca tema etkinleşir ve sunucu yeniden başlar; sayfa kendiliğinden yenilenir. Hesaplar, şifreler ve oturumlar aynı kalır. Bir adım başarısız olursa hata gösterilir ve mevcut site çalışmaya devam eder.

**Active** bölümü yerleşik siteyi ve burada derlenen her temayı listeler. **Activate** yeniden derlemeden aralarında geçiş yapar. **Rebuild** kurulu bir temayı yeniden derler.

## Gereksinimler

- Sunucu `node serve.mjs` ile başlatılmalı (Docker imajı bunu yapar) ve kapanınca onu yeniden başlatan bir süreç yöneticisi olmalı; örneğin Docker'ın `restart: unless-stopped` ayarı. `astro dev` altında seçim kaydedilir, bir sonraki başlatmada geçerli olur.
- Sunucuda `git` ve `npm`, GitHub'a ve npm kayıt deposuna ağ erişimi.
- Depo, Markdown ya da MDX içerik koleksiyonları olan bir Astro 7 sitesi olmalı.

## Bilinmesi gerekenler

- Themes'i yalnız yöneticiler (admin) kullanabilir: kurulum, deponun kurulum betiklerini ve derlemesini sunucuda çalıştırır. Yalnız güvendiğiniz depoları kurun.
- İçerik düzenlemeleri sunucudaki tema klasöründe commit edilir, GitHub'a asla push edilmez.
- Derleme depodaki bir sorun yüzünden başarısız olursa (örneğin bir yazıda içerik şemasının zorunlu tuttuğu bir alan eksikse) sorunu GitHub'da düzeltip yeniden **Install**'a basın: hiç derlenmemiş tema baştan klonlanır.
- **Rebuild** GitHub'dan yeni commit çekmez. Güncellemek için sunucuda `.wuppy/themes/<sahip>__<ad>/` klasörünü silip yeniden kurun.
- Tema derlemesi, derlendiği Wuppy sürümünü içerir. Wuppy'yi güncelledikten sonra **Rebuild** düğmesine basın.
- Etkin tema başlatılamazsa `serve.mjs` hatayı loglar ve yerleşik siteyi çalıştırır.
- Yalnız sitenin kökündeki `package.json` kontrol edilir; monorepo alt klasöründeki Astro siteleri listelenmez.
