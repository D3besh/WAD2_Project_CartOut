// Entry point: starts Express, connects to MongoDB, mounts the API,
// and serves the built Vue app so http://localhost:PORT loads the home page.
import './config/env.js';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import productRoutes from './routes/products.js';
import materialRoutes from './routes/materials.js';
import deliveryRoutes from './routes/deliveries.js';
import { requireAuth } from './middleware/requireAuth.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sidekick';

const app = express();
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGODB_URI }),
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// Public routes
app.use('/api/auth', authRoutes);

// Everything below requires a logged-in seller
app.use('/api/orders', requireAuth, orderRoutes);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/materials', requireAuth, materialRoutes);
app.use('/api/deliveries', requireAuth, deliveryRoutes);

// Unknown API paths return JSON, not the Vue page
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));

// Serve the built Vue app (run `npm run build` first)
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

app.use(errorHandler);

connectDB(MONGODB_URI).then(() => {
  app.listen(PORT, () => console.log(`SideKick running at http://localhost:${PORT}`));
});
