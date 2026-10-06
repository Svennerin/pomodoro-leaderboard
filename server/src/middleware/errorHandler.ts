import type { ErrorRequestHandler } from "express";

// Last line of defence: turns any error into a JSON response. Express
// recognises an error handler by its four parameters, so `_next` must stay
// even though it is unused.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Errors from the JSON body parser carry a 4xx status: 400 for malformed
  // JSON, 413 for a body over the size limit. Everything else is our bug.
  const status =
    typeof err?.status === "number" && err.status >= 400 && err.status < 500
      ? err.status
      : 500;

  if (status === 500) {
    // Log the details for us, but never send them to the client.
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
  res
    .status(status)
    .json({ error: status === 413 ? "Request body too large" : "Bad request" });
};
