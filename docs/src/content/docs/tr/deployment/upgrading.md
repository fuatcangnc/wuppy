---
title: Yükseltme ve geri alma
description: Bir siteyi yeni Wuppy sürümüne taşıyın ve gerekirse geri alın.
sidebar:
  order: 20
---

İçerik, ayarlar ve revizyonlar Git deponuzdaki dosyalardır; bu yüzden yükseltme tasarım gereği geri alınabilir.

## Yükseltme

1. Çalışmanızı commit edin veya stash'leyin (`git status` temiz olmalı).
2. Paketleri güncelleyin: `pnpm up wuppycms`.
3. `pnpm wuppycms upgrade` çalıştırın. `.wuppy/version.json` içinde kayıtlı sürüm ile kurulu sürüm arasındaki veri
   geçişlerini uygular, sonra yeni sürümü kaydeder. Çoğu sürüm veri değişikliği gerektirmez.
4. `wuppy-env.d.ts` dosyasını yenilemek için `pnpm wuppycms types`, ardından `pnpm wuppycms doctor` çalıştırın.

Önce sürüm notlarını (`CHANGELOG.md`) okuyun; uyumsuz değişiklikler orada listelenir.

## Geri alma

- Yükseltmenin yaptığı veri değişiklikleri: `git checkout . && git clean -fd .wuppy/data`.
- Paketler: `pnpm add wuppycms@<önceki sürüm>`.
- Kurulu sürüm veriden eskiyse `wuppycms upgrade` çalışmayı reddeder; böylece yanlışlıkla yapılan bir sürüm düşürme
  dosyaları sessizce bozamaz. Bunun yerine Git'ten veya bir yedekten (Settings → Backups) geri yükleyin.
