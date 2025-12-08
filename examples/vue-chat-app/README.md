# Horizon Chat - Vue 3 Example

A modern real-time chat application built with Vue 3, TypeScript, Composition API, and Horizon.

![Chat Demo](https://i.imgur.com/XFostB8.gif)

## Features

- **Vue 3** with TypeScript and Composition API
- **Script Setup** syntax for cleaner components
- **Vite** for fast development and HMR
- **Real-time Updates** via Horizon changefeeds
- **Composables** for reusable logic
- **Responsive Design** with scoped styles

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
├── main.ts             # Entry point
├── App.vue             # Root component
├── types.ts            # TypeScript interfaces
├── composables/
│   └── useHorizon.ts   # Horizon composable
└── components/
    ├── ChatList.vue
    ├── ChatMessage.vue
    └── ChatInput.vue
```

## Key Concepts

### Composition API

Modern Vue 3 with `<script setup>`:

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";

const messages = ref<Message[]>([]);
</script>
```

### Composable: useHorizon

Reusable Horizon logic:

```typescript
const { collection } = useHorizon<Message>("vue_messages");
```

### Real-time Subscription

Messages update automatically:

```typescript
collection.value
  .order("datetime", "descending")
  .limit(20)
  .watch()
  .subscribe((msgs) => {
    messages.value = msgs;
  });
```

### Type Safety

Full TypeScript support:

```typescript
interface Message {
  id: string;
  text: string;
  authorId: number;
  datetime: Date;
}
```

## Component Communication

- **Props** for passing data down
- **Emits** for sending events up

```vue
<ChatInput :avatar-url="avatarUrl" @save="handleSave" />
```

## Ideas for Future

- [ ] Implement `presence` to show online users
- [ ] Add `geo` features for location-based chat rooms
- [ ] Implement `auth` with GitHub/Twitter login

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

### Vue type errors

Make sure `vue-tsc` is installed and TypeScript is configured correctly.

## Learn More

- [Vue 3 Documentation](https://vuejs.org/)
- [Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)
- [Vite Documentation](https://vitejs.dev/)
- [TypeScript with Vue](https://vuejs.org/guide/typescript/overview.html)
