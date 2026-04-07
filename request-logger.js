// Simple request logger middleware
module.exports = (req, res, next) => {
  const start = Date.now();
  console.log(`[REQ] ${req.method} ${req.url}`);
  res.on('finish', () => {
    console.log(`[RES] ${req.method} ${req.url} ${res.statusCode} - ${Date.now() - start}ms`);
  });
  next();
};
