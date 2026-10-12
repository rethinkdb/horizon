<script setup lang="ts">
import { computed } from "vue";
import type { Message } from "../types";

const props = defineProps<{
  message: Message;
}>();

const avatarUrl = computed(
  () =>
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${props.message.authorId}`
);

const formattedTime = computed(() =>
  new Date(props.message.datetime).toLocaleTimeString()
);
</script>

<template>
  <li class="message">
    <img
      :src="avatarUrl"
      :alt="`Avatar ${message.authorId}`"
      width="50"
      height="50"
    />
    <div class="message-content">
      <span class="text">{{ message.text }}</span>
      <span class="time">{{ formattedTime }}</span>
    </div>
  </li>
</template>

<style scoped>
.message {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem;
  border-radius: 8px;
  background: #f9f9f9;
  transition: background 0.2s;
}

.message:hover {
  background: #f0f0f0;
}

.message img {
  border-radius: 50%;
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.message .text {
  word-wrap: break-word;
  line-height: 1.5;
}

.message .time {
  font-size: 0.75rem;
  color: #999;
}
</style>
