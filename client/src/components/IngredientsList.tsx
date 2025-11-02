import { useState } from "react";
export default function IngredientsList({
  items, onAddMany,
}: { items: string[]; onAddMany: (items: string[]) => void; }) {
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const toggle = (i:number) => setSelected(s => ({...s,[i]:!s[i]}));
  const chosen = items.filter((_,i)=>!!selected[i]);
  return (
    <div>
      <div className="flex justify-end mb-2">
        <button className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
          disabled={chosen.length===0} onClick={()=>onAddMany(chosen)}>
          Add selected ({chosen.length})
        </button>
      </div>
      {items.map((i,idx)=>(
        <label key={idx} className="flex items-center gap-3 border-b py-2 cursor-pointer">
          <input type="checkbox" checked={!!selected[idx]} onChange={()=>toggle(idx)} />
          <span className="flex-1">{i}</span>
        </label>
      ))}
    </div>
  );
}
