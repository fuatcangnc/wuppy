---
title: Docker
description: Bir Wuppy sitesini tek bir Node konteyneri olarak çalıştırın.
sidebar:
  order: 1
---

Depoda, başlangıç sitesini bağımsız bir Node sunucusu olarak derleyen bir `Dockerfile` ve `docker-compose.yml`
bulunur.

```sh
export WUPPY_SECRET=$(openssl rand -base64 32)
export WUPPY_URL=https://example.com
docker compose up --build
```

- `WUPPY_SECRET` (32+ karakter) oturumları ve önizleme bağlantılarını imzalar. Yeniden başlatmalarda aynı kalsın.
- `WUPPY_URL` genel adrestir; giriş yalnızca bu adresten gelen istekleri kabul eder.
- Durumu volume'lar tutar: `content` (Markdown dosyalarınız), `uploads`, `history` (Git geçmişi) ve `state`
  (`.wuppy`: kimlik veritabanı, site verileri). Bunları yedekleyin veya Settings → Backups'ı kullanın.
- Konteyner yetkisiz `node` kullanıcısıyla çalışır ve `/api/setup` üzerinde sağlık kontrolü vardır.
- `node serve.mjs` ile başlar; [GitHub'dan temalar](/tr/guides/github-themes/) ile seçilmiş bir tema varsa onu çalıştırır. `restart: unless-stopped` ayarını koruyun: tema değişince sunucu kapanır, Docker onu yeniden başlatır. Temalar `state` volume'una derlenir.
- TLS için önüne bir ters proxy koyun ve hız sınırlarının gerçek istemci IP'sini kullanması için
  `WUPPY_TRUSTED_PROXIES` değerini onun adresine ayarlayın.

## Caddy ile HTTPS

[Caddy](https://caddyserver.com) sertifikaları otomatik alır. Aynı compose dosyasında Wuppy'nin yanında
çalıştırın:

```txt
example.com {
	encode zstd gzip
	reverse_proxy wuppy:4321
}
```

ve Docker ağındaki Caddy'ye güvenmesi için Wuppy servisinde `WUPPY_TRUSTED_PROXIES: 172.16.0.0/12` ayarlayın.

## Bir sunucuda birden çok site

Her site kendi `.env` dosyası, `WUPPY_URL` değeri ve volume'larıyla ayrı bir konteynerdir. Her alan adı için bir
Caddy bloğu ekleyin. Hepsini birlikte yönetmek için bir hub'a bağlayın; bkz.
[Çoklu site yönetimi](/tr/sites/managed-sites/).
