# Sürat Kargo — Shopify Entegrasyon Uygulaması

Best Model mağazası için Sürat Kargo gönderi oluşturma ve Shopify fulfillment entegrasyonu.

## Ne Yapar?

1. Shopify'daki kargolanmamış siparişleri listeler
2. "Kargola" butonuna tıkla → Sürat Kargo'da gönderi oluşturur
3. Takip numarasını alır → Shopify'a yazar
4. Müşteriye otomatik olarak takip kodlu mail gönderir

## Kurulum (5 Dakika)

### 1. Node.js Kur

https://nodejs.org adresinden "LTS" sürümünü indir ve kur.

### 2. Projeyi İndir

Dosyaları bilgisayarına kopyala, terminali aç ve proje klasörüne git:

```bash
cd surat-kargo-app
npm install
```

### 3. .env Dosyasını Oluştur

`.env.example` dosyasını `.env` olarak kopyala ve bilgileri doldur:

```bash
cp .env.example .env
```

Düzenle:

```
SHOPIFY_STORE=bestmodeltr.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx    ← Shopify app ayarlarından al
SURAT_KULLANICI_ADI=xxxxx           ← ekargo panelindeki Müşteri Kodu
SURAT_SIFRE=xxxxx                   ← Kargo Gönderim Şifresi
SURAT_SORGULAMA_SIFRE=xxxxx         ← Kargo Sorgulama Şifresi
```

### 4. Shopify Access Token Nasıl Alınır

1. Shopify Admin → Ayarlar → Uygulamalar ve satış kanalları
2. "Uygulama geliştir" tıkla
3. "Uygulama oluştur" → isim: "Sürat Kargo"
4. "API kimlik bilgilerini yapılandır" →
   - `read_orders` işaretle
   - `write_fulfillments` işaretle
   - `read_customers` işaretle
   - Kaydet
5. "Uygulamayı yükle" tıkla
6. "Yönetici API erişim jetonu" kısmında "Göster" → bu tokeni kopyala
7. `.env` dosyasına `SHOPIFY_ACCESS_TOKEN=shpat_xxx...` olarak yapıştır

⚠️ Token sadece 1 kez gösterilir, kaybetme!

### 5. Çalıştır

```bash
npm start
```

Tarayıcıda aç: http://localhost:3000

## Kullanım

- Sayfa açıldığında kargolanmamış siparişler listelenir
- "Kargola" butonuna tıkla → onay kutusunu kabul et
- Takip numarası oluşur, müşteriye mail gider
- Shopify'da sipariş "Kargolandı" olarak güncellenir
