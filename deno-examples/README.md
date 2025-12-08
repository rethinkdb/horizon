# Horizon Deno Examples

Modern examples demonstrating Horizon server integration with popular Deno frameworks.

## 🦕 Examples

| Framework                     | Description                          | Status    |
| ----------------------------- | ------------------------------------ | --------- |
| [Oak Server](./oak-server/)   | Middleware framework inspired by Koa | ✅ Ready  |
| [Hono Server](./hono-server/) | Ultra-fast web framework             | ✅ Ready  |
| Fresh App                     | Full-stack web framework             | 🚧 Coming |

## 🚀 Quick Start

Each example can be run with:

```bash
cd <example-name>
deno task dev
```

## 🔧 Prerequisites

1. **Deno** installed (1.38+)

   ```bash
   curl -fsSL https://deno.land/x/install/install.sh | sh
   ```

2. **RethinkDB** running

   ```bash
   # Docker
   docker run -d -p 28015:28015 -p 8080:8080 rethinkdb

   # Or locally
   rethinkdb
   ```

## 📦 Features

All examples include:

- ✅ Native TypeScript
- ✅ Hot reload (--watch)
- ✅ RethinkDB integration
- ✅ Real-time WebSocket updates
- ✅ JWT authentication
- ✅ CORS support
- ✅ Health check endpoints

## 🎯 Example Structure

```
example-name/
├── main.ts           # Server entry point
├── deno.json         # Deno configuration & tasks
└── README.md         # Example documentation
```

## 🌐 Common Endpoints

All examples implement:

- `GET /` - Welcome message
- `GET /health` - Server health check
- `GET /api/*` - API endpoints
- `WS ws://localhost:PORT+1` - Horizon WebSocket

## 🔌 Horizon Integration Pattern

```typescript
import { createServer } from "../deno-server/src/mod.ts";

// Create Horizon server
const horizonServer = await createServer({
  port: 8182,
  rethinkdb: {
    host: "localhost",
    port: 28015,
    db: "myapp",
  },
  auth: {
    tokenSecret: "my-secret",
    allowAnonymous: true,
  },
  cors: true,
});

// Use in your framework
const db = horizonServer.getDatabase();
const data = await db.query(r.table("items"));
```

## 📚 Learn More

- [Deno Manual](https://deno.land/manual)
- [Horizon Deno Server](../deno-server/)
- [RethinkDB Documentation](https://rethinkdb.com/docs/)

## 🤝 Contributing

New examples welcome! Follow the existing structure:

1. Create directory under `deno-examples/`
2. Add `main.ts` with framework integration
3. Add `deno.json` with tasks
4. Write comprehensive `README.md`
5. Update this file with your example

## 🐛 Issues

Found a bug? [Open an issue](https://github.com/afeldman/horizon/issues)
