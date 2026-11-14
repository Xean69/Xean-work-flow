// Thrown by route handlers when a request is invalid or a resource is
// missing. The error-handling middleware in index.js turns this into the
// right HTTP status code instead of a generic 500. `code` is an optional
// machine-readable reason (e.g. "trial_expired") the frontend can key on
// without parsing the human-readable message.
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
