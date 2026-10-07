import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import '../models/Product.js';
import Order from '../models/Order.js';
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

// POST /api/orders/extract
// Body: { message }. Returns suggested fields plus a list of missing ones.
// Uses services/extraction.js.
router.post('/extract', notImplemented);

// POST /api/orders/check
// Body: a draft order. Returns whether it can be fulfilled with current stock.
// Uses services/feasibility.js.
router.post('/check', notImplemented);

// POST /api/orders
// Creates an order. Decide (and document) when materials are deducted.
router.post('/', notImplemented);

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
