// Turns a pasted customer message into suggested order fields.
//
// Suggested shape of the result:
//   { fields: { customerName, items, price, fulfilmentMethod, dueAt },
//     missing: ['price', 'fulfilmentMethod'] }
//
// TODO:
//   1. Send the message to the AI (if your instructor approves) and ask for
//      JSON only. Keep GEMINI_API_KEY on the server.
//   2. Validate the AI's output with your own code: match items against
//      the seller's product catalogue, and turn relative dates
//      ("next friday") into real dates.
//   3. If the AI fails or is out of quota, return everything as missing
//      so the seller can fill in the form manually.
//
// When USE_MOCK_APIS=true, return the contents of tests/mocks/extraction.json
// so tests are stable and don't use API quota.

import Fuse from "fuse.js";
import Product from "../models/Product.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Check AI Studio for the current free Flash model name and set it in .env
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Keep these in sync with the enums in your Order schema
const PLATFORMS = ["whatsapp", "instagram", "telegram", "tiktok", "other"];
const PAYMENT_STATUSES = ["unpaid", "deposit", "paid"];
const FULFILMENT_METHODS = ["delivery", "self-collect"];

const SYSTEM = `Extract order details from the customer message.
Return ONLY JSON in this shape:
{
  "customerName": string | null,
  "customerContact": string | null,
  "customerEmail": string | null,
  "platform": ${PLATFORMS.map((p) => `"${p}"`).join(" | ")} | null,
  "items": [{ "name": string, "variant": string | null, "quantity": integer | null, "notes": string | null }],
  "fulfilmentMethod": ${FULFILMENT_METHODS.map((m) => `"${m}"`).join(" | ")} | null,
  "deliveryAddress": string | null,
  "dueAt": string | null,   // ISO 8601, e.g. 2026-10-10 or 2026-10-10T15:00
  "paymentStatus": ${PAYMENT_STATUSES.map((s) => `"${s}"`).join(" | ")} | null,
  "depositAmount": number | null,
  "unclear": [string]
}
Rules: use null when something is not stated and never invent values.
Do not guess prices. Convert number words to integers ("a dozen" = 12).
Put an email address in "customerEmail" only, never in "customerContact". 
Use null if no email is stated. Copy it exactly as written, never guess or complete one.
Match variants only when the customer explicitly states one. Never invent a variant.
If the customer explicitly asks for the regular, normal, plain or original version,
set "variant" to "Regular". If they say nothing about the version, use null.
Resolve relative dates and times using today's date.
Examples:
- "tomorrow" = the day after today's date
- "next Friday" = the Friday of the following week
- "this Friday" = the upcoming Friday in the current week
- "next week" = the corresponding period in the following week
If a relative date is ambiguous, put it in "unclear". 
Extract item-specific special instructions into "notes".
Use null when no special instructions are stated.
Do not treat general comments, such as "for my friend", as
preparation instructions unless they affect how the item should be prepared.
Put anything ambiguous (e.g. "same as last time") in "unclear".`

function buildSystem(products) {
  const catalog = products.map((p) => ({
    name: p.name,
    variants: (p.variants ?? []).map((v) => v.name),
  }));

  return `${SYSTEM}

This seller's product catalog (JSON):
${JSON.stringify(catalog)}

Catalog rules:
- Each item's "name" must be copied exactly from a catalog product "name". Never put the variant inside "name".
- "variant" must be copied exactly from that product's "variants" list. Use "Regular" only if the customer explicitly asks for the plain/regular version. Use null if they don't say.
- If the product has no variants, "variant" is always null.
- If the customer's wording does not clearly match a catalog product or variant, put their own words in "name" (or "variant") and add a note to "unclear". Do not guess.`;
};

async function callLLM(message, system) {
  try {
    console.log("Trying Gemini...");

    const result = await callGemini(message, system);

    console.log("Gemini succeeded:");
    console.dir(result, { depth: null });

    return result;
  } catch (error) {
    console.error("Gemini failed:", error.message);

    if (
      error.code !== "ECONNABORTED" &&
      error.code !== "ETIMEDOUT" &&
      ![429, 500, 502, 503, 504].includes(error.status)
    ) {
      throw error;
    }
  }

  try {
    console.log("Trying Groq...");

    const result = await callGroq(message, system);

    console.log("Groq succeeded:");
    console.dir(result, { depth: null });

    return result;
  } catch (error) {
    console.error("Groq failed:", error.message);
    throw new Error("Both Gemini and Groq failed");
  }
}

async function callGemini(message, system) {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await axios.post(
      GEMINI_URL,
      {
        systemInstruction: {
          parts: [{ text: `${system}\nToday's date: ${today}` }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY2,
        },
        timeout: 10000,
      },
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no text");
    }

    return JSON.parse(text);
  } catch (error) {
    const status = error.response?.status;

    const errorMessage = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    console.error("Gemini error:", errorMessage);

    const newError = new Error(
      `Gemini request failed with status ${status}: ${errorMessage}`,
    );

    newError.status = status;
    newError.code = error.code;
    throw newError;
  }
}

async function callGroq(message, system) {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: process.env.GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `${system}\nToday's date: ${today}`,
          },
          {
            role: "user",
            content: message,
          },
        ],
        temperature: 0,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        timeout: 10000,
      },
    );

    const text = response.data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("Groq returned no text");
    }

    return JSON.parse(text);
  } catch (error) {
    const status = error.response?.status;

    const errorMessage = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    console.error("Groq error:", errorMessage);

    const newError = new Error(
      `Groq request failed with status ${status}: ${errorMessage}`,
    );

    newError.status = status;
    newError.code = error.code;
    throw newError;
  }
}

