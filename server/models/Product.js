import mongoose from 'mongoose';

// One line of a product's recipe: how much of a material one unit uses.
const recipeItemSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
    amountPerUnit: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Something the seller sells, e.g. "Lavender candle".
const productSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    variants: [{ type: String, trim: true }], // e.g. ['glass jar', 'tin']
    price: { type: Number, min: 0 },
    recipe: [recipeItemSchema],

    // Optional, only needed if you build the production schedule
    makingTimeHours: { type: Number, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Product', productSchema);
