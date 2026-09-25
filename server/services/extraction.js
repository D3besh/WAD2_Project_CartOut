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
