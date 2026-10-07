// /api/materials
//
//   GET    /                 list this seller's materials (+ which products use each)
//   GET    /shopping-list    low materials with a suggested amount to buy
//   POST   /                 add a material
//   PUT    /:id              edit a material
//   PATCH  /:id/restock      "Mark as restocked"
//   DELETE /:id              delete (refused if a product recipe still uses it)
import { Router } from 'express';
import Material from '../models/Material.js';
import Product from '../models/Product.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth); // every route below needs a logged-in seller (req.user.id)

// ---------- helpers ----------

// Wraps an async route so errors become JSON replies instead of crashing.
// (Works on both Express 4 and 5.)
const handle = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    if (err.name === 'ValidationError') {
      const fields = Object.fromEntries(Object.entries(err.errors).map(([k, e]) => [k, e.message]));
      return res.status(400).json({ message: 'Please check the highlighted fields', fields });
    }
    if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You already have a material with that name', fields: { name: 'Already used' } });
    }
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Something went wrong' });
  });

// Throw this inside a route to reply with a status and message.
const fail = (status, message) => Object.assign(new Error(message), { status });

// Only these fields may come from the browser (never "seller").
const EDITABLE = ['name', 'unit', 'trackingMode', 'quantity', 'level', 'lowStockThreshold'];
const pick = (body) => Object.fromEntries(EDITABLE.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

// Find a material by id that belongs to this seller, or 404.
async function findOwned(id, sellerId) {
  const material = await Material.findOne({ _id: id, seller: sellerId });
  if (!material) throw fail(404, 'Material not found');
  return material;
}

// Which products use each material? → Map of materialId → [product names]
// Looks at the base recipe and every variant's extras.
async function usageMap(sellerId) {
  const products = await Product.find({ seller: sellerId });
  const usage = new Map();
  for (const p of products) {
    const lines = [...(p.recipe ?? []), ...(p.variants ?? []).flatMap((v) => v.extras ?? [])];
    for (const line of lines) {
      const id = String(line.material);
      if (!usage.has(id)) usage.set(id, new Set());
      usage.get(id).add(p.name);
    }
  }
  return usage;
}

// ---------- routes ----------

// GET /api/materials
router.get('/', handle(async (req, res) => {
  const [materials, usage] = await Promise.all([
    Material.find({ seller: req.user.id }).sort({ name: 1 }),
    usageMap(req.user.id),
  ]);
  // Merge: add "usedIn" to every material
  res.json(materials.map((m) => ({ ...m.toJSON(), usedIn: [...(usage.get(m.id) ?? [])] })));
}));

// GET /api/materials/shopping-list
// (Must come before the "/:id" routes, or "shopping-list" would be read as an id.)
// router.get('/shopping-list', handle(async (req, res) => {
//   const [materials, usage] = await Promise.all([
//     Material.find({ seller: req.user.id }).sort({ name: 1 }),
//     usageMap(req.user.id),
//   ]);

//   const list = materials
//     .filter((m) => m.isLow)
//     .map((m) => ({
//       id: m.id,
//       name: m.name,
//       unit: m.unit,
//       trackingMode: m.trackingMode,
//       have: m.trackingMode === 'quantity' ? m.quantity : m.level,
//       // Rule: buy enough to get back to twice the low-stock threshold.
//       suggestedBuy:
//         m.trackingMode === 'quantity' && m.lowStockThreshold != null
//           ? Math.max(0, Math.ceil(m.lowStockThreshold * 2 - m.quantity))
//           : null,
//       usedIn: [...(usage.get(m.id) ?? [])],
//     }))
//     // Materials needed by the most products come first.
//     .sort((a, b) => b.usedIn.length - a.usedIn.length);

//   res.json(list);
// }));

// POST /api/materials
router.post('/', handle(async (req, res) => {
  const material = await Material.create({ ...pick(req.body), seller: req.user.id });
  res.status(201).json(material);
}));

// PUT /api/materials/:id
router.put('/:id', handle(async (req, res) => {
  const material = await findOwned(req.params.id, req.user.id);
  material.set(pick(req.body));
  await material.save(); // runs the model's validation rules
  res.json(material);
}));

// PATCH /api/materials/:id/restock
//   quantity: { amount: 500 }   → adds 500 to the current quantity
//   level:    { level: 'high' } → sets the level (High if not given)
router.patch('/:id/restock', handle(async (req, res) => {
  const material = await findOwned(req.params.id, req.user.id);

  if (material.trackingMode === 'quantity') {
    const amount = Number(req.body.amount);
    if (!(amount > 0)) throw fail(400, 'Enter how much you bought');
    // $inc adds inside MongoDB in one step, so two restocks at once can't overwrite each other.
    const updated = await Material.findByIdAndUpdate(material._id, { $inc: { quantity: amount } }, { new: true });
    return res.json(updated);
  }

  material.level = req.body.level ?? 'high';
  await material.save();
  res.json(material);
}));

// DELETE /api/materials/:id
router.delete('/:id', handle(async (req, res) => {
  const material = await findOwned(req.params.id, req.user.id);
  const usedIn = [...((await usageMap(req.user.id)).get(material.id) ?? [])];
  if (usedIn.length) throw fail(409, `Remove it from these products first: ${usedIn.join(', ')}`);
  await material.deleteOne();
  res.status(204).end();
}));

export default router;
