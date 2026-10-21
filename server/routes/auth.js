import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import User from '../models/User.js';

const router = Router();

// POST /api/auth/register
// TODO: validate input, check the email isn't taken, hash the password
// (bcryptjs), create the User, then set req.session.userId.
//router.post('/register', notImplemented);

import { registerUser, loginUser, updateShopName, updateEmail, updatePassword, HttpError, deleteProfile } from '../services/userService.js';

router.post('/register', async (req, res) => {
  try {
    const { username, email, shopName, password } = req.body;

    if (!username || !email || !shopName || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // makes sure these are strings, so .trim() can't crash on an object or number
    if ([username, email, shopName, password].some((v) => typeof v !== 'string')) {
      return res.status(400).json({ message: 'Invalid input.' });
    }

    if (username.trim().length < 3 || username.trim().length > 20) {
      return res.status(400).json({ message: 'Username must be 3 to 20 characters.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const user = await registerUser({
      username: username.trim(),
      email: email.trim(),
      shopName: shopName.trim(),
      password, // never trim the password
    });

    return res.status(201).json({ message: 'Account created successfully.' });
  } catch (err) {
    // known problems from the service or schema: send the message back
    if (err.status === 409 || err.name === 'ValidationError') {
      return res.status(err.status || 400).json({ message: err.message });
    }

    console.error(err);
    return res.status(500).json({ message: 'Server error. Could not create account.' });
  }
});




// POST /api/auth/login
// TODO: find the user by email, compare the password hash,
// set req.session.userId on success.
router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await loginUser(username.trim(), password);
    if (!user) return res.status(401).json({ message: 'Invalid username or password' });

    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.userId = user._id;

    if (rememberMe === true) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 7; // 7 days
    }
    // otherwise no maxAge: the cookie ends when the browser closes

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// POST /api/auth/logout
// TODO: destroy the session.
router.post('/logout', async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });

    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Logout failed' });
  }
});

// GET /api/auth/me
// TODO: return the logged-in seller (without the password hash), or 401.
// The front end calls this to decide whether to show the login page.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(401).json({ message: 'Not logged in' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// shared error handler for the three routes
function handleError(err, res, fallback) {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  console.error(err);
  return res.status(500).json({ message: fallback });
}

router.patch('/me/shop-name', requireAuth, async (req, res) => {
  try {
    const user = await updateShopName(req.user.id, req.body.shopName);
    res.json(user);
  } catch (err) {
    handleError(err, res, 'Could not update shop name.');
  }
});

router.patch('/me/email', requireAuth, async (req, res) => {
  try {
    const user = await updateEmail(req.user.id, req.body.email);
    res.json(user);
  } catch (err) {
    handleError(err, res, 'Could not update email.');
  }
});

router.patch('/me/password', requireAuth, async (req, res) => {
  try {
    await updatePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    handleError(err, res, 'Could not update password.');
  }
});

router.delete('/me', requireAuth, async (req, res) => {
  try {
    await deleteProfile(req.user.id, req.body.password);

    req.session.destroy((err) => {
      if (err) console.error(err);
      res.clearCookie('connect.sid'); // use your session cookie name if you changed it
      res.json({ message: 'Account deleted.' });
    });
  } catch (err) {
    handleError(err, res, 'Could not delete account.');
  }
});

export default router;
