# EmDash CMS Rakibi — Ürün Planı

## Ürün hedefi
Astro ile Wuppy markamız için doğal çalışan, geliştirici dostu ama teknik olmayan müşterilerin de rahatça kullanabileceği, taşınabilir ve açık bir CMS geliştir.

## Öncelikli özellikler

### P0 — İlk sürüm
- [ ] **Markdown/MDX desteği:** İçerikler düz dosyalarda tutulabilsin; mevcut Astro Content Collections ile uyumlu olsun.
- [ ] **Astro entegrasyonu:** Mevcut projeye kolay kurulum; tema ve bileşenleri baştan yazmayı gerektirmesin.
- [ ] **Admin paneli:** `/admin` altında sade, güvenilir ve mobil uyumlu editör arayüzü.
- [ ] **Görsel içerik editörü:** Başlık, metin, görsel, bağlantı ve SEO alanlarını teknik bilgi gerektirmeden düzenleme.
- [ ] **Git iş akışı:** Değişiklik önizlemesi, commit geçmişi ve geri alma.
- [ ] **Taşınabilirlik:** Node.js üzerinde çalışabilsin; tek bir hosting sağlayıcısına bağımlı olmasın.
- [ ] **Kolay kurulum ve taşıma:** Başlangıç verileri, içerik içe/dışa aktarma ve anlaşılır hata mesajları.
- [ ] **Güvenlik:** Rol/izin yönetimi, güvenli kimlik doğrulama, denetim kayıtları ve güvenli dosya yükleme.

### P1 — Fark yaratacak özellikler
- [ ] **Çok dilli içerik:** Dil bazında içerik eşleştirme, eksik çeviri görünümü ve çeviri durumu.
- [ ] **Astro bileşen desteği:** İçerikte izin verilen bileşenleri güvenli biçimde kullanma.
- [ ] **SEO araçları:** Meta title/description, canonical, Open Graph, sitemap ve yönlendirmeler.
- [ ] **Medya kütüphanesi:** Görsel yükleme, alt metin, yeniden kullanım ve depolama adaptörleri.
- [ ] **Önizleme:** Yayınlamadan önce gerçek site görünümünü görme.
- [ ] **İçerik türleri:** Yazılar, sayfalar ve özel içerik tiplerini yapılandırma.

### P2 — Sonraki aşama
- [ ] Taslak, zamanlama ve yayın onayı akışları.
- [ ] Webhook ve eklenti API'si.
- [ ] Birden fazla siteyi tek panelden yönetme.
- [ ] AI destekli içerik taslağı, SEO önerisi ve çeviri.
- [ ] İçerik değişikliklerini görsel diff ile karşılaştırma.

## Teknik yaklaşım
- **Frontend/site:** Astro
- **Admin:** React + TypeScript
- **Backend/API:** Hono
- **İçerik:** Öncelik Markdown/MDX ve Astro Content Collections; isteyenler için opsiyonel veritabanı adaptörü
- **Veritabanı:** İlk sürümde zorunlu olmasın; ihtiyaç halinde SQLite/PostgreSQL adaptörleri
- **Kimlik doğrulama:** Güvenli oturum, rol tabanlı erişim
- **Dağıtım:** Node.js uyumlu; Cloudflare dahil farklı platformlarda çalışabilir
- **Geliştirme ilkesi:** Çekirdek küçük, adaptörler değiştirilebilir, içerik dışa aktarımı kolay

## MVP başarı ölçütleri
- [ ] Mevcut bir Astro projesine 15 dakikadan kısa sürede kurulabilsin.
- [ ] İçerikler CMS kaldırıldığında da okunabilir Markdown/MDX dosyaları olarak kalsın.
- [ ] Teknik olmayan kullanıcı yazı, görsel ve SEO alanlarını rahatça düzenleyebilsin.
- [ ] Git üzerinden her değişiklik izlenebilsin ve geri alınabilsin.
- [ ] Cloudflare'a özel servis olmadan Node.js ortamında çalışabilsin.

