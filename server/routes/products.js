// /api/products
//
//   GET    /       list this seller's products (archived ones are hidden)
//   POST   /       add a product
//   PUT    /:id    edit a product (can't remove a variant that an in-progress order uses)
//   DELETE /:id    delete, archive or refuse, depending on the orders that use it:
//
//     Product is in...                 → what happens
//     an IN-PROGRESS order             → REFUSED (seller still has to make it)
//     only ready / completed orders    → ARCHIVED (hidden, but old orders still show it)
//     no orders                        → DELETED for real
import { Router } from 'express';
import Product from '../models/Product.js';
import Material from '../models/Material.js';
import Order from '../models/Order.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth); // every route below needs a logged-in seller (req.user.id)

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

// Only these fields may come from the browser (never "seller" or "archived").
const EDITABLE = ['name', 'price', 'cost', 'makingTimeMins', 'recipe', 'variants'];
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

// Variants being removed (or renamed) that an IN-PROGRESS order still uses.
// Why: if that order is cancelled, we need the variant's recipe to put its materials back.
// (Ready / completed orders can't be cancelled, and they store the variant name as text,
//  so they still display fine.)
//
// Example: old variants = Oat milk, Fresh milk. New variants = Fresh milk.
//          "Oat milk" was removed → if an in-progress order uses it, return ['Oat milk']
async function removedVariantsInUse(product, newVariants, sellerId) {
  let newNames = newVariants.map((v) => (v.name || '').trim());
  let removed = product.variants.map((v) => v.name).filter((name) => !newNames.includes(name));

  let inUse = [];
  for (let name of removed) {
    // $elemMatch = the SAME order item must have this product AND this variant
    let used = await Order.exists({
      seller: sellerId,
      status: 'in-progress',
      items: { $elemMatch: { product: product._id, variant: name } },
    });
    if (used) {
      inUse.push(name);
    }
  }
  return inUse;
}

// ---------- routes ----------

// GET /api/products
// Archived products are left out, so they disappear from the Products page
// and from the order form's product dropdown.
// ($ne = "not equal": products saved before the archived field existed have no
//  value at all, and still count as not archived.)
router.get('/', handle(async (req, res) => {
  const products = await Product.find({ seller: req.user.id, archived: { $ne: true } }).sort({ name: 1 });
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

  // Don't allow removing/renaming a variant that an in-progress order uses
  if (req.body.variants) {
    const inUse = await removedVariantsInUse(product, req.body.variants, req.user.id);
    if (inUse.length > 0) {
      throw fail(409, `"${inUse.join('", "')}" is in an in-progress order, so it cannot be removed or renamed yet`);
    }
  }

  product.set(pick(req.body));
  await product.save(); // runs the model's validation rules
  res.json(product);
}));

// DELETE /api/products/:id
//   In an in-progress order?        → 409 refused
//   Only in ready/completed orders? → ARCHIVE it. Replies 200 { archived: true }
//   Never ordered?                  → delete it for real. Replies 204 (no content)
router.delete('/:id', handle(async (req, res) => {
  const product = await findOwned(req.params.id, req.user.id);

  // 1. Still being made for someone? Then it can't go yet.
  const inProgressCount = await Order.countDocuments({
    seller: req.user.id,
    status: 'in-progress',
    'items.product': product._id,
  });
  if (inProgressCount > 0) {
    throw fail(409, `${product.name} is in ${inProgressCount} in-progress order(s). Complete or cancel them first.`);
  }

  // 2. Used in older (ready / completed) orders? Hide it instead of deleting,
  //    so those orders can still show the product.
  const usedByOrder = await Order.exists({ seller: req.user.id, 'items.product': product._id });
  if (usedByOrder) {
    product.archived = true;
    await product.save();
    return res.json({ archived: true });
  }

  // 3. Never ordered: delete it for real.
  await product.deleteOne();
  res.status(204).end();
}));

export default router;