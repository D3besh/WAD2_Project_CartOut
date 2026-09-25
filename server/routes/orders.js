import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

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
// Creates an order. Decide (and document) when materials are deducted.
router.post('/', notImplemented);

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
