//env.ts
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["production", "development", "test"]).default("development"),
  PORT: z.string().default("5001"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  OPENAI_API_KEY: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  FRONTEND_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
