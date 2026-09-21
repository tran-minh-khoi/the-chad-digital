# Elevator Simulator

3 elevators, 10 floors. Node.js (Express) backend, React (Vite) frontend, run with Docker Compose.

```bash
docker compose up -d --build     # http://localhost:8080
docker compose logs -f           # follow logs      | docker compose down   # stop
TICK_MS=300 STRATEGY=least-loaded docker compose up -d   # tweak config
```

Local dev without Docker: `cd backend && npm i && npm run dev`, then `cd frontend && npm i && npm run dev`.
Tests: `cd backend && npm test`.

## Architecture

```
Browser ──► nginx :8080 (static React build, reverse proxy) ──/api──► Node backend :3001 (internal only)
   ▲                                                                        │ simulation clock (TICK_MS)
   └──────────────── Server-Sent Events: snapshot on every change ◄─────────┘
```

- Vite runs only at image build time; the running frontend container is nginx serving the static `dist`.
- The simulation lives entirely in the backend, so every browser sees the same building.
- Commands go over REST, state comes back over SSE (one-way push, auto-reconnect, no library).

## Using it

- Each elevator has its own **↑ / ↓** call buttons on every floor (orange = pending); they call that elevator.
- Click a floor box in an elevator's column to set a destination in it (orange = selected).
- **◀▶** holds the door open until **▶◀** is pressed (both only act on the elevator standing on that row).
- Red box = elevator position; the two panels show the door state.

## Rules

- A moving elevator only stops for hall calls in its own direction. Going up 1→10: ↑ on floor 5 stops it; ↓ on floor 5 waits until it has reversed and comes back.
- Turning point: at the end of a run it reverses and serves the opposite-direction call there.
- `POST /api/call` without `elevatorId` lets a `DispatchStrategy` pick the car (the UI always names one).

## OOP design

| Class | Role |
|---|---|
| `Door` | Encapsulated state machine: closed → opening → open → closing. |
| `Elevator` | Private position/direction/stops; `tick()` advances one step; `eta()` simulates a `clone()` of itself. |
| `DispatchStrategy` | Abstract base; `NearestCarStrategy` (min ETA) and `LeastLoadedStrategy` override `choose()`. |
| `Building` | Validates requests, dispatches through the strategy (polymorphism), owns the clock, notifies subscribers. |
| `createApp` | HTTP layer only: routes, JSON errors, SSE. |

## API

| Method & path | Body | Result |
|---|---|---|
| `GET /healthz` | | `{"status":"ok"}` |
| `GET /api/state` | | snapshot of all elevators |
| `GET /api/events` | | SSE stream of snapshots |
| `POST /api/call` | `{floor, direction: "up"\|"down", elevatorId?}` | 204 / 400 |
| `POST /api/elevators/:id/select` | `{floor}` | 204 / 400 |
| `POST /api/elevators/:id/door` | `{floor, action: "hold"\|"close"}` | 204 / 400 |

## Configuration

| Var | Default | |
|---|---|---|
| `TICK_MS` | `1000` | ms per step (one floor of travel or one door phase) |
| `STRATEGY` | `nearest` | `nearest` \| `least-loaded` (unknown value = startup error) |
| `PORT` | `3001` | backend port (internal) |

## Production hardening

- **Containers:** non-root (`node`, unprivileged nginx), read-only root fs, all capabilities dropped, `no-new-privileges`, memory limits, `restart: unless-stopped`, rotated json logs.
- **Health:** `/healthz` + compose healthchecks; nginx starts only once the backend is healthy.
- **Shutdown:** SIGTERM/SIGINT handled (`init: true`), so `docker compose down` stops in under a second instead of a 10s SIGKILL.
- **nginx:** security headers + CSP, no version banner, gzip, `index.html` no-cache and fingerprinted `/assets` cached 1y, rate limit (30 req/s, burst 60, then 429) and max 10 SSE streams per client, Docker DNS re-resolution so a restarted backend is picked up.
- **Backend:** fail-fast config validation, input validation → JSON 400, JSON 404/500, 1 KB body limit, SSE heartbeat, timestamped event log (`E2 moved 1 -> 2 (up)`, `E2 door open at floor 4`).
- **Frontend:** "connection lost" banner while SSE reconnects, `aria-label` on every button.
- **CI:** GitHub Actions runs the tests and builds the images.

## Known limits

- No authentication or HTTPS. This is a local simulator; a real deployment would put TLS and auth in front of nginx (a key embedded in a browser app would not be secret).
- State is in one process's memory: restart resets the building, and it does not scale horizontally.
- Hall calls are not reassigned once given to an elevator. The door hold has no timeout. A destination can be pressed at any time, not only after the doors open.
