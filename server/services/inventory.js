// Takes materials out of stock when an order comes in, and puts them back
// when an order is cancelled (deleted).
//
// Called by the ORDERS routes (server/routes/orders.js):
//   after creating an order   →  await deductMaterials(order)
//   before deleting an order  →  await restoreMaterials(order)
//   when editing an order     →  restore, change the order, then deduct again
//   before confirming         →  await checkOrder(items, sellerId)   (optional warning)
//
// Team rule: only 'quantity' materials are deducted. Level materials
// (Low / Medium / High) have no number to subtract, so they are skipped.
//
// Example: order = 2 × Matcha Latte (Oat milk)
//   Matcha Latte recipe:  4 g matcha, 1 bottle
//   Oat milk extras:      280 ml oat milk
//   One latte needs:      4 g matcha, 1 bottle, 280 ml oat milk
//   × 2 lattes:           8 g matcha, 2 bottles, 560 ml oat milk  ← taken out of stock
import Product from '../models/Product.js';
import Material from '../models/Material.js';

// -----------------------------------------------------
// STEP 1: work out how much of each material an order needs
// -----------------------------------------------------
// items    = order.items, e.g. [{ product: <id>, variant: 'Oat milk', quantity: 2 }]
// products = the products used in this order (from the database)
// Returns a list like [{ material: <id>, amount: 560 }, ...]
export function materialsNeeded(items, products) {
  let totals = []; // one entry per material

  for (let item of items) {
    // Find this item's product
    let product = products.find((p) => String(p._id) === String(item.product));
    if (!product) {
      continue; // product was deleted, nothing to deduct
    }

    // Main recipe + the chosen variant's extras.
    // If the variant can't be found (e.g. it was renamed), just use the main recipe.
    let lines = product.recipe;
    let variant = product.variants.find((v) => v.name === item.variant);
    if (variant) {
      lines = product.recipe.concat(variant.extras);
    }

    for (let line of lines) {
      let amount = line.amountPerUnit * item.quantity; // per unit × how many ordered

      // Add to this material's total (the same material may appear in several items)
      let existing = totals.find((t) => String(t.material) === String(line.material));
      if (existing) {
        existing.amount = existing.amount + amount;
      } else {
        totals.push({ material: line.material, amount: amount });
      }
    }
  }

  return totals;
}

// Loads the products an order uses, then calls materialsNeeded
async function materialsForOrder(items, sellerId) {
  let productIds = items.map((item) => item.product);
  let products = await Product.find({ _id: { $in: productIds }, seller: sellerId });
  return materialsNeeded(items, products);
}

// -----------------------------------------------------
// STEP 2: take materials out of stock
// -----------------------------------------------------
export async function deductMaterials(order) {
  if (order.materialsDeducted) {
    return; // already deducted, never deduct twice
  }

  let needed = await materialsForOrder(order.items, order.seller);

  for (let n of needed) {
    // $inc with a negative number = subtract, done safely inside MongoDB.
    // The filter only matches 'quantity' materials, so level materials are skipped.
    await Material.updateOne(
      { _id: n.material, seller: order.seller, trackingMode: 'quantity' },
      { $inc: { quantity: -n.amount } }
    );
  }

  order.materialsDeducted = true;
  await order.save();
}

// -----------------------------------------------------
// STEP 3: put materials back (order cancelled / deleted)
// -----------------------------------------------------
export async function restoreMaterials(order) {
  if (!order.materialsDeducted) {
    return; // nothing was taken out, so nothing to put back
  }

  let needed = await materialsForOrder(order.items, order.seller);

  for (let n of needed) {
    await Material.updateOne(
      { _id: n.material, seller: order.seller, trackingMode: 'quantity' },
      { $inc: { quantity: n.amount } } // positive = add back
    );
  }

  order.materialsDeducted = false;
  await order.save();
}

// -----------------------------------------------------
// OPTIONAL: check an order BEFORE saving it (POST /api/orders/check)
// -----------------------------------------------------
// Returns a list of problems, e.g.
//   [{ name: 'Oat milk', unit: 'ml', need: 560, have: 200, short: 360 }]
// An empty list means there is enough of everything.
export async function checkOrder(items, sellerId) {
  let needed = await materialsForOrder(items, sellerId);
  let problems = [];

  for (let n of needed) {
    let material = await Material.findOne({ _id: n.material, seller: sellerId });
    if (!material || material.trackingMode !== 'quantity') {
      continue; // deleted, or a level material (can't be counted)
    }
    if (material.quantity < n.amount) {
      problems.push({
        name: material.name,
        unit: material.unit,
        need: n.amount,
        have: material.quantity,
        short: n.amount - material.quantity,
      });
    }
  }

  return problems;
}