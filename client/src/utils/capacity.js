
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

    let possible = Math.max(0, Math.floor(material.quantity / line.amountPerUnit));

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