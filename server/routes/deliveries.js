import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

// GET /api/deliveries/today
// Orders due today. Optionally ordered for travel using services/onemap.js.
router.get('/today', notImplemented);

export default router;
