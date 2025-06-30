// docs.service.ts
import { openai } from "@common/openai";
import { db } from "@common/db";
import { docs } from "@schema";
import { CreateDocDTO } from "./docs.schema";

class DocsService {
  async generate(userId: string, dto: CreateDocDTO) {
    const prompt = "Generate a \${dto.type} for the repo \${dto.repoUrl}\ ";
    const { choices } = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });
    const [row] = await db
      .insert(docs)
      .values({ userId, type: dto.type, md: choices[0].message.content! })
      .returning();
    return row;
  }

  list(userId: string) {
    return db.select().from(docs).where({ userId });
  }
}

export const docsService = new DocsService();
