# Hono + Horizon Server Example (Deno)

Ultra-fast Hono server with Horizon integration for Deno.

## ⚡ Features

- **Hono** - Fastest web framework for Deno
- **TypeScript** - Full type safety
- **Real-time** - WebSocket support via Horizon
- **RethinkDB** - Reactive database queries

## 🚀 Quick Start

```bash
# Development with auto-reload
deno task dev

# Production
deno task start
```

## 🌐 API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health status
- `GET /api/items` - List all items
- `POST /api/items` - Create new item

## 📝 Example: Create Item

```bash
curl -X POST http://localhost:8181/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Item","value":42}'
```

## 🔌 Horizon WebSocket

Connect to `ws://localhost:8182` for real-time updates:

```typescript
const ws = new WebSocket("ws://localhost:8182");
ws.onmessage = (event) => {
  console.log("Update:", JSON.parse(event.data));
};
```

## 📚 Learn More

- [Hono Documentation](https://hono.dev/)
- [Deno Deploy](https://deno.com/deploy)
- [RethinkDB Changefeeds](https://rethinkdb.com/docs/changefeeds/)
