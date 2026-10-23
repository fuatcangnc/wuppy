---
title: Yönlendirmeler
description: Eski adresleri yenilerine yönlendirin ve kırık bağlantıları düzeltin.
sidebar:
  order: 12
---

Yönlendirmeler `wuppy.config` dosyasından (`redirects: [{ from, to }]`) gelebilir veya **Redirects** ekranında
yönetilebilir.

- Her kuralın kaynağı, hedefi, kalıcı (301) veya geçici (302) türü, notu ve açma/kapama anahtarı vardır.
- Kaynak tam yol, joker karakter veya düzenli ifade olabilir. En belirgin olan kazanır: önce tam eşleşme, sonra en
  uzun joker, sonra düzenli ifade. Güvensiz ifadeler reddedilir.
- Döngüler, tekrarlar ve başka sitelere yönlendirmeler (açık yönlendirme) reddedilir. Sorgu parametreleri korunur.
- **404 kaydı** bulunamayan yolları sayaç ve son görülme zamanıyla listeler; herhangi birinden yönlendirme
  oluşturun.
- Kuralları CSV veya JSON olarak içe ve dışa aktarın.
