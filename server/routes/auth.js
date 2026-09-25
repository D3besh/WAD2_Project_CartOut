import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

// POST /api/auth/register
// TODO: validate input, check the email isn't taken, hash the password
// (bcryptjs), create the User, then set req.session.userId.
router.post('/register', notImplemented);

// POST /api/auth/login
// TODO: find the user by email, compare the password hash,
// set req.session.userId on success.
router.post('/login', notImplemented);

// POST /api/auth/logout
// TODO: destroy the session.
router.post('/logout', notImplemented);

// GET /api/auth/me
// TODO: return the logged-in seller (without the password hash), or 401.
// The front end calls this to decide whether to show the login page.
router.get('/me', notImplemented);

export default router;
