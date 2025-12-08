<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  avatarUrl: string;
}>();

const emit = defineEmits<{
  save: [text: string];
}>();

const inputText = ref("");

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    const val = inputText.value.trim();
    if (val) {
      emit("save", val);
      inputText.value = "";
    }
  }
};
</script>

<template>
  <div class="chat-input">
    <img :src="avatarUrl" alt="Your avatar" width="40" height="40" />
    <input
      v-model="inputText"
      type="text"
      placeholder="Type a message and press Enter..."
      @keydown="handleKeyDown"
      autofocus
    />
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid #e0e0e0;
  background: white;
  align-items: center;
}

.chat-input img {
  border-radius: 50%;
  flex-shrink: 0;
}

.chat-input input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 24px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.chat-input input:focus {
  border-color: #42b983;
}

.chat-input input::placeholder {
  color: #999;
}
</style>
