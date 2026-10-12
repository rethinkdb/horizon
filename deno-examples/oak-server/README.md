# Oak + Horizon Server Example (Deno)

Modern Oak.js server with Horizon integration, built for Deno.

## 🦕 Deno Features

- **Native TypeScript** - No compilation needed
- **Secure by default** - Explicit permissions
- **Web Standards** - Fetch API, WebSockets
- **Built-in tooling** - Formatter, linter, test runner

## 🚀 Quick Start

```bash
# Run with file watching
deno task dev

# Production run
deno task start
```

## 📦 No package.json

Deno uses URLs for imports - no `node_modules` or `npm install` needed!

## 🔧 Configuration

Environment variables:

```bash
RETHINKDB_HOST=localhost
RETHINKDB_PORT=28015
JWT_SECRET=your-secret-key
```

## 🌐 API Endpoints

- `GET /` - Welcome message
- `GET /health` - Health check
- `GET /api/data` - Sample data from RethinkDB

## 🔌 Horizon Integration

The Horizon server runs on port 8182 (PORT + 1) and provides:

- WebSocket connections for real-time data
- HTTP API for queries
- Authentication endpoints

## 📚 Learn More

- [Oak Documentation](https://deno.land/x/oak)
- [Deno Manual](https://deno.land/manual)
- [Horizon Deno Server](../deno-server/)
