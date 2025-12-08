import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { createServer } from "../deno-server/src/mod.ts";

const PORT = 8181;

// Create Horizon server
const horizonServer = await createServer({
  port: PORT + 1, // Horizon on different port
  rethinkdb: {
    host: Deno.env.get("RETHINKDB_HOST") || "localhost",
    port: parseInt(Deno.env.get("RETHINKDB_PORT") || "28015"),
    db: "horizon_oak",
  },
  auth: {
    tokenSecret: Deno.env.get("JWT_SECRET") || "my-secret-key",
    allowAnonymous: true,
    allowUnauthenticated: true,
  },
  cors: true,
});

// Create Oak app
const app = new Application();
const router = new Router();

// Oak routes
router.get("/", (ctx) => {
  ctx.response.body = { message: "Oak + Horizon Server" };
});

router.get("/health", (ctx) => {
  ctx.response.body = {
    oak: "healthy",
    horizon: "running on port " + (PORT + 1),
    timestamp: new Date().toISOString(),
  };
});

router.get("/api/data", async (ctx) => {
  const db = horizonServer.getDatabase();
  const data = await db.query(db.getR().table("items").limit(10));
  ctx.response.body = { data };
});

// Middleware
app.use(router.routes());
app.use(router.allowedMethods());

// Logging
app.use((ctx) => {
  console.log(`${ctx.request.method} ${ctx.request.url}`);
});

console.log(`🦕 Oak server running on http://localhost:${PORT}`);
console.log(`🚀 Horizon server running on http://localhost:${PORT + 1}`);
console.log("Press Ctrl+C to stop");

await app.listen({ port: PORT });
