// Blocks requests from users who are not logged in.
// Route handlers can then read the seller's id from req.session.userId.
// export function requireAuth(req, res, next) {
//   if (!req.session.userId) {
//     return res.status(401).json({ error: 'Please log in to continue' });
//   }
//   next();
// }

export const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });
  req.user = { id: req.session.userId };
  next();
};