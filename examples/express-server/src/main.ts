#!/usr/bin/env node
import express, { Express } from "express";
import horizon from "@horizon/server";
import { Server } from "http";

const PORT = process.env.PORT || 8181;
const TOKEN_SECRET = process.env.TOKEN_SECRET || "my_super_secret_secret";

// Express app setup
const app: Express = express();

// Serve static files (if you have a dist folder for frontend)
app.use(express.static("public"));

// Basic health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start HTTP server
const httpServer: Server = app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

// Horizon server setup
const horizonOptions = {
  auth: {
    token_secret: TOKEN_SECRET,
    allow_anonymous: true,
    allow_unauthenticated: true,
  },
  auto_create_collection: true,
  auto_create_index: true,
  project_name: "express-horizon-example",
};

// Attach Horizon to the HTTP server
const horizonServer = horizon(httpServer, horizonOptions);

console.log(`
✅ Horizon + Express Server Running!
  
  HTTP:    http://localhost:${PORT}
  Horizon: ws://localhost:${PORT}/horizon
  Health:  http://localhost:${PORT}/health

Press Ctrl+C to stop
`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⏳ Shutting down gracefully...");
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n⏳ SIGTERM received, shutting down...");
  httpServer.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

export { app, httpServer, horizonServer };
