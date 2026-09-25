// OneMap: geocoding delivery addresses and route information.
//
// TODO:
//   - Get a token using ONEMAP_EMAIL and ONEMAP_PASSWORD.
//   - Tokens expire after about 3 days. Cache the token and refresh it
//     automatically before expiry, or the app will break during grading.
//   - Cache results for addresses you've already looked up.

export async function geocodeAddress(/* address */) {
  throw new Error('geocodeAddress is not implemented yet');
}

export async function getRoute(/* from, to */) {
  throw new Error('getRoute is not implemented yet');
}