function combineDuplicateItems(items) {
  const combined = new Map();

  for (const item of items) {
    // Same product and variant should be combined.
    const key = [
      item.product ?? item.name ?? item.requestedName,
      (item.variant ?? "").trim().toLowerCase(),
      (item.notes ?? "").trim().toLowerCase(),
    ].join("|");

    if (combined.has(key)) {
      combined.get(key).quantity += item.quantity ?? 0;
    } else {
      combined.set(key, { ...item });
    }
  }

  return [...combined.values()];
}

// module level, above parseOrder
const REGULAR_WORDS = new Set(["regular", "plain", "original", "normal", "standard", "default"]);
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// lowercase words, plural "s" stripped so "candles" matches "candle"
const tokens = (s) =>
  (String(s ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []).map((t) => t.replace(/s$/, ""));

export async function parseOrder(message, sellerId) {
  // load this seller's catalog once: used for the prompt AND for matching
  const products = await Product.find({ seller: sellerId }).select("name variants").lean();

  const raw = await callLLM(message, buildSystem(products));
  raw.items = combineDuplicateItems(raw.items ?? []);
  const problems = [...(raw.unclear ?? [])];

  // Drop values outside the schema's enums instead of letting the save fail later
  const pickEnum = (value, allowed, label) => {
    if (value == null) return undefined;
    if (allowed.includes(value)) return value;
    problems.push(`Unrecognised ${label}: "${value}"`);
    return undefined;
  };

  const platform = pickEnum(raw.platform, PLATFORMS, "platform");
  const paymentStatus = pickEnum(raw.paymentStatus, PAYMENT_STATUSES, "payment status");
  const fulfilmentMethod = pickEnum(raw.fulfilmentMethod, FULFILMENT_METHODS, "fulfilment method");
  const depositAmount = Number.isFinite(raw.depositAmount) ? raw.depositAmount : undefined;

  let dueAt;
  if (raw.dueAt) {
    if (Number.isNaN(Date.parse(raw.dueAt))) problems.push(`Could not read the due date "${raw.dueAt}"`);
    else dueAt = raw.dueAt;
  }

  let customerEmail;
  if (raw.customerEmail) {
    const email = String(raw.customerEmail).trim();
    if (EMAIL_RE.test(email)) customerEmail = email.toLowerCase();
    else problems.push(`Could not read the email "${raw.customerEmail}"`);
  }

  // ---- matching: one candidate per product, and one per product + variant ----
  const candidates = products.flatMap((p) => [
    { product: p, variant: null, tokens: new Set(tokens(p.name)) },
    ...(p.variants ?? []).map((v) => ({
      product: p,
      variant: v,
      tokens: new Set([...tokens(p.name), ...tokens(v.name)]),
    })),
  ]);

  function rank(query) {
    const q = new Set(tokens(query).filter((t) => !REGULAR_WORDS.has(t)));
    if (!q.size) return [];
    return candidates
      .map((c) => {
        const shared = [...q].filter((t) => c.tokens.has(t)).length;
        const coverage = shared / q.size; // share of the customer's words that matched
        const tightness = shared / new Set([...q, ...c.tokens]).size; // tie-break: closest candidate
        return { ...c, coverage, tightness };
      })
      .filter((c) => c.coverage > 0)
      .sort((a, b) => b.coverage - a.coverage || b.tightness - a.tightness);
  }

  // typo fallback (products only)
  const fuse = new Fuse(products, { keys: ["name"], threshold: 0.4, ignoreLocation: true });

  const items = (raw.items ?? []).map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      problems.push(`Missing or invalid quantity for "${item.name}"`);
    }

    // search name + variant together, so it works whether or not the LLM split them
    const query = [item.name, item.variant].filter(Boolean).join(" ");
    const ranked = rank(query);
    const top = ranked[0];

    let product = null;
    let variant = null;

    if (top && top.coverage >= 0.5) {
      product = top.product;
      variant = top.variant;

      // flag only when a DIFFERENT product matches just as well
      const rival = ranked.find(
        (c) => String(c.product._id) !== String(top.product._id) && c.coverage >= top.coverage,
      );
      if (rival) problems.push(`"${query}" could be ${top.product.name} or ${rival.product.name}`);
    } else {
      product = fuse.search(item.name)[0]?.item ?? null;
      if (!product) problems.push(`No matching product for "${item.name}"`);
      else if (item.variant && !REGULAR_WORDS.has(item.variant.toLowerCase())) {
        problems.push(`Could not match variant "${item.variant}" for ${product.name}`);
      }
    }

    return {
      product: product?._id ?? null,
      variantId: variant?._id ?? null, // null = Regular
      variant: variant?.name, // canonical name from the database
      quantity: item.quantity ?? undefined,
      notes: item.notes ?? undefined,
      requestedName: item.name, // display only
      requestedVariant: item.variant ?? null, // display only
      matchedName: product?.name ?? null, // display only
    };
  });

  // The same rules your POST / route enforces, surfaced early so the seller sees them
  if (fulfilmentMethod === "delivery" && !raw.deliveryAddress?.trim()) {
    problems.push("Delivery address is required for delivery orders");
  }
  if (paymentStatus === "deposit" && !(depositAmount > 0)) {
    problems.push("Enter the deposit amount");
  }

  const result = {
    customerName: raw.customerName ?? undefined,
    customerContact: raw.customerContact ?? undefined,
    customerEmail,
    platform,
    items,
    price: undefined, // the seller sets this
    paymentStatus,
    depositAmount,
    fulfilmentMethod,
    deliveryAddress: raw.deliveryAddress ?? undefined,
    dueAt,
    rawMessage: message,
    problems,
    needsReview: problems.length > 0,
  };

  console.log("Parsed order:");
  console.dir(result, { depth: null });
  return result;
}