import { env } from './config/env.js';
import { buildApp } from './app.js';
const app = await buildApp();
const shutdown = async () => {
  app.log.info('graceful shutdown');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
await app.listen({ port: env.PORT, host: '0.0.0.0' });
