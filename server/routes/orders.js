import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import Order from '../models/Order.js';

const router = Router();

// Every handler must only touch orders where seller === req.session.userId.

// GET /api/orders?status=ready&date=today
router.get('/', notImplemented);

// POST /api/orders/extract
// Body: { message }. Returns suggested fields plus a list of missing ones.
// Uses services/extraction.js.
router.post('/extract', notImplemented);

// POST /api/orders/check
// Body: a draft order. Returns whether it can be fulfilled with current stock.
// Uses services/feasibility.js.
router.post('/check', notImplemented);

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

    const order = await Order.create({
      seller: req.session.userId,
      customerName,
      customerContact,
      platform: platform || undefined, // empty string would fail the enum check
      items,
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
router.get('/:id', notImplemented);

// PUT /api/orders/:id
router.put('/:id', notImplemented);

// PATCH /api/orders/:id/status
// Body: { status }. Also returns a suggested customer message.
router.patch('/:id/status', notImplemented);

// DELETE /api/orders/:id
// Restore materials if they were deducted (see services/inventory.js).
router.delete('/:id', notImplemented);

export default router;