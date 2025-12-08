# Horizon Examples

This directory contains examples demonstrating how to use Horizon with various frameworks and setups.

## Server Framework Examples

Examples showing how to integrate Horizon with popular Node.js server frameworks:

| Example                            | Status        | Description                         |
| ---------------------------------- | ------------- | ----------------------------------- |
| [Express Server](./express-server) | ✅ Modernized | Express 4 + Horizon with TypeScript |
| [Koa Server](./koa-server)         | ✅ Modernized | Koa 2 + Horizon with TypeScript     |
| [Hapi Server](./hapi-server)       | ✅ Modernized | Hapi 21 + Horizon with TypeScript   |

All server examples include:

- TypeScript with strict mode
- Modern async/await patterns
- Health check endpoints
- Graceful shutdown handling
- Comprehensive documentation

## Frontend Framework Examples

Real-time applications built with modern frontend frameworks:

| Example                            | Status        | Description                          |
| ---------------------------------- | ------------- | ------------------------------------ |
| [React Chat App](./react-chat-app) | ✅ Modernized | React 18 + TypeScript + Vite         |
| [Vue Chat App](./vue-chat-app)     | ✅ Modernized | Vue 3 + TypeScript + Composition API |
| [React Todo App](./react-todo-app) | ⚠️ Legacy     | Needs modernization                  |
| [Vue Todo App](./vue-todo-app)     | ⚠️ Legacy     | Needs modernization                  |

Modernized examples feature:

- Latest framework versions (React 18, Vue 3)
- TypeScript for type safety
- Vite for fast development
- Modern component patterns (Hooks, Composition API)
- Real-time data synchronization

## Legacy Framework Examples

These examples use older frameworks and may need updating or archiving:

| Example                                | Status    | Notes                   |
| -------------------------------------- | --------- | ----------------------- |
| [AngularJS Todo](./angularjs-todo-app) | 📦 Legacy | AngularJS is deprecated |
| [RiotJS Chat](./riotjs-chat-app)       | 📦 Legacy | RiotJS 2.x              |
| [CycleJS Chat](./cyclejs-chat-app)     | 📦 Legacy | CycleJS                 |
| [Auth App](./auth-app)                 | 📦 Legacy | Authentication example  |

## Getting Started

Each example has its own README with setup instructions. General steps:

1. **Install dependencies**

   ```bash
   cd <example-name>
   npm install
   ```

2. **Start Horizon server** (if needed)

   ```bash
   cd ../../server
   npm run dev
   ```

3. **Run the example**
   ```bash
   npm run dev
   ```

## Modernization Standards

Modernized examples follow these standards:

### TypeScript

- Strict mode enabled
- Full type coverage
- No implicit any

### Build Tools

- Vite for frontend apps (fast HMR, modern output)
- TypeScript compiler for server apps
- Source maps for debugging

### Code Style

- ESLint 9 with Flat Config
- Modern syntax (async/await, optional chaining)
- Functional components (React Hooks, Vue Composition API)

### Documentation

- Comprehensive README with examples
- Architecture diagrams
- Troubleshooting guides
- API documentation

## Contributing

When adding new examples:

1. Use TypeScript
2. Follow the modernization standards above
3. Include a comprehensive README
4. Add tests if applicable
5. Update this overview README

## Ideas for Future Examples

- [ ] Next.js with Horizon
- [ ] Svelte with Horizon
- [ ] React Native mobile app
- [ ] Electron desktop app
- [ ] WebSocket proxy example
- [ ] GraphQL integration
- [ ] Authentication flows (OAuth, JWT)
- [ ] Multi-tenant applications
- [ ] Real-time analytics dashboard
- [ ] Collaborative editing (like Google Docs)

## Learn More

- [Horizon Documentation](https://horizon.io/docs/)
- [RethinkDB Changefeeds](https://rethinkdb.com/docs/changefeeds/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
