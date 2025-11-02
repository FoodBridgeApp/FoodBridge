import { useDispatch, useSelector } from "react-redux";
import IngredientsList from "./IngredientsList";
import { addManyToCart } from "../store/cartSlice";

type Query = { text: string } | { url: string } | null;
type RecipeData = {
  title: string; ingredients: string[]; steps: string[];
  yields?: string; time?: {prep?:string;cook?:string;total?:string};
} | null;

export default function Results({ query, data, loading }:{
  query: Query; data: RecipeData; loading: boolean;
}) {
  const dispatch = useDispatch();
  const allFromSession: string[] = useSelector(
    (s:any) => (s.session?.history || []).flatMap((r:any) => r.ingredients)
  );
  if (loading) return <div className="p-4 animate-pulse">Loading…</div>;
  if (!data) return <div className="p-4 text-sm opacity-70">No result yet.</div>;
  return (
    <section className="mt-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{data.title}</h2>
          <p className="text-xs opacity-70 mt-1">
            {query && "url" in query ? `Source: ${query.url}` :
             query && "text" in query ? "Parsed from text" : ""}
          </p>
        </div>
        <button className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
          disabled={allFromSession.length===0}
          onClick={()=>dispatch(addManyToCart(allFromSession))}>
          Add ALL from session ({allFromSession.length})
        </button>
      </header>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <IngredientsList items={data.ingredients}
            onAddMany={(items)=>dispatch(addManyToCart(items))} />
        </div>
        <div>
          <h3 className="font-semibold mb-2">Steps</h3>
          <ol className="list-decimal pl-6 space-y-2">
            {data.steps.map((s,i)=>(<li key={i}>{s}</li>))}
          </ol>
          {(data.yields || data.time) && (
            <div className="mt-4 text-sm opacity-80 space-y-1">
              {data.yields && <div>Yield: {data.yields}</div>}
              {data.time?.prep && <div>Prep: {data.time.prep}</div>}
              {data.time?.cook && <div>Cook: {data.time.cook}</div>}
              {data.time?.total && <div>Total: {data.time.total}</div>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
