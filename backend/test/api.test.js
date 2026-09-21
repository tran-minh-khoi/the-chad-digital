import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Building } from '../src/Building.js';
import { createApp } from '../src/app.js';

async function withServer(fn, opts) {
  const server = createApp(new Building(), opts).listen(0);
  await once(server, 'listening');
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}
const post = (base, path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('healthz and state', () =>
  withServer(async (base) => {
    assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { status: 'ok' });
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.floors, 10);
    assert.equal(state.elevators.length, 3);
  }));

test('hall call on a specific elevator shows up in its state', () =>
  withServer(async (base) => {
    assert.equal((await post(base, '/api/call', { floor: 6, direction: 'down', elevatorId: 2 })).status, 204);
    const { elevators } = await (await fetch(`${base}/api/state`)).json();
    assert.deepEqual(elevators.map((e) => e.hallCalls.down), [[], [6], []]);
  }));

test('bad input is rejected with a JSON 400', () =>
  withServer(async (base) => {
    for (const body of [
      { floor: 11, direction: 'down', elevatorId: 1 },
      { floor: 5, direction: 'left', elevatorId: 1 },
      { floor: 5, direction: 'up', elevatorId: 9 },
      { floor: '5', direction: 'up' },
    ]) {
      const res = await post(base, '/api/call', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok((await res.json()).error);
    }
    assert.equal((await post(base, '/api/call', '{not json')).status, 400);
    assert.equal((await post(base, '/api/elevators/1/door', { floor: 1, action: 'kick' })).status, 400);
  }));

test('unknown api route is a JSON 404', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    assert.ok((await res.json()).error);
  }));

test('SSE sends a snapshot immediately', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/events`);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const reader = res.body.getReader();
    const { value } = await reader.read();
    assert.match(new TextDecoder().decode(value), /^data: \{"floors":10/);
    await reader.cancel();
  }));

const ORIGIN = 'https://demo.vercel.app';

test('CORS: allowed origin gets headers and preflight passes; others get none', () =>
  withServer(
    async (base) => {
      const get = await fetch(`${base}/api/state`, { headers: { Origin: ORIGIN } });
      assert.equal(get.headers.get('access-control-allow-origin'), ORIGIN);
      const pre = await fetch(`${base}/api/call`, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });
      assert.equal(pre.status, 204);
      assert.match(pre.headers.get('access-control-allow-headers'), /Content-Type/i);
      const other = await fetch(`${base}/api/state`, { headers: { Origin: 'https://evil.example' } });
      assert.equal(other.headers.get('access-control-allow-origin'), null);
    },
    { corsOrigins: [ORIGIN] },
  ));

test('rate limit answers 429 but never throttles /healthz', () =>
  withServer(
    async (base) => {
      const codes = [];
      for (let i = 0; i < 4; i++) codes.push((await fetch(`${base}/api/state`)).status);
      assert.deepEqual(codes, [200, 200, 429, 429]);
      assert.equal((await fetch(`${base}/healthz`)).status, 200);
    },
    { rateLimit: { max: 2, windowMs: 60_000 } },
  ));

test('SSE streams per client are capped', () =>
  withServer(
    async (base) => {
      const first = await fetch(`${base}/api/events`);
      assert.equal(first.status, 200);
      assert.equal((await fetch(`${base}/api/events`)).status, 429);
      await first.body.cancel();
    },
    { maxStreamsPerIp: 1 },
  ));