## Yapmaman gerekenler
- İlk sürümde her şeyi kapsayan karmaşık bir page builder geliştirme.
- Kullanıcıyı özel veri formatına veya tek bir hosting sağlayıcısına kilitleme.
- Mevcut Astro projesini dönüştürmek için çok sayıda manuel adım gerektirme.
- AI özelliklerini temel içerik düzenleme ve güvenilirlik sorunları çözülmeden merkeze koyma.

## Konumlandırma
**“Astro için dosya tabanlı, taşınabilir ve müşteri dostu CMS.”**

Ana fark: Markdown/MDX özgürlüğü + kolay admin paneli + Git ile geri alınabilir düzenleme + hosting bağımsızlığı.

Geliştirici Deneyimi ve Hata Ayıklama (DX & Debugging)
Eleştiri: Edge/Worker ortamlarında yerel geliştirme ve hata ayıklamanın karmaşık olması.

Çözüm:

Lokal-Önce (Local-First) Geliştirme Deneyimi: Lokal ortamda karmaşık taklitçiler (mock/workerd) çalıştırmak yerine, doğrudan standart Node.js / Bun üzerinde sıfır yapılandırmayla çalışan geliştirme ortamı (dev server) sunun.

Tip Güvenliği (End-to-End Type Safety): Schema değişikliklerinin TypeScript tiplerine anında yansımasını sağlayan Otter/TypeScript entegrasyonlarını otomatize edin.


1. Markdown/MDX dosyaları yerine kendi içerik modeli
Mimari tercih
Bazı geliştiriciler içeriklerin .md veya .mdx dosyalarında tutulmasını tercih ediyor. Bu dosyalar Git ile kolayca yönetilebiliyor, taşınabiliyor ve mevcut Astro bileşenleriyle kullanılabiliyor. EmDash'in kendi içerik modeli ise bu iş akışını tercih edenler için daha kısıtlayıcı bulunuyor.


2. Cloudflare bağımlılığı ve hosting esnekliği
Altyapı riski
EmDash'in Cloudflare ekosistemiyle güçlü entegrasyonu avantaj olarak görülse de bazı geliştiriciler kendi sunucularını ve veritabanlarını seçmek istiyor. Özellikle başlangıçtaki sandbox eklenti mimarisinin Cloudflare Dynamic Workers gerektirmesi eleştirilmiş.

Önemli ayrıntı: Bu eleştiri kısmen eski sürümlere ait. Reddit'teki daha yeni tartışmalarda EmDash'in Node.js üzerinde de çalışabildiği ve sandbox eklentileri için Cloudflare zorunluluğunun kaldırıldığı belirtiliyor.


3. Mevcut Astro projelerine entegre etmek zahmetli olabilir

Bir geliştirici, mevcut Astro temalarını EmDash'e dönüştürürken epey yapılandırma değişikliği gerektiğini ve bazı parçaların kutudan çıktığı gibi uyumlu olmadığını yazmış. Özellikle eski içeriği aktarma ve veritabanını başlangıç verileriyle doldurma (seeding) işlemi sürtünme yaratmış.

Bu, sıfırdan proje oluşturmaktan ziyade mevcut projeleri dönüştürenler için önemli bir risk.


5. Teknik olmayan kullanıcılar için bazı özellikler yeterince kolay değil

Özellikle çok dilli içerik yönetimi konusunda, EmDash'in mevcut yaklaşımının geliştirici odaklı olduğu belirtilmiş. Dillerin Astro yapılandırmasında tanımlanması ve içeriklerin çeviri gruplarıyla ilişkilendirilmesi mümkün; fakat çeviri eksiklerini ve güncelliğini editör arayüzünden kolayca yönetmek ayrı bir ihtiyaç.

Özel Astro bileşenlerini içerik editörüne taşıma: MDX kullanan geliştiriciler, yazıların içine doğrudan Astro bileşenleri ve diyagramlar yerleştirebilmenin rahatlığını kaybetmek istemiyor. EmDash'in görsel içerik modeli farklı bir yaklaşım gerektiriyor.
