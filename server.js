require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());

// Shopify iframe + cookie ayarları
app.use((req, res, next) => {
  const shop = process.env.SHOPIFY_STORE || 'bestmodeltr.myshopify.com';
  res.setHeader('Content-Security-Policy',
    `frame-ancestors https://${shop} https://admin.shopify.com`
  );
  next();
});

// ==========================================
// SABITLER
// ==========================================
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'bestmodeltr.myshopify.com';
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = 'read_orders,write_fulfillments,read_customers';
const API_VERSION = '2024-10';

// Token bellekte sakla (Railway restart'a kadar kalır)
// Kalıcı token için SHOPIFY_ACCESS_TOKEN env var kullanılır
let memoryToken = null;

function getAccessToken() {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  return memoryToken;
}

// ==========================================
// SHOPIFY OAUTH — iframe dışında çalışır
// ==========================================
app.get('/auth', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  res.cookie('shopify_nonce', nonce, { httpOnly: true, sameSite: 'lax' });

  const redirectUri = `https://${req.get('host')}/auth/callback`;
  const installUrl = `https://${SHOPIFY_STORE}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  res.redirect(installUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const nonce = req.cookies.shopify_nonce;

  if (!state || state !== nonce) {
    return res.status(403).send('Güvenlik doğrulaması başarısız. Lütfen /auth adresinden tekrar deneyin.');
  }

  try {
    const tokenResponse = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.access_token) {
      memoryToken = tokenData.access_token;
      process.env.SHOPIFY_ACCESS_TOKEN = tokenData.access_token;
      console.log('✅ Shopify access token alındı!');

      // Token'ı göster ki Railway'e kaydedebilsin
      return res.render('token_success', { token: tokenData.access_token });
    } else {
      console.error('Token alınamadı:', tokenData);
      return res.redirect('/?message=Token+alınamadı&type=error');
    }
  } catch (error) {
    console.error('OAuth hatası:', error.message);
    return res.redirect('/?message=Bağlantı+hatası:+' + encodeURIComponent(error.message) + '&type=error');
  }
});

// ==========================================
// SHOPIFY API
// ==========================================
async function shopifyFetch(endpoint, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Shopify bağlantısı yapılmamış');

  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API hatası (${response.status}): ${errorText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// ==========================================
// SÜRAT KARGO
// ==========================================
const suratkargo = require('./services/suratkargo');

// ==========================================
// ANA SAYFA
// ==========================================
app.get('/', async (req, res) => {
  const token = getAccessToken();

  if (!token) {
    return res.render('setup', {
      apiKeySet: !!SHOPIFY_API_KEY,
      suratSet: !!process.env.SURAT_KULLANICI_ADI,
      host: req.get('host')
    });
  }

  try {
    const data = await shopifyFetch('/orders.json?status=open&fulfillment_status=unfulfilled&limit=50');
    res.render('index', {
      orders: data.orders || [],
      message: req.query.message || null,
      messageType: req.query.type || 'info'
    });
  } catch (error) {
    console.error('Siparişler çekilemedi:', error.message);
    res.render('index', {
      orders: [],
      message: `Shopify bağlantı hatası: ${error.message}`,
      messageType: 'error'
    });
  }
});

// ==========================================
// KARGO OLUŞTUR
// ==========================================
app.post('/ship/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const orderData = await shopifyFetch(`/orders/${orderId}.json`);
    const order = orderData.order;
    if (!order) return res.json({ success: false, message: 'Sipariş bulunamadı' });

    const shipResult = await suratkargo.createShipment(order);
    if (!shipResult.success) return res.json({ success: false, message: `Sürat Kargo: ${shipResult.message}` });

    const foData = await shopifyFetch(`/orders/${orderId}/fulfillment_orders.json`);
    const openFO = (foData.fulfillment_orders || []).find(fo =>
      fo.status === 'open' || fo.status === 'in_progress'
    );

    if (openFO) {
      await shopifyFetch('/fulfillments.json', {
        method: 'POST',
        body: JSON.stringify({
          fulfillment: {
            line_items_by_fulfillment_order: [{ fulfillment_order_id: openFO.id }],
            tracking_info: {
              company: 'Sürat Kargo',
              number: shipResult.trackingNumber,
              url: `https://www.suratkargo.com.tr/KargoTakip?code=${shipResult.trackingNumber}`
            },
            notify_customer: true
          }
        })
      });
    }

    return res.json({
      success: true,
      trackingNumber: shipResult.trackingNumber,
      message: `Kargo oluşturuldu! Takip No: ${shipResult.trackingNumber}`
    });
  } catch (error) {
    console.error('Kargo hatası:', error.message);
    return res.json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Sürat Kargo App: http://localhost:${PORT}`);
  console.log(`📦 Mağaza: ${SHOPIFY_STORE}`);
  console.log(`🔑 Token: ${getAccessToken() ? 'Mevcut ✅' : 'Henüz alınmadı ⚠️'}\n`);
});
