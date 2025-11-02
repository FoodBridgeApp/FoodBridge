import { useState } from "react";
import { parseRecipeText } from "../lib/recipe";
import { ingestUrl } from "../lib/ingest";
import { useDispatch } from "react-redux";
import { pushResult } from "../store/sessionSlice";

type RecipeData = {
  title: string; ingredients: string[]; steps: string[];
  yields?: string; time?: { prep?: string; cook?: string; total?: string };
};

export default function SearchBar({
  onSearch, setLoading,
}:{
  onSearch: (q:{text:string}|{url:string}, parsed:RecipeData)=>void;
  setLoading: (v:boolean)=>void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const dispatch = useDispatch();

  async function handleSubmit(e: React.FormEvent){
    e.preventDefault();
    setLoading(true);
    try{
      if (url.trim()){
        const og = await ingestUrl(url.trim());
        const parsed = await parseRecipeText(og.text);
        onSearch({url:url.trim()}, parsed);
        dispatch(pushResult({title:parsed.title, ingredients:parsed.ingredients}));
      } else if (text.trim()){
        const parsed = await parseRecipeText(text.trim());
        onSearch({text:text.trim()}, parsed);
        dispatch(pushResult({title:parsed.title, ingredients:parsed.ingredients}));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input type="url" placeholder="Paste a recipe URL…"
          value={url} onChange={(e)=>setUrl(e.target.value)}
          className="flex-1 border rounded px-3 py-2"/>
        <button type="submit" className="px-4 py-2 rounded bg-black text-white">Go</button>
      </div>
      <div className="flex gap-2">
        <textarea placeholder="…or paste free-text recipe here"
          value={text} onChange={(e)=>setText(e.target.value)}
          rows={4} className="flex-1 border rounded px-3 py-2"/>
      </div>
    </form>
  );
}
