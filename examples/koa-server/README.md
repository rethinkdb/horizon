# Koa + Horizon Server Example

This example demonstrates how to integrate Horizon with a [Koa](https://koajs.com/) server using modern TypeScript.

## Features

- **Koa 2.x** with async/await middleware
- **TypeScript** with strict type checking
- **Horizon Server** integrated with Koa
- **Health Check** endpoint for monitoring
- **Graceful Shutdown** handling

## Setup

```bash
npm install
```

## Development

Run the server in development mode with hot reload:

```bash
npm run dev
```

## Production

Build and run the compiled version:

```bash
npm run build
npm start
```

## API Endpoints

- `GET /health` - Health check endpoint
  - Returns: `{ "status": "ok", "timestamp": "..." }`

## Horizon Integration

The Horizon server is attached to the same HTTP server as Koa, allowing you to:

- Serve Koa routes on the same port
- Use Horizon for real-time data synchronization
- Share authentication between Koa and Horizon

## Configuration

Environment variables:

- `PORT` - Server port (default: 8181)

## Architecture

```
HTTP Server (port 8181)
├── Koa App (middleware & routes)
└── Horizon Server (real-time data)
```

Both Koa and Horizon share the same HTTP server, making it easy to combine traditional REST APIs with real-time features.

## Testing

```bash
# Check server is running
curl http://localhost:8181/health

# Should return:
# {"status":"ok","timestamp":"2025-12-08T..."}
```

## Debugging

### TypeScript

```bash
# Check types
npx tsc --noEmit

# Build with verbose output
npm run build -- --verbose
```

### Koa

```bash
# Enable debug logs
DEBUG=koa:* npm run dev
```

## Troubleshooting

### Port already in use

```bash
# Find process using port 8181
lsof -ti:8181

# Kill the process
kill -9 $(lsof -ti:8181)
```

### TypeScript errors

```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build
```

## Learn More

- [Koa Documentation](https://koajs.com/)
- [Koa GitHub](https://github.com/koajs/koa)
- [TypeScript + Koa Guide](https://github.com/koajs/koa/blob/master/docs/typescript.md)
