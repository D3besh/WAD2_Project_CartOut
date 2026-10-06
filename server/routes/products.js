import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import Product from '../models/Product.js';

const router = Router();

// Products and their recipes (which materials, and how much per unit).

// GET /api/products
// Returns only the logged-in seller's products, sorted by name.
router.get('/', async (req, res, next) => {
  try {
    const products = await Product.find({ seller: req.session.userId }).sort({ name: 1 });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

router.post('/', notImplemented);
router.get('/:id', notImplemented);
router.put('/:id', notImplemented);
router.delete('/:id', notImplemented); // TODO: what if open orders use this product?

export default router;