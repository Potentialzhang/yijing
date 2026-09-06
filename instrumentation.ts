export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { migrateDatabase } = await import("@/server/db");
  await migrateDatabase();
  const { seedPlatformContent } = await import("@/server/platform-content");
  await seedPlatformContent();
}
