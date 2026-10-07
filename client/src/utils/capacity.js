// "How many of this product can I make with the materials I have now?"
//
// STEP 1 — fullRecipe(product, variant)
//   A variant only lists its EXTRA materials. So first we combine:
//     main recipe + the variant's extras = everything needed for ONE unit.
//   If the same material is in both, we add the amounts together.
//
//   Example: Matcha Latte, "Oat milk" variant
//     main recipe:  4 g matcha, 1 bottle
//     extras:       280 ml oat milk
//     full recipe:  4 g matcha, 1 bottle, 280 ml oat milk
//
// STEP 2 — calculateCanMake(recipe, materials)
//   For each material in the recipe:  stock ÷ amount needed, rounded down.
//   The SMALLEST answer is how many you can make.
//   That material is the "bottleneck" (it runs out first).
//
//   Example: 180 g matcha ÷ 4 = 45,  14 bottles ÷ 1 = 14,  1500 ml oat milk ÷ 280 = 5
//   Smallest = 5 → you can make 5, limited by Oat milk.
//
// Level materials (Low / Medium / High) have no number, so they can't be counted.
// We skip them, but add a warning if one is Low.

// ---------- STEP 1 ----------
// variant can be null (no variant → just the main recipe)
export function fullRecipe(product, variant) {
  let allLines = product.recipe;
  if (variant) {
    allLines = product.recipe.concat(variant.extras); // join the two lists
  }

  let combined = [];
  for (let line of allLines) {
    // Is this material already in the combined list?
    let existing = combined.find((c) => c.material === line.material);

    if (existing) {
      existing.amountPerUnit = existing.amountPerUnit + line.amountPerUnit; // add amounts
    } else {
      combined.push({ material: line.material, amountPerUnit: line.amountPerUnit });
    }
  }
  return combined;
}

// ---------- STEP 2 ----------
// recipe    = list of { material, amountPerUnit } (from fullRecipe)
// materials = the list from /api/materials
// Returns { canMake, limitedBy, warnings }
//   canMake is null if nothing in the recipe can be counted.
export function calculateCanMake(recipe, materials) {
  let canMake = Infinity; // start very big, then go down
  let limitedBy = '';
  let warnings = [];

  for (let line of recipe) {
    // Find the material this recipe line uses
    let material = materials.find((m) => m.id === line.material);

    if (!material) {
      // The material was deleted, so this product can't be made
      return { canMake: 0, limitedBy: 'a deleted material', warnings: warnings };
    }

    if (material.trackingMode === 'level') {
      if (material.level === 'low') {
        warnings.push(material.name + ' is low');
      }
      continue; // skip to the next recipe line
    }

    let possible = Math.floor(material.quantity / line.amountPerUnit);

    if (possible < canMake) {
      canMake = possible;
      limitedBy = material.name;
    }
  }

  // Still Infinity = no countable materials (empty recipe, or only level materials)
  if (canMake === Infinity) {
    canMake = null;
  }

  return { canMake: canMake, limitedBy: limitedBy, warnings: warnings };
}