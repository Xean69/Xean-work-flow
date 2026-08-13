// Thrown by route handlers when a request is invalid or a resource is
// missing. The error-handling middleware in index.js turns this into the
// right HTTP status code instead of a generic 500.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
