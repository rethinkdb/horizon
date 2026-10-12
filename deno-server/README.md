# Horizon Deno Server

A modern, Deno-native RethinkDB real-time server built with Web Standards.

## 🦕 Why Deno?

- **Native TypeScript** - No compilation step
- **Secure by default** - Explicit permissions
- **Web Standards** - Fetch, WebSockets, Streams
- **Modern tooling** - Built-in formatter, linter, test runner
- **No node_modules** - URL imports only
- **Works with Node.js** - Via npm compatibility layer

## 🚀 Features

- ✅ **Real-time subscriptions** via WebSockets
- ✅ **RethinkDB changefeeds** for reactive data
- ✅ **JWT authentication** with multiple strategies
- ✅ **Connection pooling** for optimal performance
- ✅ **CORS support** for cross-origin requests
- ✅ **Static file serving** for SPAs
- ✅ **TypeScript-first** with strict typing
- ✅ **Compatible with Oak, Hono, Fresh**

## 📦 Installation

### Using Deno

```typescript
import { createServer } from "https://raw.githubusercontent.com/afeldman/horizon/next/deno-server/src/mod.ts";
```

### Local Development

```bash
git clone <repo>
cd horizon/deno-server
```

## 🎯 Quick Start

### Minimal Server

```typescript
import { createServer } from "@horizon/deno-server";

const server = await createServer({
  port: 8181,
  rethinkdb: {
    host: "localhost",
    port: 28015,
    db: "horizon",
  },
  auth: {
    tokenSecret: "your-secret-key",
    allowAnonymous: true,
  },
});

console.log("Server running on port 8181");
```

Run with:

```bash
deno run --allow-net --allow-env --allow-read server.ts
```

### With Oak Framework

```typescript
import { Application } from "https://deno.land/x/oak/mod.ts";
import { createServer } from "@horizon/deno-server";

const horizonServer = await createServer({
  port: 8182,
  rethinkdb: { db: "myapp" },
  auth: { tokenSecret: "secret", allowAnonymous: true },
});

const app = new Application();

app.use((ctx) => {
  ctx.response.body = "Oak + Horizon";
});

await app.listen({ port: 8181 });
```

## 🔧 Configuration

### ServerConfig

```typescript
interface ServerConfig {
  /** HTTP server port (default: 8181) */
  port?: number;

  /** Server hostname (default: 'localhost') */
  hostname?: string;

  /** RethinkDB configuration */
  rethinkdb: {
    host?: string; // default: 'localhost'
    port?: number; // default: 28015
    db?: string; // default: 'horizon'
    user?: string;
    password?: string;
    poolSize?: number; // default: 10
    tls?: boolean;
  };

  /** Authentication configuration */
  auth?: {
    tokenSecret: string;
    tokenExpiration?: string; // e.g., '24h', '7d'
    allowAnonymous?: boolean;
    allowUnauthenticated?: boolean;
  };

  /** Enable CORS */
  cors?:
    | boolean
    | {
        origin?: string | string[];
        methods?: string[];
        credentials?: boolean;
      };

  /** Static file directory */
  staticDir?: string;
}
```

## 🔌 WebSocket Protocol

### Connect

```typescript
const ws = new WebSocket("ws://localhost:8181");
```

### Authentication

```typescript
ws.send(
  JSON.stringify({
    requestId: "1",
    type: "auth",
    method: "anonymous", // or 'token', 'password'
  })
);
```

### Query

```typescript
ws.send(
  JSON.stringify({
    requestId: "2",
    type: "query",
    query: { table: "items", limit: 10 },
  })
);
```

### Subscribe (Changefeed)

```typescript
ws.send(
  JSON.stringify({
    requestId: "3",
    type: "subscribe",
    query: { table: "messages", orderBy: "timestamp" },
  })
);
```

### Unsubscribe

```typescript
ws.send(
  JSON.stringify({
    requestId: "4",
    type: "unsubscribe",
    subscriptionId: "3",
  })
);
```

## 🌐 HTTP API

### Health Check

```bash
GET /horizon/health
```

