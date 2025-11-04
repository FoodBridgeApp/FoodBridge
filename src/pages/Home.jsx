import { useState } from "react";
import { parseRecipe } from "../lib/api";
import { emptyRecipe } from "../lib/shape";

export default function Home() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("idle"); // idle|loading|ready|error
  const [recipe, setRecipe] = useState(emptyRecipe);
  const [msg, setMsg] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    const query = String(q ?? "").trim();
    if (!query) { setMsg("Type something (e.g., 'pizza')."); setStatus("error"); return; }
    setStatus("loading"); setMsg("");
    const res = await parseRecipe(query);
    if (!res.ok) {
      setRecipe(emptyRecipe);
      setMsg(res.error || "Failed to parse");
      setStatus("error");
      return;
    }
    setRecipe(res.recipe);
    setStatus("ready");
  }

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];

  return (
    <div className="page">
      <form onSubmit={onSubmit} className="searchbar">
        <input
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="Paste a recipe URL or type free-text (e.g., 'pizza')"
          aria-label="Search"
        />
        <button type="submit">Go</button>
      </form>

      {status === "loading" && <div className="toast info">Parsing…</div>}
      {status === "error" && <div className="toast error">{msg}</div>}

      {(status === "ready" && recipe.title) ? (
        <div className="result">
          <h2>{recipe.title}</h2>

          <section>
            <h3>Ingredients</h3>
            <ul>
              {ingredients.map(i => (
                <li key={i.id || i.name}>
                  {(i.qty ?? "")} {(i.unit ?? "")} {i.name}
                </li>
              ))}
              {ingredients.length === 0 && <li>No ingredients found.</li>}
            </ul>
          </section>

          <section>
            <h3>Steps</h3>
            <ol>
              {steps.map(s => (<li key={s.order}>{s.text}</li>))}
              {steps.length === 0 && <li>No steps found.</li>}
            </ol>
          </section>
        </div>
      ) : (
        <p className="hint">We’ll parse ingredients and steps once you submit.</p>
      )}
    </div>
  );
}
