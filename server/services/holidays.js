// Public holiday dates from data.gov.sg, e.g. ["2026-10-20", "2026-12-25"]
//
// Used by the forecast so holiday rushes don't count as "normal" days.
//
// Set HOLIDAYS_URL in server/.env to the data.gov.sg API link for the year's
// public holidays dataset, e.g.
//   HOLIDAYS_URL=https://data.gov.sg/api/action/datastore_search?resource_id=<dataset id>
// (find the dataset id on data.gov.sg → "Public Holidays for 2026" → API)
//
// If it isn't set, or the request fails, we return [] and the forecast still
// works — it just won't skip holidays.
//
// (If a teammate already fetches holidays elsewhere, reuse their code instead.)
export async function getHolidayDates() {
  let url = process.env.HOLIDAYS_URL;
  if (!url) {
    return [];
  }

  try {
    let response = await fetch(url);
    let data = await response.json();
    // Each record looks like { date: "2026-10-20", day: "Tuesday", holiday: "Deepavali" }
    return data.result.records.map((record) => record.date);
  } catch (error) {
    console.error('Could not load public holidays:', error.message);
    return [];
  }
}