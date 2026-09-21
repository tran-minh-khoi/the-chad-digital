import express from 'express';

// ponytail: in-memory fixed-window limiter, per process. Use a shared store if the backend is ever scaled out.
function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.resetAt <= now) hits.set(req.ip, (h = { count: 0, resetAt: now + windowMs }));
    if (++h.count > max) return res.status(429).json({ error: 'too many requests' });
    next();
  };
}

/** HTTP layer only: CORS, rate limits, routing, validation errors -> 4xx, SSE. No simulation logic here. */
export function createApp(
  building,
  {
    log = () => {},
    heartbeatMs = 15_000,
    corsOrigins = [], // browser origins allowed to call the API (frontend hosted elsewhere)
    rateLimit = { max: 100, windowMs: 10_000 }, // per client IP
    maxStreamsPerIp = 10,
  } = {},
) {
  const app = express();
  app.set('trust proxy', 1); // one reverse proxy (Caddy / nginx) in front: use its X-Forwarded-For as req.ip
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const { origin } = req.headers;
    if (origin && corsOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' })); // before the limiter: probes are never throttled
  app.use('/api', createRateLimiter(rateLimit));
  app.use(express.json({ limit: '1kb' }));

  // Run a command; RangeErrors from Building's validation become 400s.
  const command = (fn) => (req, res) => {
    try {
      fn(req);
      res.sendStatus(204);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      res.status(400).json({ error: e.message });
    }
  };

  app.get('/api/state', (_req, res) => res.json(building.snapshot()));

  // Server-Sent Events: a snapshot on every change, plus a heartbeat so proxies keep the stream open.
  const streams = new Map(); // ip -> open stream count
  app.get('/api/events', (req, res) => {
    const open = streams.get(req.ip) ?? 0;
    if (open >= maxStreamsPerIp) return res.status(429).json({ error: 'too many open streams' });
    streams.set(req.ip, open + 1);

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = (s) => res.write(`data: ${JSON.stringify(s)}\n\n`);
    send(building.snapshot());
    const off = building.subscribe(send);
    const beat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
    log(`sse client connected (${req.ip})`);
    req.on('close', () => {
      off();
      clearInterval(beat);
      const left = streams.get(req.ip) - 1;
      if (left > 0) streams.set(req.ip, left);
      else streams.delete(req.ip);
      log(`sse client disconnected (${req.ip})`);
    });
  });

  app.post('/api/call', command(({ body }) => building.call(body.floor, body.direction, body.elevatorId)));
  app.post('/api/elevators/:id/select', command(({ params, body }) => building.select(Number(params.id), body.floor)));
  app.post('/api/elevators/:id/door', command(({ params, body }) => building.door(Number(params.id), body.floor, body.action)));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  // eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
  app.use((err, _req, res, _next) => {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.type === 'entity.parse.failed' ? 'invalid JSON' : err.message });
    }
    log(`error ${err.stack}`);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
