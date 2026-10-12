import { create, verify, getNumericDate } from "djwt";
import type { AuthConfig, User, Session } from "../types.ts";
import { Database } from "../core/database.ts";

const encoder = new TextEncoder();

export class AuthManager {
  private cryptoKey?: CryptoKey;

  constructor(private config?: AuthConfig) {}

  async init(): Promise<void> {
    if (!this.config?.tokenSecret) return;

    const keyData = encoder.encode(this.config.tokenSecret);
    this.cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }

  async createToken(user: User): Promise<string> {
    if (!this.cryptoKey) {
      throw new Error("Auth not configured");
    }

    const exp = getNumericDate(60 * 60 * 24); // 24 hours
    const payload = {
      sub: user.id,
      username: user.username,
      groups: user.groups || [],
      exp,
    };

    return await create({ alg: "HS256", typ: "JWT" }, payload, this.cryptoKey);
  }

  async verifyToken(token: string): Promise<User | null> {
    if (!this.cryptoKey) {
      throw new Error("Auth not configured");
    }

    try {
      const payload = await verify(token, this.cryptoKey);
      return {
        id: payload.sub as string,
        username: payload.username as string,
        groups: payload.groups as string[],
      };
    } catch {
      return null;
    }
  }

  async createAnonymousUser(db: Database): Promise<User> {
    const userId = crypto.randomUUID();
    const user: User = {
      id: userId,
      username: `anonymous_${userId.slice(0, 8)}`,
      groups: ["default"],
      createdAt: new Date(),
    };

    await db.getR().table("users").insert(user).run();
    return user;
  }

  async authenticateUser(
    db: Database,
    username: string,
    password: string
  ): Promise<User | null> {
    const users = await db
      .getR()
      .table("users")
      .filter({ username })
      .limit(1)
      .run();

    if (users.length === 0) {
      return null;
    }

    const user = users[0] as User & { password?: string };

    // Simple password check (in production, use proper hashing)
    if (user.password === password) {
      delete user.password;
      return user;
    }

    return null;
  }

  allowAnonymous(): boolean {
    return this.config?.allowAnonymous ?? false;
  }

  allowUnauthenticated(): boolean {
    return this.config?.allowUnauthenticated ?? false;
  }

  isConfigured(): boolean {
    return !!this.config?.tokenSecret;
  }
}
