/**
 * Sürat Kargo SOAP API — WSDL'siz doğrudan XML ile çalışır
 * Cloudflare engeline takılmaz
 */

const ENDPOINT = 'https://www.suratkargo.com.tr/GonderiWebServiceGercek/service.asmx';

function buildSoapXml(username, password, gonderi) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
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
  </soap:Body>
</soap:Envelope>`;
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

    // Kapıda ödeme
    if (order.financial_status === 'pending') {
      gonderi.KapidanOdemeTutari = parseFloat(order.total_price) || 0;
      gonderi.KapidanOdemeTahsilatTipi = 1;
    }

    const soapXml = buildSoapXml(
      process.env.SURAT_KULLANICI_ADI,
      process.env.SURAT_SIFRE,
      gonderi
    );

    console.log(`📤 Sürat Kargo'ya gönderi: ${gonderi.KisiKurum} - ${gonderi.Il}/${gonderi.Ilce}`);

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/GonderiyiKargoyaGonder',
        'User-Agent': 'SuratKargoEntegrasyon/1.0',
      },
      body: soapXml
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Sürat Kargo HTTP ${response.status}:`, errorBody.substring(0, 500));
      return {
        success: false,
        trackingNumber: null,
        message: `Sürat Kargo HTTP hatası: ${response.status}`
      };
    }

    const responseXml = await response.text();
    const result = extractResult(responseXml);

    if (!result) {
      console.error('Sürat Kargo boş yanıt:', responseXml.substring(0, 500));
      return { success: false, trackingNumber: null, message: 'Sürat Kargo boş yanıt döndü' };
    }

    const isError = result.toLowerCase().includes('hata') ||
                    result.toLowerCase().includes('error') ||
                    result.toLowerCase().includes('başarısız');

    if (isError) {
      console.error('Sürat Kargo hata:', result);
      return { success: false, trackingNumber: null, message: result };
    }

    console.log(`✅ Takip No: ${result}`);
    return {
      success: true,
      trackingNumber: result.trim(),
      message: 'Gönderi başarıyla oluşturuldu'
    };

  } catch (error) {
    console.error('Sürat Kargo API hatası:', error.message);
    return {
      success: false,
      trackingNumber: null,
      message: `API bağlantı hatası: ${error.message}`
    };
  }
}

module.exports = { createShipment };
