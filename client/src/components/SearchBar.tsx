import { useState } from "react";
import { parseRecipeText } from "../lib/recipe";
import { ingestUrl } from "../lib/ingest";
import { useDispatch } from "react-redux";
import { pushResult } from "../store/sessionSlice";

type RecipeData = {
  title: string;
  ingredients: string[];
  steps: string[];
  yields?: string;
  time?: { prep?: string; cook?: string; total?: string };
};

export default function SearchBar({
  onSearch,
  setLoading,
}: {
  onSearch: (q: { text: string } | { url: string }, parsed: RecipeData) => void;
  setLoading: (v: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const dispatch = useDispatch();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedText = text.trim();
    const trimmedUrl = url.trim();

    if (!trimmedText && !trimmedUrl) {
      alert("Enter a recipe URL or paste recipe text.");
      return;
    }

    setLoading(true);
    try {
      // Prefer TEXT if present, otherwise fall back to URL
      if (trimmedText) {
        const parsed = await parseRecipeText(trimmedText);
        onSearch({ text: trimmedText }, parsed);
        dispatch(pushResult({ title: parsed.title, ingredients: parsed.ingredients }));
      } else {
        const og = await ingestUrl(trimmedUrl);
        const parsed = await parseRecipeText(og.text);
        onSearch({ url: trimmedUrl }, parsed);
        dispatch(pushResult({ title: parsed.title, ingredients: parsed.ingredients }));
      }
    } catch (err: any) {
      console.error(err);
      alert(
        (err?.message as string) ||
          "Sorry, something went wrong. If this was an Instagram link, try copy–pasting the caption text instead."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="url"
          placeholder="Paste a recipe URL (better from open sites like Allrecipes/SimplyRecipes)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 border rounded px-3 py-2"
        />
        <button type="submit" className="px-4 py-2 rounded bg-black text-white">
          Go
        </button>
      </div>
      <div className="flex gap-2">
        <textarea
          placeholder="…or paste free-text recipe (ingredients + steps)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="flex-1 border rounded px-3 py-2"
        />
      </div>
      <p className="text-xs opacity-70">
        Tip: Instagram often blocks scraping. If a link fails, copy the caption/recipe text here instead.
      </p>
    </form>
  );
}
