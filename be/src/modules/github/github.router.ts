import { Router } from "express";
import { authGuard } from "@modules/auth/auth.middleware";
import { listRepos } from "./github.controller";

export const githubRouter = Router().get("/repos", authGuard, listRepos);
