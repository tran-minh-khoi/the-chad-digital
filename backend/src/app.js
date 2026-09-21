import express from 'express';

/** HTTP layer only: routing, validation errors -> 4xx, SSE. No simulation logic here. */
export function createApp(building, { log = () => {}, heartbeatMs = 15_000 } = {}) {
  const app = express();
  app.disable('x-powered-by');
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

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/state', (_req, res) => res.json(building.snapshot()));

  // Server-Sent Events: a snapshot on every change, plus a heartbeat so proxies keep the stream open.
  app.get('/api/events', (req, res) => {
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
