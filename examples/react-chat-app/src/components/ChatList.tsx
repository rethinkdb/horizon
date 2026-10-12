import type { Message } from "../types";
import ChatMessage from "./ChatMessage";

interface ChatListProps {
  messages: Message[];
}

export default function ChatList({ messages }: ChatListProps) {
  return (
    <div className="chat-list">
      {messages.length === 0 ? (
        <div className="empty-state">
          <p>No messages yet. Start the conversation!</p>
        </div>
      ) : (
        <ul>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </ul>
      )}
    </div>
  );
}
