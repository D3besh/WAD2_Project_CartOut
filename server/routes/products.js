import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

// Products and their recipes (which materials, and how much per unit).
router.get('/', notImplemented);
router.post('/', notImplemented);
router.get('/:id', notImplemented);
router.put('/:id', notImplemented);
router.delete('/:id', notImplemented); // TODO: what if open orders use this product?

export default router;
