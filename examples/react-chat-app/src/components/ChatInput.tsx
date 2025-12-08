import { useState, KeyboardEvent } from "react";

interface ChatInputProps {
  onSave: (text: string) => void;
  avatarUrl: string;
}

export default function ChatInput({ onSave, avatarUrl }: ChatInputProps) {
  const [inputText, setInputText] = useState("");

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      const val = inputText.trim();
      if (val) {
        onSave(val);
        setInputText("");
      }
    }
  };

  return (
    <div className="chat-input">
      <img src={avatarUrl} alt="Your avatar" width="40" height="40" />
      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message and press Enter..."
        autoFocus
      />
    </div>
  );
}
