import { r } from "rethinkdb-ts";
import type { RethinkDBConfig } from "../types.ts";

export class Database {
  private static instance: Database;
  private connected = false;

  private constructor(private config: RethinkDBConfig) {}

  static getInstance(config: RethinkDBConfig): Database {
    if (!Database.instance) {
      Database.instance = new Database(config);
    }
    return Database.instance;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const options = {
      host: this.config.host || "localhost",
      port: this.config.port || 28015,
      db: this.config.db || "horizon",
      ...(this.config.user && { user: this.config.user }),
      ...(this.config.password && { password: this.config.password }),
      ...(this.config.tls && { tls: true }),
      ...(this.config.ca && { ca: this.config.ca }),
    };

    await r.connectPool(options);
    this.connected = true;

    // Ensure database exists
    const dbList = await r.dbList().run();
    if (!dbList.includes(this.config.db || "horizon")) {
      await r.dbCreate(this.config.db || "horizon").run();
    }

    // Ensure users table exists
    const tableList = await r.tableList().run();
    if (!tableList.includes("users")) {
      await r.tableCreate("users").run();
      await r.table("users").indexCreate("username").run();
      await r.table("users").indexWait("username").run();
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await r.getPoolMaster()?.drain();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getR() {
    return r;
  }

  /**
   * Execute a query and return results as array
   */
  async query<T = unknown>(query: unknown): Promise<T[]> {
    const result = await (query as { run: () => Promise<T[] | T> }).run();
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Subscribe to a changefeed
   */
  async subscribe<T = unknown>(
    query: unknown,
    callback: (change: { new_val?: T; old_val?: T }) => void
  ): Promise<() => void> {
    const cursor = await (
      query as {
        changes: () => {
          run: () => Promise<{
            close: () => void;
            each: (cb: unknown) => void;
          }>;
        };
      }
    )
      .changes()
      .run();

    cursor.each(callback);

    return () => cursor.close();
  }

  /**
   * Create a table if it doesn't exist
   */
  async ensureTable(tableName: string, indexes?: string[]): Promise<void> {
    const tableList = await r.tableList().run();
    if (!tableList.includes(tableName)) {
      await r.tableCreate(tableName).run();

      if (indexes) {
        for (const index of indexes) {
          await r.table(tableName).indexCreate(index).run();
        }
        await r.table(tableName).indexWait().run();
      }
    }
  }
}
