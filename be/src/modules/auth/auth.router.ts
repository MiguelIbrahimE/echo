//auth.router.ts
import { Router } from "express";
import { login, signup } from "./auth.controller";

export const authRouter = Router()
  .post("/signup", signup)
  .post("/login", login);
