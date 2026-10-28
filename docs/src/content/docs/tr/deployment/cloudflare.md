---
title: Cloudflare
description: Bir Wuppy sitesini Git deposundan derlenen statik dosyalar olarak Cloudflare Workers'ta yayınlayın.
sidebar:
  order: 2
---

Cloudflare Workers Wuppy yönetim panelini çalıştıramaz: panel Node, disk ve Git ister. Cloudflare'in barındırabildiği,
sitenin herkese açık kısmıdır. `wuppycms export` derlenen siteyi düz dosyalara çevirir, Cloudflare da bunları kendi
ağından sunar.

İş akışı:

1. Bilgisayarınızda düzenleyin: `npm run dev`, ardından `/admin`. Her kayıt bir Git commit'idir.
2. GitHub'a (veya GitLab'a) `git push` yapın.
3. Cloudflare push'u görür, `npm run build:cloudflare` çalıştırır ve sonucu yayınlar.

Wrangler'ı kendiniz kurmanız gerekmez; Cloudflare derleme sırasında onu çalıştırır.

## `npm create wuppycms` ile kurulan siteler

Yeni sitelerde Cloudflare'in istediği her şey hazırdır: bir `build:cloudflare` betiği ve site adını taşıyan bir
`wrangler.jsonc`.

1. Siteyi bir GitHub deposuna gönderin.
2. Cloudflare panelinde **Workers & Pages → Create → Import a repository** açın ve depoyu seçin.
3. **Build command** alanına `npm run build:cloudflare` yazın, **Deploy command** `npx wrangler deploy` kalsın.
4. **Variables** altına `NODE_VERSION` = `24` ekleyin.
5. Deploy edin. Alan adınızı Worker'ın **Settings → Domains & Routes** bölümünden ekleyin ve site haritası ile
   beslemedeki bağlantılar doğru olsun diye `wuppy.config.mjs` içindeki `site.url` değerini bu adrese çevirin.

## Eski siteler

Wuppy'yi güncelleyin (`npm install wuppycms@latest`), sonra `package.json` dosyasına betiği ekleyin:

```json
"build:cloudflare": "astro build && wuppycms export"
```

yanına da bir `wrangler.jsonc`:

```jsonc
{
	"name": "my-site",
	"compatibility_date": "2026-10-01",
	"assets": { "directory": "./dist-static", "not_found_handling": "404-page" }
}
```

`.gitignore` dosyasına `dist-static` ve `.wrangler` ekleyin.

## `wuppycms export` ne yapar

Derlenmiş sunucuyu (`dist/server/entry.mjs`) boş bir yerel portta başlatır; `/`, site haritası ve RSS beslemesinden
ulaşabildiği her sayfayı, kullandıkları yüklemelerle birlikte `dist-static/` klasörüne kaydeder (değiştirmek için
`--out <klasör>`).

- Taslaklar ve zamanlanmış yazılar canlı sitedeki gibi dışarıda kalır. Zamanlanmış bir yazı bir sonraki derlemede
  görünür: yeniden push edin ya da Cloudflare'de bir **Deploy Hook** ekleyip onu zamanlanmış olarak çağırın.
- 404 sayfanız `404.html` olur. Tam ve joker yönlendirmeler `_redirects` dosyasına yazılır; regex yönlendirmeler
  atlanır.
- Görseller özgün boyutlarıyla kaydedilir: yeniden boyutlandırılmış sürümler (`?w=`) Node sunucusu ister.
- Yalnızca istemci tarafı koddan bağlanan sayfalar bulunamaz. Onlara bir sayfadan bağlantı verin ya da site haritasında
  listeleyin.

## Node sunucusunda kalanlar

Statik kopyada `/admin`, API, yorum formu, görsel düzenleyici ve yapay zekâ asistanı yoktur. Bunlar için Wuppy'yi bir
sunucuda çalıştırın ([Docker](/tr/deployment/docker/)). Önbellek için o sunucuyu yine de Cloudflare'in proxy'si
arkasına koyabilirsiniz.
