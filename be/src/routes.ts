//routes.ts
import { Router } from "express";
import { authRouter } from "@modules/auth/auth.router";
import { docsRouter } from "@modules/docs/docs.router";
import { githubRouter } from "@modules/github/github.router";
import { settingsRouter } from "@modules/settings/settings.router";

export const routes = Router()
  .use("/auth", authRouter)
  .use("/docs", docsRouter)
  .use("/github", githubRouter)
  .use("/settings", settingsRouter);
