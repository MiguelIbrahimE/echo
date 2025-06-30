//settings.service.ts
import { db } from "@common/db";
import { settings } from "@schema";

class SettingsService {
  get(userId: string) {
    return db.select().from(settings).where({ userId }).then((r) => r[0]);
  }
  set(userId: string, prefs: Record<string, unknown>) {
    return db
      .insert(settings)
      .values({ userId, prefs })
      .onConflictDoUpdate({ target: settings.userId, set: { prefs } })
      .returning()
      .then((r) => r[0]);
  }
}
export const settingsService = new SettingsService();
