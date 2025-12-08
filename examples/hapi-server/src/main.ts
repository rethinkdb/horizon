#!/usr/bin/env node
import Hapi from "@hapi/hapi";
import { Server as HorizonServer } from "@horizon/server";

const PORT = process.env.PORT || 8181;

const init = async () => {
  // Create Hapi server
  const server = Hapi.server({
    port: PORT,
    host: "localhost",
  });

  // Health check route
  server.route({
    method: "GET",
    path: "/health",
    handler: () => {
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
      };
    },
  });

  // Attach Horizon server
  const horizonServer = HorizonServer(server.listener, {
    auth: {
      allow_anonymous: true,
      allow_unauthenticated: true,
    },
  });

  // Start server
  await server.start();
  console.log(`Hapi + Horizon server running on ${server.info.uri}`);
  console.log(`Health check: ${server.info.uri}/health`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down gracefully...");
    await server.stop({ timeout: 10000 });
    console.log("Server stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Handle unhandled rejections
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
    process.exit(1);
  });
};

// Start the server
init().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
