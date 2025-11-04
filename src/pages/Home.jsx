import { useState } from "react";
import { parseRecipe } from "../lib/api";

export default function Home() {
  const [q, setQ] = useState("");
  const [state, setState] = useState("idle"); // idle|loading|ready|error
  const [recipe, setRecipe] = useState(null);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setState("loading"); setErr(""); setRecipe(null);
    try {
      const data = await parseRecipe(query);
      setRecipe(data.recipe);
      setState("ready");
    } catch (ex) {
      setErr(ex.message || "Unknown error");
      setState("error");
    }
  }

  return (
    <div className="page">
      <form onSubmit={onSubmit} className="searchbar">
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search or paste a link" />
        <button type="submit">Go</button>
      </form>

      {state === "loading" && <div className="loader" aria-live="polite" role="status">🥖 spinning bread loaf…</div>}
      {state === "error"   && <div className="toast error">Failed: {err}</div>}

      {state === "ready" && recipe && (
        <div className="result">
          <h2>{recipe.title}</h2>
          <section>
            <h3>Ingredients</h3>
            <ul>
              {recipe.ingredients?.map(i => (
                <li key={i.id}>
                  {(i.qty ?? "")} {(i.unit ?? "")} {i.name}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Steps</h3>
            <ol>
              {recipe.steps?.map(s => (
                <li key={s.order}>{s.text}</li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {state === "idle" && <p className="hint">We’ll parse ingredients and steps once you submit.</p>}
    </div>
  );
}
