// Singapore public holidays from data.gov.sg.
//
// TODO:
//   - Fetch the public holidays dataset once and cache it (holidays rarely
//     change), rather than calling the API on every request.
//   - Send DATAGOVSG_API_KEY in the request header if set.
//   - When USE_MOCK_APIS=true, use tests/mocks/holidays.json instead.

export async function getPublicHolidays(/* year */) {
  throw new Error('getPublicHolidays is not implemented yet');
}

export async function isPublicHoliday(/* date */) {
  throw new Error('isPublicHoliday is not implemented yet');
}
