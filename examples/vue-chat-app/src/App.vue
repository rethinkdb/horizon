<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import ChatList from "./components/ChatList.vue";
import ChatInput from "./components/ChatInput.vue";
import { useHorizon } from "./composables/useHorizon";
import type { Message } from "./types";

const messages = ref<Message[]>([]);
const authorId = ref(new Date().getTime());
const avatarUrl = ref(
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${new Date().getMilliseconds()}`
);

const { collection } = useHorizon<Message>("vue_messages");
let subscription: { unsubscribe: () => void } | null = null;

onMounted(() => {
  if (!collection.value) return;

  subscription = collection.value
    .order("datetime", "descending")
    .limit(20)
    .watch()
    .subscribe((msgs: Message[]) => {
      messages.value = [...msgs].reverse();
    });
});

onUnmounted(() => {
  subscription?.unsubscribe();
});

const handleSave = (text: string) => {
  if (!collection.value) return;

  const message: Message = {
    id: crypto.randomUUID(),
    text,
    authorId: authorId.value,
    datetime: new Date(),
  };

  collection.value.store(message).subscribe();
};
</script>

<template>
  <div class="chat-app">
    <header>
      <h1>Horizon Chat</h1>
      <p>Real-time chat powered by RethinkDB + Vue 3</p>
    </header>
    <main>
      <ChatList :messages="messages" />
      <ChatInput :avatar-url="avatarUrl" @save="handleSave" />
    </main>
  </div>
</template>

<style scoped>
.chat-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  background: white;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

header {
  background: linear-gradient(135deg, #42b983 0%, #35495e 100%);
  color: white;
  padding: 2rem;
  text-align: center;
}

header h1 {
  margin-bottom: 0.5rem;
  font-size: 2rem;
}

header p {
  opacity: 0.9;
  font-size: 0.9rem;
}

main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
