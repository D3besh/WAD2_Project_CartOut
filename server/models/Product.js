import mongoose from 'mongoose';

// Something the seller sells, e.g. "Matcha Latte".
//
// recipe = the materials needed to make ONE unit, e.g.
//   [{ material: <Matcha powder id>, amountPerUnit: 4 },
//    { material: <Oat milk id>,      amountPerUnit: 280 }]
//
// variants (optional) = different versions, e.g. "Oat milk" with a different price.
//   extras = materials only that variant needs, on top of the recipe.
//
// archived = the seller "deleted" it, but past (ready/completed) orders still use it,
//            so we only hide it.

// One line of a recipe
const recipeLineSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
    amountPerUnit: { type: Number, required: true, min: [0.01, 'Amount must be more than 0'] },
  },
  { _id: false } // recipe lines don't need their own id
);

const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, min: 0 },        // empty = same as the product's price
    cost: { type: Number, min: 0 }, 
    extras: [recipeLineSchema],
  },
);

const productSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 60 },
    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    cost: { type: Number, min: 0, default: null },
    makingTimeMins: { type: Number, min: 0, default: null }, // optional
    recipe: [recipeLineSchema],
    variants: [variantSchema],

    // true = hidden from the Products page and the order form, but kept in the
    // database so old orders can still show it (and restore its materials).
    // Set when the seller deletes a product that is used in orders.
    archived: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true } } // so "id" appears in JSON, like materials
);

export default mongoose.model('Product', productSchema);