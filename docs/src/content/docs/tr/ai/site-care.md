---
title: Site bakımı
description: Zamanlanmış sağlık ve güvenlik kontrolleri, müşteri raporları ve toplu güncellemeler.
sidebar:
  order: 2
---

## Güvenlik taraması

**Sites → Run security scan** siteyi dışarıdan, bir ziyaretçinin göreceği gibi kontrol eder. Sitenin token'ını
asla göndermez. Şunları raporlar:

- sitenin erişilebilir olup olmadığı ve hub token'ının süresinin dolmak üzere olup olmadığı,
- yarım kalmış kurulum sayfası,
- herkese açık okunabilen gizli dosyalar (`.env`, `.git/config`, kimlik veritabanı, yapılandırma dosyası),
- eksik güvenlik başlıkları: HSTS, `nosniff`, çerçeve koruması, referrer politikası.

Her bulgunun bir önem derecesi vardır: yüksek, orta veya düşük.

## Saatlik kontroller

Hub, bağlı her siteyi saatte bir kontrol eder: bağlantı, token ve güvenlik taraması. Bir sitede orta veya yüksek
önemde yeni bir sorun çıktığında siteleri yöneten her kullanıcıya bir e-posta gider. Sorunlar değişmedikçe tekrar
e-posta gönderilmez.

## Müşteri raporu

Bir ay seçin ve **Open report (PDF)** düğmesine tıklayın. Rapor; içerik sayılarını, o ay yapılan değişiklikleri,
güvenlik taramasını ve site durumunu gösterir. PDF olarak saklamak için sayfadaki **Save as PDF** düğmesini
(tarayıcının yazdırma penceresi) kullanın.

**Client reporter** ajanı aynı verilerden daha samimi bir özet yazıp e-postayla gönderebilir.

## Aylık e-posta

**Email the report every month to** altında sitenin üyelerinden birini seçin. Hub her ayın 1'inde ona önceki ayın
raporunu bir kez gönderir. Kapatmak için **Nobody** seçin.

## Toplu işlemler

**Sites** sayfasının üstünde:

- **Check all** tüm bağlantıları kontrol eder.
- **Scan all** her sitede güvenlik taraması yapar ve sonuçları birlikte gösterir.
- **Plugin updates** her sitede yeni sürümü olan eklentileri bulur ve tek tek ya da hepsini birden günceller.
  Güncellenen eklenti, o sitede biri onaylayana kadar kapalı kalır.
