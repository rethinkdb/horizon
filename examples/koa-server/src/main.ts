#!/usr/bin/env node
import Koa from "koa";
import { Server } from "@horizon/server";
import http from "http";

const app = new Koa();
const PORT = process.env.PORT || 8181;

// Health check endpoint
app.use(async (ctx) => {
  if (ctx.path === "/health") {
    ctx.body = { status: "ok", timestamp: new Date().toISOString() };
  }
});

// Create HTTP server
const httpServer = http.createServer(app.callback());

// Attach Horizon server
const horizonServer = Server(httpServer, {
  auth: {
    allow_anonymous: true,
    allow_unauthenticated: true,
  },
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Koa + Horizon server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("\nShutting down gracefully...");
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
