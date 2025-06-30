//auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "@common/env";

export const authGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.sendStatus(401);
  try {
    const payload = jwt.verify(auth.slice(7), env.JWT_SECRET) as { sub: string };
    (req as any).user = { id: payload.sub };
    next();
  } catch {
    res.sendStatus(401);
  }
};
