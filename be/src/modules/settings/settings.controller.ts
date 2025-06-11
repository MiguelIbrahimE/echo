import { Request, Response } from "express";
import { settingsService } from "./settings.service";

export const getSettings = (req: Request, res: Response) =>
  settingsService.get((req as any).user.id).then((s) => res.json(s));

export const saveSettings = (req: Request, res: Response) =>
  settingsService.set((req as any).user.id, req.body).then((s) => res.json(s));
