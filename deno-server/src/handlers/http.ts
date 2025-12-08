import type { ServerConfig } from "../types.ts";
import { Database } from "../core/database.ts";
import { AuthManager } from "../auth/manager.ts";

export async function handleHttp(
  req: Request,
  db: Database,
  auth: AuthManager,
  config: ServerConfig
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Health check
  if (path === "/horizon/health") {
    return new Response(
      JSON.stringify({
        status: "ok",
        database: db.isConnected() ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Auth endpoints
  if (path === "/horizon/auth") {
    return handleAuthHttp(req, db, auth);
  }

  // Query endpoint (POST only)
  if (path === "/horizon/query" && req.method === "POST") {
    return handleQueryHttp(req, db, auth);
  }

  return new Response("Not Found", { status: 404 });
}

async function handleAuthHttp(
  req: Request,
  db: Database,
  auth: AuthManager
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { method, username, password } = body;

    let user;
    let token;

    if (method === "anonymous" && auth.allowAnonymous()) {
      user = await auth.createAnonymousUser(db);
      token = await auth.createToken(user);
    } else if (method === "token" && body.token) {
      user = await auth.verifyToken(body.token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      token = body.token;
    } else if (method === "password" && username && password) {
      user = await auth.authenticateUser(db, username, password);
      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid credentials" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      token = await auth.createToken(user);
    } else {
      return new Response(JSON.stringify({ error: "Invalid auth method" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        token,
        user: { id: user.id, username: user.username },
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

async function handleQueryHttp(
  req: Request,
  db: Database,
  auth: AuthManager
): Promise<Response> {
  try {
    // Check authorization
    const authHeader = req.headers.get("authorization");
    if (!auth.allowUnauthenticated() && !authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const user = await auth.verifyToken(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { query } = body;

    const result = await db.query(query);

    return new Response(JSON.stringify({ data: result }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
