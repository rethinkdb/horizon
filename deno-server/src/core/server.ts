import type {
  ServerConfig,
  HorizonRequest,
  HorizonResponse,
} from "../types.ts";
import { Database } from "./database.ts";
import { AuthManager } from "../auth/manager.ts";
import { handleWebSocket } from "../handlers/websocket.ts";
import { handleHttp } from "../handlers/http.ts";

export class HorizonServer {
  private db: Database;
  private auth: AuthManager;
  private server?: Deno.HttpServer;
  private abortController = new AbortController();

  constructor(private config: ServerConfig) {
    this.db = Database.getInstance(config.rethinkdb);
    this.auth = new AuthManager(config.auth);
  }

  async start(): Promise<void> {
    // Connect to database
    await this.db.connect();
    console.log("✓ Connected to RethinkDB");

    // Start HTTP server
    const port = this.config.port || 8181;
    const hostname = this.config.hostname || "localhost";

    this.server = Deno.serve(
      {
        port,
        hostname,
        signal: this.abortController.signal,
        onListen: ({ port, hostname }) => {
          console.log(
            `✓ Horizon server listening on http://${hostname}:${port}`
          );
        },
      },
      (req) => this.handleRequest(req)
    );
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // CORS handling
    if (this.config.cors) {
      const corsHeaders = this.getCorsHeaders(req);
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }

    // WebSocket upgrade
    if (req.headers.get("upgrade") === "websocket") {
      return handleWebSocket(req, this.db, this.auth, this.config);
    }

    // HTTP API endpoints
    if (url.pathname.startsWith("/horizon")) {
      return handleHttp(req, this.db, this.auth, this.config);
    }

    // Static files
    if (this.config.staticDir && url.pathname !== "/") {
      return this.serveStatic(url.pathname);
    }

    // Default response
    return new Response("Horizon Server", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  private getCorsHeaders(req: Request): Headers {
    const headers = new Headers();
    const corsConfig =
      typeof this.config.cors === "object" ? this.config.cors : {};

    const origin = req.headers.get("origin") || "*";
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Methods",
      corsConfig.methods?.join(", ") || "GET, POST, PUT, DELETE, OPTIONS"
    );
    headers.set(
      "Access-Control-Allow-Headers",
      corsConfig.allowedHeaders?.join(", ") || "Content-Type, Authorization"
    );

    if (corsConfig.credentials) {
      headers.set("Access-Control-Allow-Credentials", "true");
    }

    if (corsConfig.maxAge) {
      headers.set("Access-Control-Max-Age", corsConfig.maxAge.toString());
    }

    return headers;
  }

  private async serveStatic(pathname: string): Promise<Response> {
    try {
      const filePath = `${this.config.staticDir}${pathname}`;
      const file = await Deno.readFile(filePath);
      const contentType = this.getContentType(pathname);
      return new Response(file, {
        headers: { "content-type": contentType },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  private getContentType(pathname: string): string {
    const ext = pathname.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      ico: "image/x-icon",
    };
    return types[ext || ""] || "application/octet-stream";
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    await this.db.disconnect();
    console.log("✓ Horizon server stopped");
  }

  getDatabase(): Database {
    return this.db;
  }

  getAuth(): AuthManager {
    return this.auth;
  }
}
