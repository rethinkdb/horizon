export interface ServerConfig {
  /** HTTP server port */
  port?: number;
  /** Server hostname */
  hostname?: string;
  /** RethinkDB connection config */
  rethinkdb: RethinkDBConfig;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** Enable CORS */
  cors?: boolean | CorsConfig;
  /** Static file directory */
  staticDir?: string;
}

export interface RethinkDBConfig {
  /** RethinkDB host */
  host?: string;
  /** RethinkDB port */
  port?: number;
  /** Database name */
  db?: string;
  /** Username for authentication */
  user?: string;
  /** Password for authentication */
  password?: string;
  /** Connection pool size */
  poolSize?: number;
  /** TLS/SSL configuration */
  tls?: boolean;
  /** TLS certificate */
  ca?: string;
}

export interface AuthConfig {
  /** JWT secret for token signing */
  tokenSecret: string;
  /** Token expiration time (e.g., '24h', '7d') */
  tokenExpiration?: string;
  /** Allow anonymous users */
  allowAnonymous?: boolean;
  /** Allow unauthenticated access */
  allowUnauthenticated?: boolean;
  /** OAuth providers */
  providers?: {
    github?: OAuthProvider;
    google?: OAuthProvider;
    twitter?: OAuthProvider;
  };
}

export interface OAuthProvider {
  clientId: string;
  clientSecret: string;
  callbackUrl?: string;
}

export interface CorsConfig {
  origin?: string | string[];
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface HorizonRequest {
  requestId: string;
  type: "query" | "subscribe" | "unsubscribe" | "keepalive";
  options?: Record<string, unknown>;
}

export interface QueryRequest extends HorizonRequest {
  type: "query";
  query: unknown;
}

export interface SubscribeRequest extends HorizonRequest {
  type: "subscribe";
  query: unknown;
}

export interface UnsubscribeRequest extends HorizonRequest {
  type: "unsubscribe";
  subscriptionId: string;
}

export interface HorizonResponse {
  requestId: string;
  data?: unknown;
  error?: string;
  state?: "synced" | "partial";
}

export interface User {
  id: string;
  username?: string;
  email?: string;
  groups?: string[];
  provider?: string;
  createdAt?: Date;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
}
