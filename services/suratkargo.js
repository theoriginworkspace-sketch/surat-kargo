/**
 * Sürat Kargo SOAP API — Doğrudan XML, birden fazla endpoint dener
 */

const ENDPOINTS = [
  'https://www.suratkargo.com.tr/GonderiWebServiceGercek/service.asmx',
  'http://www.suratkargo.com.tr/GonderiWebServiceGercek/service.asmx',
  'https://www.suratkargo.com.tr/GonderiWebServiceGercek/Service.asmx',
];

function buildSoapXml(username, password, gonderi) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <GonderiyiKargoyaGonder xmlns="http://tempuri.org/">
      <KullaniciAdi>${escapeXml(username)}</KullaniciAdi>
      <Sifre>${escapeXml(password)}</Sifre>
      <Gonderi>
        <KisiKurum>${escapeXml(gonderi.KisiKurum)}</KisiKurum>
        <AliciAdresi>${escapeXml(gonderi.AliciAdresi)}</AliciAdresi>
        <Il>${escapeXml(gonderi.Il)}</Il>
        <Ilce>${escapeXml(gonderi.Ilce)}</Ilce>
        <TelefonCep>${escapeXml(gonderi.TelefonCep)}</TelefonCep>
        <Email>${escapeXml(gonderi.Email)}</Email>
        <AliciKodu>${escapeXml(gonderi.AliciKodu)}</AliciKodu>
        <KargoTuru>${gonderi.KargoTuru}</KargoTuru>
        <Odemetipi>${gonderi.Odemetipi}</Odemetipi>
        <IrsaliyeSeriNo>${escapeXml(gonderi.IrsaliyeSeriNo)}</IrsaliyeSeriNo>
        <IrsaliyeSiraNo>${escapeXml(gonderi.IrsaliyeSiraNo)}</IrsaliyeSiraNo>
        <OzelKargoTakipNo>${escapeXml(gonderi.OzelKargoTakipNo)}</OzelKargoTakipNo>
        <Adet>${gonderi.Adet}</Adet>
        <BirimDesi>${gonderi.BirimDesi}</BirimDesi>
        <BirimKg>${gonderi.BirimKg}</BirimKg>
        ${gonderi.KapidanOdemeTutari ? `<KapidanOdemeTutari>${gonderi.KapidanOdemeTutari}</KapidanOdemeTutari>` : ''}
        ${gonderi.KapidanOdemeTahsilatTipi ? `<KapidanOdemeTahsilatTipi>${gonderi.KapidanOdemeTahsilatTipi}</KapidanOdemeTahsilatTipi>` : ''}
      </Gonderi>
    </GonderiyiKargoyaGonder>
  </soap12:Body>
</soap12:Envelope>`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractResult(xml) {
  const match = xml.match(/<GonderiyiKargoyaGonderResult>([\s\S]*?)<\/GonderiyiKargoyaGonderResult>/);
  return match ? match[1].trim() : null;
}

async function trySoapRequest(endpoint, soapXml) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/xml, application/xml, application/soap+xml',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      body: soapXml
    });

    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function createShipment(order) {
  try {
    const shippingAddress = order.shipping_address || order.billing_address;
    if (!shippingAddress) {
      return { success: false, trackingNumber: null, message: 'Sipariş adres bilgisi bulunamadı' };
    }

    const il = shippingAddress.province || shippingAddress.city || '';
    const ilce = shippingAddress.city || '';

    const gonderi = {
      KisiKurum: `${shippingAddress.first_name || ''} ${shippingAddress.last_name || ''}`.trim(),
      AliciAdresi: [shippingAddress.address1, shippingAddress.address2].filter(Boolean).join(' '),
      Il: il,
      Ilce: ilce,
      TelefonCep: shippingAddress.phone || order.phone || '',
      Email: order.email || '',
      AliciKodu: order.order_number?.toString() || '',
      KargoTuru: 3,
      Odemetipi: 2,
      IrsaliyeSeriNo: 'A',
      IrsaliyeSiraNo: order.order_number?.toString() || order.name || '',
      OzelKargoTakipNo: order.order_number?.toString() || '',
      Adet: 1,
      BirimDesi: 1,
      BirimKg: 1,
    };

    if (order.financial_status === 'pending') {
      gonderi.KapidanOdemeTutari = parseFloat(order.total_price) || 0;
      gonderi.KapidanOdemeTahsilatTipi = 1;
    }

    const soapXml = buildSoapXml(
      process.env.SURAT_KULLANICI_ADI,
      process.env.SURAT_SIFRE,
      gonderi
    );

    console.log(`📤 Gönderi: ${gonderi.KisiKurum} - ${gonderi.Il}/${gonderi.Ilce}`);

    // Tüm endpoint'leri dene
    let lastError = null;
    for (const endpoint of ENDPOINTS) {
      try {
        console.log(`🔗 Deneniyor: ${endpoint}`);
        const response = await trySoapRequest(endpoint, soapXml);

        if (!response.ok) {
          const body = await response.text();
          console.error(`❌ ${endpoint} → HTTP ${response.status}`);
          lastError = `HTTP ${response.status} - ${endpoint}`;
          continue;
        }

        const responseXml = await response.text();
        const result = extractResult(responseXml);

        if (!result) {
          console.error('Boş yanıt:', responseXml.substring(0, 300));
          lastError = 'Sürat Kargo boş yanıt döndü';
          continue;
        }

        const isError = result.toLowerCase().includes('hata') ||
                        result.toLowerCase().includes('error') ||
                        result.toLowerCase().includes('başarısız');

        if (isError) {
          return { success: false, trackingNumber: null, message: result };
        }

        console.log(`✅ Takip No: ${result}`);
        return { success: true, trackingNumber: result.trim(), message: 'Gönderi başarıyla oluşturuldu' };

      } catch (err) {
        console.error(`❌ ${endpoint} → ${err.message}`);
        lastError = err.message;
        continue;
      }
    }

    return {
      success: false,
      trackingNumber: null,
      message: `Tüm endpoint'ler başarısız: ${lastError}`
    };

  } catch (error) {
    console.error('Sürat Kargo genel hata:', error.message);
    return { success: false, trackingNumber: null, message: `API hatası: ${error.message}` };
  }
}

module.exports = { createShipment };
