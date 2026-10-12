import { ServerConfig } from "./types.ts";
import { HorizonServer } from "./core/server.ts";

export { HorizonServer } from "./core/server.ts";
export * from "./types.ts";

/**
 * Create and start a Horizon server
 *
 * @example
 * ```ts
 * import { createServer } from '@horizon/deno-server';
 *
 * const server = await createServer({
 *   port: 8181,
 *   rethinkdb: {
 *     host: 'localhost',
 *     port: 28015,
 *     db: 'horizon',
 *   },
 *   auth: {
 *     tokenSecret: 'my-secret',
 *     allowAnonymous: true,
 *   },
 * });
 *
 * console.log('Horizon server running on port 8181');
 * ```
 */
export async function createServer(
  config: ServerConfig
): Promise<HorizonServer> {
  const server = new HorizonServer(config);
  await server.start();
  return server;
}

/**
 * Default export for convenience
 */
export default { createServer, HorizonServer };
