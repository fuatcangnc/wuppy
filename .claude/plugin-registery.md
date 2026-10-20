# Eklenti Sistemi Tasarımı (Hono tabanlı CMS)

Amaç: EmDash'in eklenti modelinden daha güçlü, Cloudflare'e bağımlı olmayan ve güvenli bir eklenti sistemi.

**Kapsam kararları:** Hedef ortam yalnızca **Node.js**. EmDash eklenti uyumluluğu hedeflenmiyor, kendi manifest ve ABI'miz tasarlanacak.

## 1. Bağlam: EmDash ne yapıyor?

- **Sandbox:** Her eklenti izole bir runtime'da çalışır. Cloudflare'de Dynamic Worker, Node.js'te ayrı süreç olarak workerd kullanılır. Eklenti yalnızca kendi özel depolamasına erişir. İçerik, medya, kullanıcı, secret, dosya sistemi ve ağa erişim için manifestte yetki beyan edilir, site yöneticisi onaylar.
- **Registry:** AT Protocol (atproto) üzerinde merkeziyetsiz. Paket ve sürüm kayıtları yayıncı tarafından imzalanır, yayıncının kendi hesabında durur. Katalog yalnızca bir vitrin, başkaları da katalog kurabilir. Aggregator, labeler ve loader açık kaynak.
- **Henüz olmayanlar:** Ücretli eklentiler, olgun bir eklenti ekosistemi.
- **Eleştiriler:** Cloudflare'e bağımlılık algısı, sandbox'ın Cloudflare dışında zayıf/opsiyonel olduğu yönündeki v0.1 dönemi itirazları (1.0'da Node için workerd ile kısmen cevaplanmış görünüyor), boş ekosistem.

## 2. Tasarım ilkeleri

1. **Bağımsızlık:** Eklenti sözleşmesi belirli bir sandbox runtime'ına (ör. workerd) bağlı olmaz, ileride yeni sürücü eklenebilir.
2. **Fail closed:** Sandbox kurulamıyorsa eklenti yüklenmez.
3. **En az yetki:** Her yetki bağımsız, ince taneli ve onaylı.
4. **Doğrulanabilirlik:** Kod, manifest ve imza birbirini tutmalı.
5. **Merkezsiz güven:** Tek bir yayıncı, katalog veya satıcıya bağımlılık yok.

## 3. Sandbox mimarisi

### 3.1 Sürücü arayüzü

Eklenti ABI'si: **fetch tarzı handler (Request → Response) + capability RPC**. Sandbox, bu ABI'yi barındıran bir sürücüdür. Hedef yalnızca Node olduğu için başlangıçta **tek sürücü** yeterlidir. ABI temiz tutulursa sonradan yenisi eklenebilir.

| Sürücü | Rol | Not |
|---|---|---|
| WASM + gömülü JS motoru (QuickJS / StarlingMonkey, jco veya Extism) | **Önerilen varsayılan** | Ek binary veya container gerektirmez. Capability = host'un sunduğu import'lar. Node API'leri ve çoğu npm paketi kullanılamaz, daha yavaş |
| Ayrı süreç + workerd (npm paketi olarak gelir) | Alternatif | Eklenti yazarı için rahat JS, güçlü V8 izolasyonu. EmDash ile aynı yol, ek binary ve Cloudflare kaynaklı runtime bağımlılığı var |
| Ayrı Node süreci + OS izolasyonu (container, seccomp, Node permission model) | Alternatif | Node permission model ayrıntıları sürüme göre değişir, kullanmadan önce güncel dokümantasyonu doğrulayın. Tek başına güvenlik sınırı saymayın |
| `node:vm`, `worker_threads` | **Kullanılmaz** | Güvenlik sınırı değil |
| `isolated-vm` | Önerilmez | Native eklenti, bakım riski |

**Gerekçe:** Yalnızca Node hedeflendiği için WASM'ın "her runtime'da aynı" avantajı önemsizleşti. Yine de varsayılan olarak mantıklı: Cloudflare/workerd'e bağımlılık yok, ek binary yok, capability'ler dil seviyesinde zorlanıyor. Bedeli, eklenti yazarlarının npm ve Node API kısıtı. Bu bedel ürün için kabul edilemezse workerd sürücüsü ikinci aşamada eklenir.

### 3.2 Zorunluluk

- Varsayılan davranış: sandbox yoksa eklenti yüklenmez.
- Süreç içi (in-process) yükleme yalnızca açık bir "güvenilir mod"da ve görünür uyarıyla mümkün.
- Dikkat: Hono'da `app.route('/x', pluginApp)` ile eklentiyi süreç içinde mount etmek kolaydır. Bu, WordPress'in sorununu yeniden üretir. Varsayılan yapılmaz.

## 4. Capability modeli

- **İçerik:** Koleksiyon ve alan bazında okuma/yazma.
- **Medya, kullanıcı, e-posta:** Ayrı ayrı yetkiler.
- **Ağ:** Hostname + metot + path düzeyinde allowlist.
- **Kaynak kotaları:** CPU, bellek, süre, çağrı sayısı.
- **Secret'lar:** Eklentiye verilmez. Host, giden isteğe referansla enjekte eder.
- **Egress proxy:** Tüm dış çağrılar host üzerinden geçer, eklenti başına loglanır.
- **Güncelleme politikası:** Capability kümesi genişlerse yeniden onay şart. Otomatik güncelleme yalnızca aynı veya daha dar yetkilerde.
- **Denetim:** Eklenti başına neyi çağırdığı, ne kadar kaynak tükettiği görülebilir.

## 5. Hono ile entegrasyon

Hono, **capability broker** olarak kullanılır:

- Eklentiden host'a gelen her çağrı middleware zincirinden geçer: capability kapsamlı token doğrulama, rate limit, audit log, egress proxy.
- Çağrı gövdeleri Zod ile şemaya karşı doğrulanır (`@hono/zod-validator`).
- Tipli Content API için Hono RPC client (`hc`) kullanılır.
- Eklentinin eklediği route'lar `/plugins/:id` altında mount edilir, ancak handler sandbox'ta çalışır. Host isteği iletir, dönen Response'u süzer (header temizleme, CSP).

## 6. Eklenti SDK'sı

```ts
// Örnek (taslak API)
export default definePlugin({
  id: "search-indexer",
  capabilities: {
    content: { read: ["posts"] },
    network: [{ host: "search.example.com", methods: ["POST"] }],
  },
  hooks: {
    onPublish: async (ctx, post) => { /* ... */ },
  },
});
```

- Manifest build sırasında koddan üretilir.
- Kodda beyan edilmemiş capability kullanımı **build'i kırar**. Böylece "beyan edilen = kodun yaptığı" garantisi sağlanır.
- Yerel geliştirme, üretimle aynı sandbox'ta çalışır. Tipli SDK ve test harness sağlanır.

## 7. Registry

- **Paket formatı:** OCI artifact veya imzalı tarball.
- **İmza:** Sigstore (şeffaflık logu dahil). Sürüm bütünlüğü için TUF benzeri model.
- **Provenance:** Build provenance (SLSA) teşvik edilir veya zorunlu kılınır.
- **Çoklu güven kökü:** apt keyring mantığı. Kurumlar özel registry kurabilir, mirror ve air-gapped kurulum desteklenir.
- **Kilit dosyası:** Hash sabitleme.
- **Küratör/etiketleyici katmanı:** Merkeziyetsizlik güveni site sahibine kaydırır. Bağımsız güvenlik taraması ve topluluk incelemesi sağlanır.
- **Kural:** Mevcut standartlar kullanılır, sıfırdan protokol icat edilmez.

## 8. Ticarileşme

EmDash'te henüz olmayan alan, farklılaşma fırsatı:

- Ödeme sağlayıcıdan bağımsız lisanslama.
- Çevrimdışı doğrulanabilir entitlement token'ları.
- Yayıncılar için gelir paylaşımı seçenekleri.

## 9. Ekosistem başlangıcı

- EmDash uyumluluğu hedeflenmiyor. Bu, manifest ve ABI tasarımını serbest bırakır, ama ilk eklentileri kendi ekibiniz ya da ilk ortaklar yazmalı.
- Başlangıç envanteri için resmi (first-party) eklentiler (arama, SEO, e-posta, form vb.) ve şablon eklenti depoları hazırlanabilir.
- WordPress eklentilerini taşımak için ajan destekli dönüşüm araçları değerlendirilebilir.

## 10. Riskler

- Sandbox kusursuz değil: yan kanal saldırıları, runtime hataları.
- Tedarik zinciri riski imzayla sıfırlanmaz, yalnızca izlenebilir olur.
- Sandbox + registry + ödeme birlikte büyük bir iş yükü.
- WASM tercihi, eklenti yazarlarının npm ve Node API kullanımını kısıtlar.

## 11. Yol haritası (öneri)

1. Plugin ABI + capability manifest + WASM sürücüsü + fail-closed davranış
2. SDK, build-time manifest üretimi, yerel geliştirme ortamı
3. İmzalı paketler (Sigstore) + kilit dosyası + basit bir varsayılan registry (statik indeks)
4. Çoklu registry desteği, küratör/güvenlik taraması
5. Gerekirse ikinci sürücü (workerd) ve conformance test paketi
6. Ücretli eklentiler ve lisanslama

## Açık sorular

- **Registry modeli:** (a) Kendimiz işletelim, (b) yalnızca protokol/araçları yayınlayalım, (c) hibrit: protokolü açık yayınlayıp varsayılan bir registry'yi biz işletelim. Önerilen: (c), başlangıçta sunucusuz statik indeksle.
- WASM'ın npm/Node API kısıtı eklenti yazarları için kabul edilebilir mi?
