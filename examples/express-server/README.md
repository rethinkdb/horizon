# Express + Horizon Server Example

Modern Express.js server with Horizon integration, built with TypeScript.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Development with hot-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 📁 Project Structure

```
express-server/
├── src/
│   └── main.ts          # Main server file (TypeScript)
├── public/              # Static files (optional)
├── dist/                # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Configuration

### Environment Variables

```bash
# .env file
PORT=8181
TOKEN_SECRET=your_secret_key_here
RETHINKDB_HOST=localhost
RETHINKDB_PORT=28015
```

### Horizon Options

```typescript
const horizonOptions = {
  auth: {
    token_secret: TOKEN_SECRET,
    allow_anonymous: true,
    allow_unauthenticated: true,
  },
  auto_create_collection: true,
  auto_create_index: true,
  project_name: "express-horizon-example",
};
```

## 📡 Endpoints

### Health Check

```bash
GET http://localhost:8181/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2025-12-08T21:00:00.000Z"
}
```

### Horizon WebSocket

```
ws://localhost:8181/horizon
```

## 💻 Usage with Frontend

### JavaScript/TypeScript

```typescript
import Horizon from "@horizon/client";

const horizon = Horizon({
  host: "localhost:8181",
  secure: false,
  authType: "anonymous",
});

// Connect
horizon.connect();

// Use collections
const users = horizon("users");
users.fetch().subscribe((data) => console.log(data));
```

### HTML

```html
<script src="https://unpkg.com/@horizon/client/dist/horizon.js"></script>
<script>
  const horizon = Horizon({ host: "localhost:8181" });
  horizon.connect();
</script>
```

## 🧪 Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## 🐛 Debugging

### VS Code Launch Config

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Express Server",
  "runtimeArgs": ["-r", "ts-node/register"],
  "args": ["${workspaceFolder}/src/main.ts"],
  "env": {
    "PORT": "8181"
  }
}
```

### Check Server Status

```bash
# Is port open?
lsof -i :8181

# Server logs
npm run dev

# Horizon health
curl http://localhost:8181/health
```

## 📦 Dependencies

### Production

- `express@4.19.2` - Fast, minimalist web framework
- `@horizon/server@2.0.0` - Horizon server

### Development

- `typescript@5.3.3` - TypeScript compiler
- `ts-node@10.9.2` - TypeScript execution
- `nodemon@3.1.0` - Hot-reload
- `@types/express` - Express type definitions

## 🔗 Integration Examples

### With CORS

```typescript
import cors from "cors";

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
```

### With Morgan Logger

```typescript
import morgan from "morgan";

app.use(morgan("combined"));
```

### With Helmet (Security)

```typescript
import helmet from "helmet";

app.use(helmet());
```

## 🚨 Troubleshooting

### Port already in use

```bash
# Find process
lsof -i :8181

# Kill process
kill -9 <PID>
```

### RethinkDB not found

```bash
# Start RethinkDB with Docker
docker run -d -p 28015:28015 -p 8080:8080 rethinkdb

# Or use docker-compose (from project root)
docker-compose up -d postgres redis
```

### TypeScript errors

```bash
# Clean build
rm -rf dist
npm run build
```

## 📚 Learn More

- [Express Documentation](https://expressjs.com/)
- [Horizon Documentation](https://horizon.io/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 📄 License

MIT
