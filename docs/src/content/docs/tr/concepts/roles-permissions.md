---
title: Roller ve izinler
description: Her rolün yapabildikleri; API token'ları ve çoklu sitenin aynı kuralları kullanması.
sidebar:
  order: 3
---

Her API ucu tam olarak bir izin ister. Roller sabit izin kümeleridir.

| İzin | admin | editor | author | viewer |
| --- | :-: | :-: | :-: | :-: |
| `content:read` | ✓ | ✓ | ✓ | ✓ |
| `content:write` | ✓ | ✓ | ✓ | |
| `content:delete`, `content:publish`, `content:schedule` | ✓ | ✓ | | |
| `media:write` | ✓ | ✓ | ✓ | |
| `media:delete` | ✓ | ✓ | | |
| `comments:read` | ✓ | ✓ | ✓ | |
| `comments:moderate` | ✓ | ✓ | | |
| `menus`, `widgets`, `sections`, `taxonomies`, `bylines`, `content-types`, `themes` (`:manage`) | ✓ | ✓ | | |
| `git:read` | ✓ | ✓ | ✓ | |
| `import:run` | ✓ | ✓ | | |
| `git:revert`, `audit:read`, `plugins:manage`, `users:manage`, `site:settings`, `site:transfer`, `sites:manage` | ✓ | | | |

Beşinci rol olan **client** (müşteri), hub'ın kendisinde hiçbir izne sahip değildir. Müşteri yalnızca üyesi
olduğu [yönetilen siteleri](/tr/sites/managed-sites/), her sitede kendisine verilen rolle görür.

## Bilinmesi gerekenler

- İlk hesap sahiptir (admin). Sonrasında hesaplar yalnızca davetle açılır.
- Son aktif admin'in rolü düşürülemez, devre dışı bırakılamaz, silinemez.
- Bir API token'ı, sahibinin **şu anki** yetkisinden fazlasına sahip olamaz: sahibinin rolü düşerse token da
  aynı yetkileri kaybeder.
- Yazarlar (author) taslak yazabilir ama yayınlayamaz, zamanlayamaz, silemez.
