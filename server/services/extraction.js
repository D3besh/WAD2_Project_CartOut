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

export async function extractOrderDetails(/* message, products */) {
  throw new Error('extractOrderDetails is not implemented yet');
}

import Fuse from 'fuse.js';
import Product from '../models/Product.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Check AI Studio for the current free Flash model name and set it in .env
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Keep these in sync with the enums in your Order schema
const PLATFORMS = ['whatsapp', 'instagram', 'telegram', 'tiktok', 'other'];
const PAYMENT_STATUSES = ['unpaid', 'deposit', 'paid'];
const FULFILMENT_METHODS = ['delivery', 'self-collect'];

const SYSTEM = `Extract order details from the customer message.
Return ONLY JSON in this shape:
{
  "customerName": string | null,
  "customerContact": string | null,
  "platform": ${PLATFORMS.map((p) => `"${p}"`).join(' | ')} | null,
  "items": [{ "name": string, "variant": string | null, "quantity": integer | null, "notes": string | null }],
  "fulfilmentMethod": ${FULFILMENT_METHODS.map((m) => `"${m}"`).join(' | ')} | null,
  "deliveryAddress": string | null,
  "dueAt": string | null,   // ISO 8601, e.g. 2026-10-10 or 2026-10-10T15:00
  "paymentStatus": ${PAYMENT_STATUSES.map((s) => `"${s}"`).join(' | ')} | null,
  "depositAmount": number | null,
  "unclear": [string]
}
Rules: use null when something is not stated and never invent values.
Do not guess prices. Convert number words to integers ("a dozen" = 12).
Match variants only when the customer explicitly states one. Never invent a variant.
Resolve relative dates and times using today's date.
Examples:
- "tomorrow" = the day after today's date
- "next Friday" = the Friday of the following week
- "this Friday" = the upcoming Friday in the current week
- "next week" = the corresponding period in the following week
If a relative date is ambiguous, put it in "unclear". Put anything ambiguous
(e.g. "same as last time") in "unclear".`;

// async function callLLM(message) {
//   try {
//     console.log('Trying Gemini...');
//     const result = await callGemini(message);

//     console.log('Gemini succeeded:');
//     console.log(result);
//     return result;
//   } catch (error) {
//     console.error('Gemini failed:', error.message);

//     if (error.name !== 'TimeoutError' && ![429, 500, 502, 503, 504].includes(error.status)) {
//       throw error;
//     }
//   }

//   try {
//     console.log('Trying Groq...');
//     const result = await callGroq(message);
//     console.log('Groq succeeded');
//     console.log(result);
//     return result;
//   } catch (error) {
//     console.error('Groq failed:', error.message);
//     throw new Error('Both Gemini and Groq failed');
//   }
// }

async function callLLM(message) {
  try {
    console.log('Trying Gemini...');

    const result = await callGemini(message);

    console.log('Gemini succeeded:');
    console.dir(result, { depth: null });

    return result;

  } catch (error) {
    console.error('Gemini failed:', error.message);

    if (
      error.code !== 'ECONNABORTED' &&
      error.code !== 'ETIMEDOUT' &&
      ![429, 500, 502, 503, 504].includes(error.status)
    ) {
      throw error;
    }
  }

  try {
    console.log('Trying Groq...');

    const result = await callGroq(message);

    console.log('Groq succeeded:');
    console.dir(result, { depth: null });

    return result;

  } catch (error) {
    console.error('Groq failed:', error.message);
    throw new Error('Both Gemini and Groq failed');
  }
}

// async function callGemini(message) {
//   const today = new Date().toISOString().slice(0, 10);
//   const res = await fetch(GEMINI_URL, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'x-goog-api-key': process.env.GEMINI_API_KEY2,
//     },
//     body: JSON.stringify({
//       systemInstruction: { parts: [{ text: `${SYSTEM}\nToday's date: ${today}` }] },
//       contents: [{ role: 'user', parts: [{ text: message }] }],
//       generationConfig: { responseMimeType: 'application/json', temperature: 0 },
//     }),
//     signal: AbortSignal.timeout(10000),
//   });

//   if (!res.ok) {
//   const errorText = await res.text();
//   //console.error('Gemini error:', errorText);

//   const error = new Error(
//     `Gemini request failed with status ${res.status}: ${errorText}`
//   );

//   error.status = res.status;
//   throw error;
// }

//   const data = await res.json();
//   const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
//   if (!text) throw new Error('LLM returned no text');
//   return JSON.parse(text);
// }

