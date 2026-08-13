// Wraps an async route handler so rejected promises are passed to Express's
// error handling instead of crashing the process or hanging the request.
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
