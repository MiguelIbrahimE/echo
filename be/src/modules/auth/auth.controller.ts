import { Request, Response } from "express";
import { authService } from "./auth.service";
import { loginSchema, signupSchema } from "./auth.schema";

export const signup = async (req: Request, res: Response) => {
  const dto = signupSchema.parse(req.body);
  const token = await authService.signup(dto);
  res.status(201).json({ token });
};

export const login = async (req: Request, res: Response) => {
  const dto = loginSchema.parse(req.body);
  const token = await authService.login(dto);
  res.json({ token });
};
