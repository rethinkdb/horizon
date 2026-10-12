# Hapi + Horizon Server Example

This example demonstrates how to integrate Horizon with a [Hapi](https://hapi.dev/) server using modern TypeScript.

## Features

- **Hapi 21.x** with async/await patterns
- **TypeScript** with strict type checking
- **Horizon Server** integrated with Hapi
- **Health Check** endpoint for monitoring
- **Graceful Shutdown** with proper cleanup
- **Error Handling** for unhandled rejections

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

The Horizon server is attached to the Hapi HTTP listener, allowing you to:

- Define Hapi routes alongside Horizon
- Use Hapi plugins for additional functionality
- Share the same port for both services

## Configuration

Environment variables:

- `PORT` - Server port (default: 8181)

## Architecture

```
HTTP Server (port 8181)
├── Hapi Server (routes & plugins)
└── Horizon Server (real-time data)
```

Hapi's plugin system makes it easy to extend functionality while maintaining clean separation of concerns.

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

### Hapi

```bash
# Enable debug logs
DEBUG=hapi:* npm run dev
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

### Hapi validation errors

Hapi v21 has strict validation by default. Make sure all route handlers return proper response objects.

## Learn More

- [Hapi Documentation](https://hapi.dev/)
- [Hapi Tutorials](https://hapi.dev/tutorials/)
- [Hapi Plugins](https://hapi.dev/plugins/)
- [TypeScript with Hapi](https://hapi.dev/tutorials/typescript/)
