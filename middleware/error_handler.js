const errorHandler = (err, req, res, _next) => {
  console.error(err.stack);
  const status = err.status || 500;
  // Avoid leaking internal error details on server errors
  const message = status >= 500 ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
};

module.exports = errorHandler;
