// Placeholder handler for routes your team has not built yet.
// Replace each use of this with a real handler.
export function notImplemented(req, res) {
  res.status(501).json({ error: `${req.method} ${req.originalUrl} is not implemented yet` });
}
