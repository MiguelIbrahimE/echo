import { Router } from "express";
import { authGuard } from "@modules/auth/auth.middleware";
import { createDoc, listDocs } from "./docs.controller";

export const docsRouter = Router()
  .use(authGuard)
  .post("/", createDoc)
  .get("/", listDocs);
