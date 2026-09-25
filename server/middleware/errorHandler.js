// Last-resort error handler so the server returns JSON instead of crashing.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
}
