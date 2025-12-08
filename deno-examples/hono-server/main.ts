import { Hono } from "https://deno.land/x/hono@v3.11.7/mod.ts";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createServer } from "../deno-server/src/mod.ts";

const PORT = 8181;

// Create Horizon server
const horizonServer = await createServer({
  port: PORT + 1,
  rethinkdb: {
    host: Deno.env.get("RETHINKDB_HOST") || "localhost",
    port: parseInt(Deno.env.get("RETHINKDB_PORT") || "28015"),
    db: "horizon_hono",
  },
  auth: {
    tokenSecret: Deno.env.get("JWT_SECRET") || "my-secret-key",
    allowAnonymous: true,
  },
  cors: true,
});

// Create Hono app
const app = new Hono();

// Routes
app.get("/", (c) => {
  return c.json({ message: "Hono + Horizon Server" });
});

app.get("/health", (c) => {
  return c.json({
    hono: "healthy",
    horizon: "running on port " + (PORT + 1),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/items", async (c) => {
  const db = horizonServer.getDatabase();
  const items = await db.query(db.getR().table("items").limit(10));
  return c.json({ items });
});

app.post("/api/items", async (c) => {
  const body = await c.req.json();
  const db = horizonServer.getDatabase();

  const result = await db
    .getR()
    .table("items")
    .insert({
      ...body,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    })
    .run();

  return c.json({ success: true, result });
});

// Logging middleware
app.use("*", async (c, next) => {
  console.log(`${c.req.method} ${c.req.url}`);
  await next();
});

console.log(`⚡ Hono server running on http://localhost:${PORT}`);
console.log(`🚀 Horizon server running on http://localhost:${PORT + 1}`);
console.log("Press Ctrl+C to stop");

serve(app.fetch, { port: PORT });
