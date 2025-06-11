import { Request, Response } from "express";
import { createDocSchema } from "./docs.schema";
import { docsService } from "./docs.service";

export const createDoc = async (req: Request, res: Response) => {
  const dto = createDocSchema.parse(req.body);
  const doc = await docsService.generate((req as any).user.id, dto);
  res.status(201).json(doc);
};

export const listDocs = async (req: Request, res: Response) => {
  const docs = await docsService.list((req as any).user.id);
  res.json(docs);
};
