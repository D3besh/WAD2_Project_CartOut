import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

router.get('/', notImplemented);

// GET /api/materials/shopping-list
// Materials at or below their threshold (or at level 'low').
// Must be declared before '/:id' so Express doesn't treat it as an id.
router.get('/shopping-list', notImplemented);

router.post('/', notImplemented);
router.put('/:id', notImplemented);

// PATCH /api/materials/:id/restock  ("Mark as restocked")
router.patch('/:id/restock', notImplemented);

router.delete('/:id', notImplemented); // TODO: what if a product recipe uses it?

export default router;
