import { useState } from "react";
import { parseRecipe } from "../lib/api";
import { emptyRecipe } from "../lib/shape";

export default function Home(){
  const [q,setQ] = useState("");
  const [status,setStatus] = useState("idle"); // idle|loading|ready|error
  const [msg,setMsg] = useState("");
  const [recipe,setRecipe] = useState(emptyRecipe);

  async function onSubmit(e){
    e.preventDefault();
    setStatus("loading"); setMsg("");
    const res = await parseRecipe(q);
    if(!res.ok){ setRecipe(emptyRecipe); setMsg(res.error||"Failed"); setStatus("error"); return; }
    setRecipe(res.recipe||emptyRecipe); setStatus("ready");
  }

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];

  return (
    <div className="page">
      <form onSubmit={onSubmit} className="searchbar">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Paste a recipe URL or type free-text (e.g., pizza)" />
        <button type="submit" disabled={status==="loading"}>{status==="loading"?"Parsing…":"Go"}</button>
      </form>

      {status==="error" && <div className="toast error">{msg}</div>}
      {status==="idle" && <p className="hint">We’ll parse ingredients & steps once you submit.</p>}

      {(status==="ready" && recipe.title) && (
        <div className="result">
          <h2>{recipe.title}</h2>
          <section>
            <h3>Ingredients</h3>
            <ul>
              {ingredients.length ? ingredients.map(i =>
                <li key={i.id||i.name}>{(i.qty??"")} {(i.unit??"")} {i.name}</li>
              ) : <li>No ingredients found.</li>}
            </ul>
          </section>
          <section>
            <h3>Steps</h3>
            <ol>
              {steps.length ? steps.map(s => <li key={s.order}>{s.text}</li>) : <li>No steps found.</li>}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
