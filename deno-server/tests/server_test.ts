import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { HorizonServer } from "../src/core/server.ts";

Deno.test("HorizonServer - initialization", async () => {
  const server = new HorizonServer({
    port: 9999,
    rethinkdb: {
      host: "localhost",
      port: 28015,
      db: "test_db",
    },
    auth: {
      tokenSecret: "test-secret",
      allowAnonymous: true,
    },
  });

  assertExists(server);
  assertEquals(typeof server.start, "function");
  assertEquals(typeof server.stop, "function");
});

Deno.test("Database - getInstance", () => {
  const { Database } = await import("../src/core/database.ts");

  const db1 = Database.getInstance({
    host: "localhost",
    port: 28015,
    db: "test",
  });

  const db2 = Database.getInstance({
    host: "localhost",
    port: 28015,
    db: "test",
  });

  assertEquals(db1, db2, "Should return singleton instance");
});

Deno.test("AuthManager - token creation", async () => {
  const { AuthManager } = await import("../src/auth/manager.ts");

  const auth = new AuthManager({
    tokenSecret: "test-secret-key-123",
    allowAnonymous: true,
  });

  await auth.init();

  const user = {
    id: "test-user-id",
    username: "testuser",
    groups: ["default"],
  };

  const token = await auth.createToken(user);
  assertExists(token);
  assertEquals(typeof token, "string");

  const verified = await auth.verifyToken(token);
  assertExists(verified);
  assertEquals(verified?.id, user.id);
  assertEquals(verified?.username, user.username);
});
