import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';

const router = Router();

// Every handler must only touch orders where seller === req.session.userId.

// GET /api/orders?status=ready&date=today
router.get('/', async (req, res, next) => {
  try {
    const filter = { seller: req.session.userId };

    if (req.query.status) filter.status = req.query.status;

    if (req.query.date === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.dueAt = { $gte: start, $lt: end };
    }

    const orders = await Order.find(filter)
      .populate('items.product')
      .sort({ dueAt: 1 });

    res.json(orders);
  } catch (err) {
    next(err);
  }
});

import { parseOrder } from '../services/extraction.js';

router.post('/parse', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (typeof message !== 'string' || !message.trim() || message.length > 5000) {
      return res.status(400).json({ error: 'message must be a non-empty string under 5000 characters' });
    }
    res.json(await parseOrder(message, req.session.userId));
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/extract
// Body: { message }. Returns suggested fields plus a list of missing ones.
// Uses services/extraction.js.
router.post('/extract', notImplemented);

// POST /api/orders/check
// Body: a draft order. Returns whether it can be fulfilled with current stock.
// Uses services/feasibility.js.
router.post('/check', notImplemented);

// Checks the items of a new order and returns either { items } or { error }.
// Rules:
//   - the product must exist and belong to this seller
//   - if the product has variants, one of THEM must be chosen (by its _id)
//   - if it has no variants, no variant is stored
// The browser only sends { product, variantId, quantity }. The name and price
// are looked up here, so they can't be faked from the browser.
async function checkItems(items, sellerId) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Add at least one item' };
  }

  const result = [];
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.product)) {
      return { error: 'Choose a product for every item' };
    }
    const product = await Product.findOne({ _id: item.product, seller: sellerId });
    if (!product) {
      return { error: 'One of the products no longer exists' };
    }

    const line = { product: product._id, quantity: item.quantity };

    if (product.variants.length > 0) {
      const variant = item.variantId ? product.variants.id(item.variantId) : null;
      if (!variant) {
        return { error: `Choose a variant for ${product.name}` };
      }
      line.variantId = variant._id;
      line.variant = variant.name;
      line.unitPrice = variant.price ?? product.price; // empty variant price = product's price
    } else {
      line.unitPrice = product.price;
    }

    result.push(line);
  }
  return { items: result };
}

// POST /api/orders
// Creates an order for the logged-in seller.
//
// Materials decision (DOCUMENT FOR TEAM): materials are NOT deducted when an
// order is created. materialsDeducted stays false. Deduction is still to be
// decided (e.g. when status moves to 'ready') and built with services/inventory.js.
router.post('/', async (req, res, next) => {
  try {
    // Only copy the fields a seller is allowed to set.
    // seller, status and materialsDeducted are never taken from the request body.
    const {
      customerName,
      customerContact,
      platform,
      items,
      price,
      paymentStatus,
      depositAmount,
      fulfilmentMethod,
      deliveryAddress,
      dueAt,
      rawMessage,
    } = req.body;

    // Rules the schema can't express on its own
    if (fulfilmentMethod === 'delivery' && !deliveryAddress?.trim()) {
      return res.status(400).json({ error: 'Delivery address is required for delivery orders' });
    }
    if (paymentStatus === 'deposit' && !(Number(depositAmount) > 0)) {
      return res.status(400).json({ error: 'Enter the deposit amount' });
    }
    if (Number(depositAmount) > Number(price)) {
      return res.status(400).json({ error: 'Deposit cannot be more than the price' });
    }

    // Check every item against the seller's own products, and copy the
    // variant's name and price onto the order (see Order.js).
    const checked = await checkItems(items, req.session.userId);
    if (checked.error) {
      return res.status(400).json({ error: checked.error });
    }

    const order = await Order.create({
      seller: req.session.userId,
      customerName,
      customerContact,
      platform: platform || undefined, // empty string would fail the enum check
      items: checked.items,
      price,
      paymentStatus,
      depositAmount,
      fulfilmentMethod,
      deliveryAddress: fulfilmentMethod === 'delivery' ? deliveryAddress : undefined,
      dueAt,
      rawMessage,
    });

    res.status(201).json(order);
  } catch (err) {
    // Bad input (missing required field, wrong enum, invalid id) → 400 with a readable message
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id.' });
    }
    const order = await Order.findOne({ _id: req.params.id, seller: req.session.userId })
      .populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// PUT /api/orders/:id
router.put('/:id', notImplemented);

// PATCH /api/orders/:id/status
// Body: { status }. Also returns a suggested customer message.
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['in-progress', 'ready', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, seller: req.session.userId },
      { status },
      { new: true }
    ).populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/orders/:id
// Restore materials if they were deducted (see services/inventory.js).
router.delete('/:id', notImplemented);

export default router;