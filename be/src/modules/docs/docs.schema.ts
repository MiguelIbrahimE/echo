//docs.schema.ts
import { z } from "zod";
export const docType = z.enum([
  "API_REFERENCE",
  "USER_MANUAL",
  "CONTRIBUTING_GUIDE",
]);

export const createDocSchema = z.object({
  type: docType,
  repoUrl: z.string().url(),
});
export type CreateDocDTO = z.infer<typeof createDocSchema>;
