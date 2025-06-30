//settings.router.ts
import { Router } from "express";
import { authGuard } from "@modules/auth/auth.middleware";
import { getSettings, saveSettings } from "./settings.controller";

export const settingsRouter = Router()
  .use(authGuard)
  .get("/", getSettings)
  .post("/", saveSettings);
