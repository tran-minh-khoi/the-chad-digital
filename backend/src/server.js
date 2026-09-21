import { Building } from './Building.js';
import { createApp } from './app.js';
import { strategies } from './DispatchStrategy.js';

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

// Fail fast on bad config instead of silently falling back.
const positiveInt = (name, fallback) => {
  const v = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(v) || v <= 0) throw new Error(`${name} must be a positive integer`);
  return v;
};
const PORT = positiveInt('PORT', 3001);
const TICK_MS = positiveInt('TICK_MS', 1000);
const STRATEGY = process.env.STRATEGY ?? 'nearest';
if (!Object.hasOwn(strategies, STRATEGY)) {
  throw new Error(`STRATEGY must be one of: ${Object.keys(strategies).join(', ')}`);
}

const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
for (const o of CORS_ORIGIN) {
  let ok = false;
  try { ok = new URL(o).origin === o; } catch { /* invalid URL, reported below */ }
  if (!ok) throw new Error(`CORS_ORIGIN must be comma-separated origins like https://app.example.com (got "${o}")`);
}

const building = new Building({ strategy: new strategies[STRATEGY](), log });
const timer = building.start(TICK_MS);
const server = createApp(building, { log, corsOrigins: CORS_ORIGIN }).listen(PORT, () =>
  log(`elevator backend on :${PORT} (strategy=${STRATEGY}, tick=${TICK_MS}ms, cors=${CORS_ORIGIN.join(',') || 'none'})`),
);

// PID 1 in a container ignores SIGTERM unless handled; `docker compose down` would wait 10s then SIGKILL.
const shutdown = (signal) => {
  log(`${signal} received, shutting down`);
  clearInterval(timer);
  server.close(() => process.exit(0));
  server.closeAllConnections(); // open SSE streams would otherwise keep close() waiting
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
