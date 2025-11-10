import React, { useEffect, useState } from "react";

type Health = { ok: boolean; service: string; time: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = (globalThis as any).__API_BASE__ as string ?? "http://localhost:8080";

  useEffect(() => {
    fetch(`${api}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(e => setError(String(e)));
  }, [api]);

  return (
    <div style={{ fontFamily: "ui-sans-serif, system-ui", padding: 24 }}>
      <h1>FoodBridge</h1>
      <p><code>API_BASE</code>: {api}</p>
      <hr />
      {health ? (
        <pre>{JSON.stringify(health, null, 2)}</pre>
      ) : error ? (
        <p style={{ color: "crimson" }}>Error: {error}</p>
      ) : (
        <p>Loading server health…</p>
      )}
    </div>
  );
}
