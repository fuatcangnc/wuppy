---
title: AI
description: Öğeleri seçip değişikliği yazın; AI onu kendi düzenlemeniz gibi, geri alınabilir şekilde uygular.
sidebar:
  order: 10
---

**AI** sol rayda Selectors'ın altındadır.

## Kullanmak

1. Değiştirilecek öğeleri **Select** (Ctrl+Alt+A) ile seçin. Açıkken tuvalde ya da Layers'ta tıkladığınız her öğe
   eklenir; aynı öğeye yeniden tıklamak onu çıkarır (ya da etiketindeki ×). Seçim yoksa AI o an seçili öğeyle çalışır.
2. Değişikliği yazın ("başlığı kırmızı ve daha büyük yap, paragrafın altına 24px boşluk ekle") ve Enter ile gönderin.
3. Cevap kendi düzenlemeniz gibi uygulanır: bloklar tek geri alma adımında değişir, tema öğeleri temanın `.astro`
   dosyasına yazılır (tema Tailwind kullanıyorsa Tailwind 4 class'ları olarak).

Metni, stilleri, class'ları ve tema öğelerinde öznitelikleri ve etiketi değiştirebilir. Temanın kodla doldurduğu metin
(`{site.title}`) istediğiniz metinle değiştirilir.

## Sohbetler ve geri alma

- Sohbetler bu tarayıcıda saklanır: **Chat history** birini yeniden açar ya da siler, **New chat** yenisini başlatır.
- Bir cevabın altındaki **Undo** o cevabın yaptığı her şeyi, tema dosyaları dahil, geri alır. Dosya sonradan yeniden
  düzenlendiyse ona dokunmaz (onu [Code görünümünde](/tr/visual-editor/code-view/) geri alın). Undo editör açık kaldığı
  sürece sunulur.

## Kurulum

Sunucuda bir AI sağlayıcısı (`WUPPY_AI_BASE_URL`, `WUPPY_AI_API_KEY`, `WUPPY_AI_MODELS`; bkz.
[AI asistanı](/tr/ai/assistant/)) ve sizde içerik yazma izni gerekir.
