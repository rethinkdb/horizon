import type { ServerConfig } from "../types.ts";
import { Database } from "../core/database.ts";
import { AuthManager } from "../auth/manager.ts";

interface SocketData {
  id: string;
  subscriptions: Map<string, () => void>;
  user?: { id: string; username?: string };
}

export function handleWebSocket(
  req: Request,
  db: Database,
  auth: AuthManager,
  config: ServerConfig
): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);

  const socketData: SocketData = {
    id: crypto.randomUUID(),
    subscriptions: new Map(),
  };

  socket.onopen = () => {
    console.log(`WebSocket connected: ${socketData.id}`);
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      await handleMessage(socket, message, socketData, db, auth);
    } catch (error) {
      socket.send(
        JSON.stringify({
          error: "Invalid message format",
          details: error.message,
        })
      );
    }
  };

  socket.onclose = () => {
    console.log(`WebSocket closed: ${socketData.id}`);
    // Clean up all subscriptions
    for (const unsubscribe of socketData.subscriptions.values()) {
      unsubscribe();
    }
    socketData.subscriptions.clear();
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error: ${socketData.id}`, error);
  };

  return response;
}

async function handleMessage(
  socket: WebSocket,
  message: Record<string, unknown>,
  socketData: SocketData,
  db: Database,
  auth: AuthManager
): Promise<void> {
  const { requestId, type } = message;

  switch (type) {
    case "auth":
      await handleAuth(socket, message, socketData, db, auth);
      break;

    case "query":
      await handleQuery(socket, message, socketData, db);
      break;

    case "subscribe":
      await handleSubscribe(socket, message, socketData, db);
      break;

    case "unsubscribe":
      handleUnsubscribe(socket, message, socketData);
      break;

    case "keepalive":
      socket.send(JSON.stringify({ requestId, type: "keepalive" }));
      break;

    default:
      socket.send(
        JSON.stringify({
          requestId,
          error: `Unknown message type: ${type}`,
        })
      );
  }
}

async function handleAuth(
  socket: WebSocket,
  message: Record<string, unknown>,
  socketData: SocketData,
  db: Database,
  auth: AuthManager
): Promise<void> {
  const { requestId, token, method } = message;

  try {
    let user;

    if (method === "anonymous" && auth.allowAnonymous()) {
      user = await auth.createAnonymousUser(db);
    } else if (method === "token" && typeof token === "string") {
      user = await auth.verifyToken(token);
      if (!user) {
        throw new Error("Invalid token");
      }
    } else if (method === "unauthenticated" && auth.allowUnauthenticated()) {
      user = { id: "unauthenticated", username: "unauthenticated" };
    } else {
      throw new Error("Authentication method not allowed");
    }

    socketData.user = user;
    const newToken = auth.isConfigured()
      ? await auth.createToken(user)
      : undefined;

    socket.send(
      JSON.stringify({
        requestId,
        type: "auth",
        token: newToken,
        user: { id: user.id, username: user.username },
      })
    );
  } catch (error) {
    socket.send(
      JSON.stringify({
        requestId,
        type: "auth",
        error: error.message,
      })
    );
  }
}

async function handleQuery(
  socket: WebSocket,
  message: Record<string, unknown>,
  _socketData: SocketData,
  db: Database
): Promise<void> {
  const { requestId, query } = message;

  try {
    // Execute query
    const result = await db.query(query);

    socket.send(
      JSON.stringify({
        requestId,
        type: "query",
        data: result,
        state: "synced",
      })
    );
  } catch (error) {
    socket.send(
      JSON.stringify({
        requestId,
        type: "query",
        error: error.message,
      })
    );
  }
}

async function handleSubscribe(
  socket: WebSocket,
  message: Record<string, unknown>,
  socketData: SocketData,
  db: Database
): Promise<void> {
  const { requestId, query } = message;

  try {
    // Subscribe to changefeed
    const unsubscribe = await db.subscribe(query, (change) => {
      socket.send(
        JSON.stringify({
          requestId,
          type: "update",
          data: change.new_val,
          old_data: change.old_val,
        })
      );
    });

    // Store unsubscribe function
    socketData.subscriptions.set(requestId as string, unsubscribe);

    // Send initial synced message
    socket.send(
      JSON.stringify({
        requestId,
        type: "subscribe",
        state: "synced",
      })
    );
  } catch (error) {
    socket.send(
      JSON.stringify({
        requestId,
        type: "subscribe",
        error: error.message,
      })
    );
  }
}

function handleUnsubscribe(
  socket: WebSocket,
  message: Record<string, unknown>,
  socketData: SocketData
): void {
  const { requestId, subscriptionId } = message;

  const unsubscribe = socketData.subscriptions.get(subscriptionId as string);
  if (unsubscribe) {
    unsubscribe();
    socketData.subscriptions.delete(subscriptionId as string);

    socket.send(
      JSON.stringify({
        requestId,
        type: "unsubscribe",
        state: "complete",
      })
    );
  } else {
    socket.send(
      JSON.stringify({
        requestId,
        type: "unsubscribe",
        error: "Subscription not found",
      })
    );
  }
}
