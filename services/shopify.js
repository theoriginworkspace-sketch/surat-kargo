const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-10';

const BASE_URL = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}`;

async function shopifyFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API hatası (${response.status}): ${errorText}`);
  }

  // DELETE ve bazı istekler boş döner
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Kargolanmamış siparişleri çeker
 */
async function getUnfulfilledOrders() {
  const data = await shopifyFetch('/orders.json?status=open&fulfillment_status=unfulfilled&limit=50');
  return data.orders || [];
}

/**
 * Tüm açık siparişleri çeker (kargolanmış dahil)
 */
async function getAllOpenOrders() {
  const data = await shopifyFetch('/orders.json?status=open&limit=50');
  return data.orders || [];
}

/**
 * Tek bir siparişi çeker
 */
async function getOrder(orderId) {
  const data = await shopifyFetch(`/orders/${orderId}.json`);
  return data.order;
}

/**
 * Fulfillment oluşturur (kargo bilgisi + müşteriye mail)
 */
async function createFulfillment(orderId, trackingNumber) {
  // Önce fulfillment order'ları al
  const foData = await shopifyFetch(`/orders/${orderId}/fulfillment_orders.json`);
  const fulfillmentOrders = foData.fulfillment_orders || [];

  const openFO = fulfillmentOrders.find(fo =>
    fo.status === 'open' || fo.status === 'in_progress'
  );

  if (!openFO) {
    throw new Error('Kargolanacak açık sipariş satırı bulunamadı (zaten kargolanmış olabilir)');
  }

  const fulfillmentPayload = {
    fulfillment: {
      line_items_by_fulfillment_order: [
        {
          fulfillment_order_id: openFO.id
        }
      ],
      tracking_info: {
        company: 'Sürat Kargo',
        number: trackingNumber,
        url: `https://www.suratkargo.com.tr/KargoTakip?code=${trackingNumber}`
      },
      notify_customer: true  // Müşteriye otomatik mail gider
    }
  };

  const result = await shopifyFetch('/fulfillments.json', {
    method: 'POST',
    body: JSON.stringify(fulfillmentPayload)
  });

  return result.fulfillment;
}

module.exports = {
  getUnfulfilledOrders,
  getAllOpenOrders,
  getOrder,
  createFulfillment
};
