<script setup lang="ts">
import type { Message } from "../types";
import ChatMessage from "./ChatMessage.vue";

defineProps<{
  messages: Message[];
}>();
</script>

<template>
  <div class="chat-list">
    <div v-if="messages.length === 0" class="empty-state">
      <p>No messages yet. Start the conversation!</p>
    </div>
    <ul v-else>
      <ChatMessage
        v-for="message in messages"
        :key="message.id"
        :message="message"
      />
    </ul>
  </div>
</template>

<style scoped>
.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.chat-list ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
  margin: 0;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-style: italic;
}
</style>
