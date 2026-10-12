import type { Message } from "../types";

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.authorId}`;

  return (
    <li className="message">
      <img
        src={avatarUrl}
        alt={`Avatar ${message.authorId}`}
        width="50"
        height="50"
      />
      <div className="message-content">
        <span className="text">{message.text}</span>
        <span className="time">
          {new Date(message.datetime).toLocaleTimeString()}
        </span>
      </div>
    </li>
  );
}
