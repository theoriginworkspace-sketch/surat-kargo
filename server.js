require('dotenv').config();
const express = require('express');
const path = require('path');
const shopify = require('./services/shopify');
const suratkargo = require('./services/suratkargo');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==========================================
// ANA SAYFA — Kargolanmamış siparişler
// ==========================================
app.get('/', async (req, res) => {
  try {
    const orders = await shopify.getUnfulfilledOrders();
    res.render('index', {
      orders,
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
    // 1. Siparişi çek
    const order = await shopify.getOrder(orderId);
    if (!order) {
      return res.json({ success: false, message: 'Sipariş bulunamadı' });
    }

    // 2. Sürat Kargo'ya gönderi oluştur
    const shipResult = await suratkargo.createShipment(order);
    if (!shipResult.success) {
      return res.json({
        success: false,
        message: `Sürat Kargo hatası: ${shipResult.message}`
      });
    }

    // 3. Shopify fulfillment oluştur (müşteriye mail gider)
    const fulfillment = await shopify.createFulfillment(orderId, shipResult.trackingNumber);

    return res.json({
      success: true,
      trackingNumber: shipResult.trackingNumber,
      message: `Kargo oluşturuldu! Takip No: ${shipResult.trackingNumber}`
    });

  } catch (error) {
    console.error('Kargo oluşturma hatası:', error.message);
    return res.json({
      success: false,
      message: `Hata: ${error.message}`
    });
  }
});

// ==========================================
// SUNUCU BAŞLAT
// ==========================================
app.listen(PORT, () => {
  console.log(`\n🚀 Sürat Kargo App çalışıyor: http://localhost:${PORT}`);
  console.log(`📦 Mağaza: ${process.env.SHOPIFY_STORE}\n`);
});
