import { useState, useEffect } from 'react'
import ChatList from './components/ChatList'
import ChatInput from './components/ChatInput'
import { useHorizon } from './hooks/useHorizon'
import type { Message } from './types'
import './App.css'

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [authorId] = useState(() => new Date().getTime())
  const [avatarUrl] = useState(() => {
    const time = new Date().getMilliseconds()
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${time}`
  })

  const horizon = useHorizon<Message>('react_messages')

  useEffect(() => {
    if (!horizon) return

    const subscription = horizon
      .order('datetime', 'descending')
      .limit(20)
      .watch()
      .subscribe((msgs: Message[]) => {
        setMessages(msgs.reverse())
      })

    return () => subscription.unsubscribe()
  }, [horizon])

  const handleSave = (text: string) => {
    if (!horizon) return

    const message: Message = {
      id: crypto.randomUUID(),
      text,
      authorId,
      datetime: new Date(),
    }

    horizon.store(message).subscribe()
  }

  return (
    <div className="chat-app">
      <header>
        <h1>Horizon Chat</h1>
        <p>Real-time chat powered by RethinkDB</p>
      </header>
      <main>
        <ChatList messages={messages} />
        <ChatInput onSave={handleSave} avatarUrl={avatarUrl} />
      </main>
    </div>
  )
}

export default App
