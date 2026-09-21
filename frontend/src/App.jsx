import { useEffect, useState } from 'react';

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const ARROW = { up: '▲', down: '▼', idle: '–' };

export default function App() {
  const [state, setState] = useState(null);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/events'); // auto-reconnects
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    es.onmessage = (m) => setState(JSON.parse(m.data));
    return () => es.close();
  }, []);

  if (!state) return <p className="status">Connecting…</p>;

  const { floors, elevators } = state;
  const rows = Array.from({ length: floors }, (_, i) => floors - i);

  return (
    <main>
      <h1>Interview Test | Tran Minh Khoi</h1>
      {!online && <p className="banner" role="alert">Connection lost, reconnecting…</p>}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${elevators.length}, auto)` }}>
        {elevators.map((e) => (
          <div key={e.id} className="head">
            E{e.id} {ARROW[e.direction]} <small>{e.door.held ? 'held' : e.door.state}</small>
          </div>
        ))}

        {rows.map((f) =>
          elevators.map((e) => <Cell key={`${f}-${e.id}`} f={f} floors={floors} e={e} />),
        )}
      </div>
    </main>
  );
}

// One floor of one elevator: its own ↑/↓ call buttons, the floor box, and its door buttons.
function Cell({ f, floors, e }) {
  const here = e.floor === f;
  const url = `/api/elevators/${e.id}`;
  const hall = (direction) => post('/api/call', { floor: f, direction, elevatorId: e.id });
  const door = (action) => post(`${url}/door`, { floor: f, action });
  return (
    <div className="cell-wrap">
      <div className="hall">
        {f < floors && (
          <button className={e.hallCalls.up.includes(f) ? 'lit' : ''} title={`Call E${e.id} up`} aria-label={`Call elevator ${e.id} up from floor ${f}`} onClick={() => hall('up')}>↑</button>
        )}
        {f > 1 && (
          <button className={e.hallCalls.down.includes(f) ? 'lit' : ''} title={`Call E${e.id} down`} aria-label={`Call elevator ${e.id} down from floor ${f}`} onClick={() => hall('down')}>↓</button>
        )}
      </div>
      <button
        className={`cell ${here ? `here door-${e.door.state}` : ''} ${e.carCalls.includes(f) ? 'selected' : ''}`}
        title={`Go to floor ${f} in E${e.id}`}
        aria-label={`Elevator ${e.id}: go to floor ${f}`}
        onClick={() => post(`${url}/select`, { floor: f })}
      >
        <b>{f}</b>
        <span className="doors"><i /><i /></span>
      </button>
      <div className="doorbtns">
        <button title="Hold door open" aria-label={`Elevator ${e.id}: hold door open`} disabled={!here} onClick={() => door('hold')}>◀▶</button>
        <button title="Close door" aria-label={`Elevator ${e.id}: close door`} disabled={!here} onClick={() => door('close')}>▶◀</button>
      </div>
    </div>
  );
}
