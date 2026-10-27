---
title: Custom Fields
description: Koleksiyonları ve alanlarını panelden oluşturun ve değiştirin.
sidebar:
  order: 9
---

**Custom Fields** her koleksiyonu listeler. Yeni bir tane oluşturun veya alanlarını düzenlemek için birini açın.

- Her alan için tip seçin, zorunlu yapın, varsayılan değer ve yardım metni verin, alanları sıralayın.
- Şemanın önizlemesini ve üretilen TypeScript tiplerini görün.
- Kaydetmeden önce Wuppy mevcut içeriği yeni şemaya göre kontrol eder; kaldırdığınız bir alanda hâlâ veri varsa
  uyarır.

Kullanılabilir alan tipleri [Yapılandırma](/tr/concepts/configuration/#alan-tipleri) sayfasında listelenir.

Her özel alanın girdileri, koleksiyonun `format` değerine göre [MDX veya Markdown](/tr/guides/markdown/) dosyalarıdır.

## Hazır Pages ve Posts

WordPress'teki gibi her sitede bir Pages ve bir Posts koleksiyonu vardır. `wuppy.config` içinde o türde bir koleksiyon
yoksa Wuppy bir tane ekler (`/{slug}` adresinde `content/pages`, `/posts/{slug}` adresinde `content/posts`). Liste her
tipi **Config** (`wuppy.config`'ten veya hazır) ya da **Dashboard** (burada oluşturulmuş) olarak işaretler. Bir Config
tipini kaydetmek, düzenlenmiş bir kopyasını `.wuppy/data/content-types.json` içinde tutar ve bu kopya onun yerine
geçer; kopyayı silmek config'teki hâlini geri getirir.

Yeni bir tip klasörünü ve adresini adından alır (`content/projects`, `/projects/{slug}`). İki tip aynı klasörü
paylaşamaz, yoksa biri diğerinin girdilerini listelerdi. Kaydedilen tip yeniden başlatma olmadan hemen geçerli olur.

## Sitede ve görsel editörde

Temada sayfası olmayan bir tipin girdisi, kendi adresinde temanın ana sayfa düzeniyle açılır: üst ve alt kısım kalır,
girdinin gövdesi `<main>` içine gelir. Böylece girdi editöründeki **Edit with Visual** onu gösterir ve sayfadaki gibi blok
eklenebilir. Adres için kendi sayfası olan bir tema (`src/pages/projects/[slug].astro`) onu kendisi gösterir.

## İlişkiler (Relations)

İlişki, EmDash'teki gibi iki özel alanın girdilerinin nasıl bağlandığını söyler. Bir tipi açın ve **New relation**
seçin:

- **Links to**: diğer özel alan.
- **Linking side** ve **Linked side**: her tarafın adı.
- **Slug**: bağlanan girdilerde bağlantıları tutan alan (`posts_authors`).
- **How many**: bağlayan her girdinin bir mi yoksa istediği kadar mı girdiye bağlanacağı, ve bağlanan her girdiye bir
  mi yoksa istediği kadar mı girdiden bağlanılabileceği.

Bağlayan girdiler, bağlanan girdileri seçmek için bu adda bir alan alır; alan onların slug'larını frontmatter'da tutar
(`posts_authors: [ada, linus]`). Bağlanan girdinin editörü **Linked from** altında ona bağlanan girdileri gösterir;
bağlantıyı bağlayan girdide değiştirin. Bağlanan her girdiye yalnızca bir girdiden bağlanılabiliyorsa, ikinci bağlantı
kayıtta reddedilir.

Bir tema bağlantıları frontmatter'dan okur: `entry.data.posts_authors` slug'ları tutar, `getEntry("authors", slug)` her
girdiyi verir. Bir ilişkiyi silmek, kaydedilmiş bağlantıları dosyalarda bırakır.
