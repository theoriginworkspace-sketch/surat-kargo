const soap = require('soap');

const WSDL_URL = 'http://www.suratkargo.com.tr/GonderiWebServiceGercek/service.asmx?WSDL';

let soapClient = null;

async function getClient() {
  if (soapClient) return soapClient;
  soapClient = await soap.createClientAsync(WSDL_URL);
  return soapClient;
}

/**
 * Sürat Kargo'ya gönderi oluşturur
 * @param {Object} order - Shopify sipariş objesi
 * @returns {Object} { success, trackingNumber, message }
 */
async function createShipment(order) {
  try {
    const client = await getClient();

    const shippingAddress = order.shipping_address || order.billing_address;
    if (!shippingAddress) {
      return { success: false, trackingNumber: null, message: 'Sipariş adres bilgisi bulunamadı' };
    }

    // Shopify province → il, city alanı bazen ilçe olarak geliyor
    const il = shippingAddress.province || shippingAddress.city || '';
    const ilce = shippingAddress.city || '';

    const gonderi = {
      KisiKurum: `${shippingAddress.first_name || ''} ${shippingAddress.last_name || ''}`.trim(),
      AliciAdresi: [
        shippingAddress.address1,
        shippingAddress.address2
      ].filter(Boolean).join(' '),
      Il: il,
      Ilce: ilce,
      TelefonCep: shippingAddress.phone || order.phone || '',
      Email: order.email || '',
      AliciKodu: order.order_number?.toString() || '',
      KargoTuru: 3,       // Normal gönderi
      Odemetipi: 2,        // Gönderici öder
      IrsaliyeSeriNo: 'A',
      IrsaliyeSiraNo: order.order_number?.toString() || order.name || '',
      OzelKargoTakipNo: order.order_number?.toString() || '',
      Adet: 1,
      BirimDesi: 1,
      BirimKg: 1,
    };

    // Kapıda ödeme varsa
    if (order.financial_status === 'pending' && order.gateway === 'Cash on Delivery (COD)') {
      gonderi.KapidanOdemeTutari = parseFloat(order.total_price) || 0;
      gonderi.KapidanOdemeTahsilatTipi = 1; // Nakit
    }

    const args = {
      KullaniciAdi: process.env.SURAT_KULLANICI_ADI,
      Sifre: process.env.SURAT_SIFRE,
      Gonderi: gonderi
    };

    const [result] = await client.GonderiyiKargoyaGonderAsync(args);
    const response = result?.GonderiyiKargoyaGonderResult;

    if (!response) {
      return { success: false, trackingNumber: null, message: 'Sürat Kargo boş yanıt döndü' };
    }

    // Sürat Kargo başarılı olduğunda takip numarasını döner
    // Hata olduğunda hata mesajı döner
    const isError = response.toLowerCase().includes('hata') ||
                    response.toLowerCase().includes('error') ||
                    response.toLowerCase().includes('başarısız');

    if (isError) {
      return { success: false, trackingNumber: null, message: response };
    }

    return {
      success: true,
      trackingNumber: response.trim(),
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
