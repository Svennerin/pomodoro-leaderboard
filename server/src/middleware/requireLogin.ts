import type { NextFunction, Request, Response } from "express";

// Guards a route: only continues if the session says someone is logged in.
// The session middleware has already looked the session up from the cookie,
// so here we only check whether it contains a userId.
//
// On success the user's id is placed in res.locals.userId for the handler.
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (userId === undefined) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.locals.userId = userId;
  next();
}
