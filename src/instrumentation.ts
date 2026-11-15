// Runs once when a server instance starts: make sure the database
// tables exist (the build ships no migrations). Failures are logged,
// never fatal — API routes also call ensureSchema() lazily.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureSchema } = await import("@/db/ensure-schema");
      await ensureSchema();
    } catch (err) {
      console.error("ensureSchema at startup failed:", err);
    }
  }
}
