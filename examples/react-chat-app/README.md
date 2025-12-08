# Horizon Chat - React Example

A modern real-time chat application built with React 18, TypeScript, and Horizon.

![Chat Demo](https://i.imgur.com/XFostB8.gif)

## Features

- **React 18** with TypeScript and strict mode
- **Modern Hooks** (useState, useEffect, custom hooks)
- **Vite** for fast development and HMR
- **Real-time Updates** via Horizon changefeeds
- **Avatar Generation** using DiceBear API
- **Responsive Design** with modern CSS

## Setup

```bash
npm install
```

## Development

Start the development server with hot reload:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Production Build

```bash
npm run build
npm run preview
```

## Architecture

```text
src/
├── main.tsx          # Entry point
├── App.tsx           # Main app component
├── types.ts          # TypeScript interfaces
├── hooks/
│   └── useHorizon.ts # Custom hook for Horizon
└── components/
    ├── ChatList.tsx
    ├── ChatMessage.tsx
    └── ChatInput.tsx
```

## Key Concepts

### Custom Hook: useHorizon

The `useHorizon` hook encapsulates Horizon connection logic:

```typescript
const horizon = useHorizon<Message>("react_messages");
```

### Real-time Subscription

Messages are subscribed with automatic updates:

```typescript
horizon
  .order("datetime", "descending")
  .limit(20)
  .watch()
  .subscribe((msgs) => setMessages(msgs));
```

### Type Safety

Full TypeScript support with interfaces:

```typescript
interface Message {
  id: string;
  text: string;
  authorId: number;
  datetime: Date;
}
```

## Ideas for Future

- [ ] Implement `presence` to show online users
- [ ] Add `geo` features for location-based chat rooms
- [ ] Implement `auth` with GitHub/Twitter login
- [ ] Add message reactions and threading
- [ ] Implement typing indicators
- [ ] Add file/image sharing

## Troubleshooting

### Horizon connection fails

Make sure a Horizon server is running on port 8181:

```bash
cd ../../server
npm run dev
```

### TypeScript errors

```bash
# Clean install
rm -rf node_modules dist
npm install
```

### Port already in use

Change the port in `vite.config.ts`:

```typescript
server: {
  port: 3001, // or any other port
}
```

## Learn More

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Horizon Documentation](https://horizon.io/docs/)