Response:

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-12-08T12:00:00Z"
}
```

### Authentication

```bash
POST /horizon/auth
Content-Type: application/json

{
  "method": "anonymous"
}
```

Response:

```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "user-id",
    "username": "anonymous_12345"
  }
}
```

### Query

```bash
POST /horizon/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": { "table": "items" }
}
```

## 🧪 Testing

```bash
# Run all tests
deno task test

# Run specific test
deno test tests/server_test.ts

# With coverage
deno test --coverage=cov_profile
deno coverage cov_profile
```

## 📚 Examples

See [deno-examples/](../deno-examples/) for complete examples:

- [Oak Server](../deno-examples/oak-server/) - Oak middleware framework
- [Hono Server](../deno-examples/hono-server/) - Ultra-fast Hono framework

## 🔄 Migration from Node.js Horizon

### Key Differences

1. **Import syntax**: Use `.ts` extensions

   ```typescript
   // ❌ Node.js
   import horizon from "@horizon/server";

   // ✅ Deno
   import { createServer } from "./mod.ts";
   ```

2. **Permissions**: Explicitly grant access

   ```bash
   # Required flags
   --allow-net      # Network access
   --allow-env      # Environment variables
   --allow-read     # File system read
   ```

3. **Configuration**: Simplified API

   ```typescript
   // ✅ Deno
   const server = await createServer(config);

   // ❌ Old Node.js
   const server = Horizon(httpServer, options);
   ```

## 🎨 Architecture

```
deno-server/
├── src/
│   ├── mod.ts              # Main entry point
│   ├── types.ts            # TypeScript interfaces
│   ├── core/
│   │   ├── server.ts       # HTTP/WS server
│   │   └── database.ts     # RethinkDB wrapper
│   ├── auth/
│   │   └── manager.ts      # Authentication
│   └── handlers/
│       ├── websocket.ts    # WebSocket handler
│       └── http.ts         # HTTP handler
└── tests/
    └── server_test.ts      # Unit tests
```

## 🤝 Compatibility

- **Deno**: 1.38+ (native)
- **Node.js**: 18+ (via npm compatibility)
- **Bun**: Latest (via package.json)
- **Browsers**: N/A (server-only)

## 📖 API Reference

### HorizonServer

```typescript
class HorizonServer {
  constructor(config: ServerConfig);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  getDatabase(): Database;
  getAuth(): AuthManager;
}
```

### Database

```typescript
class Database {
  async connect(): Promise<void>;
  async disconnect(): Promise<void>;
  async query<T>(query: unknown): Promise<T[]>;
  async subscribe<T>(query: unknown, callback: Function): Promise<() => void>;
  getR(): typeof r; // RethinkDB query builder
}
```

### AuthManager

```typescript
class AuthManager {
  async init(): Promise<void>;
  async createToken(user: User): Promise<string>;
  async verifyToken(token: string): Promise<User | null>;
  async createAnonymousUser(db: Database): Promise<User>;
  allowAnonymous(): boolean;
}
```

## 🔒 Security

- JWT tokens with HS256 algorithm
- Secure by default (explicit permissions)
- CORS protection
- Environment variable based secrets
- No eval() or unsafe operations

## 🚢 Deployment

### Deno Deploy

```typescript
// main.ts
import { createServer } from "@horizon/deno-server";

await createServer({
  port: 8000, // Deno Deploy uses PORT env var
  rethinkdb: {
    host: Deno.env.get("RETHINKDB_HOST"),
    // ... other config
  },
});
```

Deploy:

```bash
deployctl deploy --project=my-project main.ts
```

### Docker

```dockerfile
FROM denoland/deno:1.38.0

WORKDIR /app
COPY . .

RUN deno cache src/mod.ts

CMD ["deno", "run", "--allow-net", "--allow-env", "src/mod.ts"]
```

## 📄 License

MIT - See [LICENSE](../LICENSE)

## 🙏 Credits

- Built on [rethinkdb-ts](https://github.com/rethinkdb/rethinkdb-ts)
- Inspired by original [Horizon](https://github.com/rethinkdb/horizon)
- Powered by [Deno](https://deno.land/)