async function callGemini(message) {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await axios.post(
      GEMINI_URL,
      {
        systemInstruction: {
          parts: [{ text: `${SYSTEM}\nToday's date: ${today}` }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: message }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY2,
        },
        timeout: 10000,
      }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini returned no text');
    }

    return JSON.parse(text);

  } catch (error) {
    const status = error.response?.status;

    const errorMessage =
      error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

    console.error('Gemini error:', errorMessage);

    const newError = new Error(
      `Gemini request failed with status ${status}: ${errorMessage}`
    );

    newError.status = status;
    newError.code = error.code;
    throw newError;
  }
}

// async function callGroq(message) {
//   const today = new Date().toISOString().slice(0, 10);

//   const res = await fetch(
//     'https://api.groq.com/openai/v1/chat/completions',
//     {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
//       },
//       body: JSON.stringify({
//         model: GROQ_MODEL,
//         messages: [
//           {
//             role: 'system',
//             content: `${SYSTEM}\nToday's date: ${today}`,
//           },
//           {
//             role: 'user',
//             content: message,
//           },
//         ],
//         temperature: 0,
//       }),
//     }
//   );

//   if (!res.ok) {
//     const errorText = await res.text();

//     const error = new Error(
//       `Groq request failed with status ${res.status}: ${errorText}`
//     );

//     error.status = res.status;
//     throw error;
//   }

//   const data = await res.json();

//   const text = data.choices?.[0]?.message?.content;

//   if (!text) {
//     throw new Error('Groq returned no text');
//   }

//   return JSON.parse(text);
// }

async function callGroq(message) {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: process.env.GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: `${SYSTEM}\nToday's date: ${today}`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        timeout: 10000,
      }
    );

    const text = response.data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('Groq returned no text');
    }

    return JSON.parse(text);

  } catch (error) {
    const status = error.response?.status;

    const errorMessage =
      error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

    console.error('Groq error:', errorMessage);

    const newError = new Error(
      `Groq request failed with status ${status}: ${errorMessage}`
    );

    newError.status = status;
    newError.code = error.code;
    throw newError;
  }
}

export async function parseOrder(message, sellerId) {

  const raw = await callLLM(message);
  const problems = [...(raw.unclear ?? [])];

  // Drop values outside the schema's enums instead of letting the save fail later
  const pickEnum = (value, allowed, label) => {
    if (value == null) return undefined;
    if (allowed.includes(value)) return value;
    problems.push(`Unrecognised ${label}: "${value}"`);
    return undefined;
  };

  const platform = pickEnum(raw.platform, PLATFORMS, 'platform');
  const paymentStatus = pickEnum(raw.paymentStatus, PAYMENT_STATUSES, 'payment status');
  const fulfilmentMethod = pickEnum(raw.fulfilmentMethod, FULFILMENT_METHODS, 'fulfilment method');
  const depositAmount = Number.isFinite(raw.depositAmount) ? raw.depositAmount : undefined;

  let dueAt;
  if (raw.dueAt) {
    if (Number.isNaN(Date.parse(raw.dueAt))) problems.push(`Could not read the due date "${raw.dueAt}"`);
    else dueAt = raw.dueAt;
  }

  // Only match against this seller's own products
  const products = await Product.find({ seller: sellerId }).select('name').lean();
  const fuse = new Fuse(products, { keys: ['name'], threshold: 0.4 });

  const items = (raw.items ?? []).map((item) => {
    const hit = fuse.search(item.name)[0]?.item;
    if (!hit) problems.push(`No matching product for "${item.name}"`);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      problems.push(`Missing or invalid quantity for "${item.name}"`);
    }
    return {
      product: hit?._id ?? null,
      variant: item.variant ?? undefined,
      quantity: item.quantity ?? undefined,
      notes: item.notes ?? undefined,
      requestedName: item.name, // for display only
      matchedName: hit?.name ?? null, // for display only
    };
  });

  // The same rules your POST / route enforces, surfaced early so the seller sees them
  if (fulfilmentMethod === 'delivery' && !raw.deliveryAddress?.trim()) {
    problems.push('Delivery address is required for delivery orders');
  }
  if (paymentStatus === 'deposit' && !(depositAmount > 0)) {
    problems.push('Enter the deposit amount');
  }

  return {
    customerName: raw.customerName ?? undefined,
    customerContact: raw.customerContact ?? undefined,
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
}