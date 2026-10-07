// /api/products
//
//   GET    /       list this seller's products
//   POST   /       add a product
//   PUT    /:id    edit a product
//   DELETE /:id    delete (refused if an order still uses it)
import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import Product from '../models/Product.js';
import Product from '../models/Product.js';
import Material from '../models/Material.js';
import Order from '../models/Order.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth); // every route below needs a logged-in seller (req.user.id)

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

// ---------- helpers (same as routes/materials.js) ----------

// Wraps an async route so errors become JSON replies instead of crashing.
const handle = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    if (err.name === 'ValidationError') {
      const fields = Object.fromEntries(Object.entries(err.errors).map(([k, e]) => [k, e.message]));
      return res.status(400).json({ message: 'Please check the highlighted fields', fields });
    }
    if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Something went wrong' });
  });

// Throw this inside a route to reply with a status and message.
const fail = (status, message) => Object.assign(new Error(message), { status });

// Only these fields may come from the browser (never "seller").
const EDITABLE = ['name', 'price', 'makingTimeMins', 'recipe', 'variants'];
const pick = (body) => Object.fromEntries(EDITABLE.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

// Find a product by id that belongs to this seller, or 404.
async function findOwned(id, sellerId) {
  const product = await Product.findOne({ _id: id, seller: sellerId });
  if (!product) throw fail(404, 'Product not found');
  return product;
}

// Stop a seller from using someone else's material in their recipe
// (checks the main recipe AND every variant's extras).
async function checkMaterialsAreMine(body, sellerId) {
  const lines = [...(body.recipe ?? []), ...(body.variants ?? []).flatMap((v) => v.extras ?? [])];
  const ids = lines.map((line) => line.material);
  const count = await Material.countDocuments({ _id: { $in: ids }, seller: sellerId });
  if (count !== new Set(ids.map(String)).size) throw fail(400, 'A material in the recipe was not found');
}

// ---------- routes ----------

// GET /api/products
router.get('/', handle(async (req, res) => {
  const products = await Product.find({ seller: req.user.id }).sort({ name: 1 });
  res.json(products);
}));

// POST /api/products
router.post('/', handle(async (req, res) => {
  await checkMaterialsAreMine(req.body, req.user.id);
  const product = await Product.create({ ...pick(req.body), seller: req.user.id });
  res.status(201).json(product);
}));

// PUT /api/products/:id
router.put('/:id', handle(async (req, res) => {
  const product = await findOwned(req.params.id, req.user.id);
  await checkMaterialsAreMine(req.body, req.user.id);
  product.set(pick(req.body));
  await product.save(); // runs the model's validation rules
  res.json(product);
}));

// DELETE /api/products/:id
// Old orders point to their products, so we don't allow deleting one that is in use.
router.delete('/:id', handle(async (req, res) => {
  const product = await findOwned(req.params.id, req.user.id);
  const usedByOrder = await Order.exists({ seller: req.user.id, 'items.product': product._id });
  if (usedByOrder) throw fail(409, 'This product is in existing orders, so it cannot be deleted');
  await product.deleteOne();
  res.status(204).end();
}));

export default router;