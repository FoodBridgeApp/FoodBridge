import { useState } from "react";
import SearchBar from "./components/SearchBar";
import Results from "./components/Results";
import Hero from "./components/Hero";
import Cart from "./components/Cart";
import History from "./components/History";

type Query =
  | { text: string; url?: undefined }
  | { url: string; text?: undefined }
  | null;

type RecipeData = {
  title: string;
  ingredients: string[];
  steps: string[];
  yields?: string;
  time?: { prep?: string; cook?: string; total?: string };
} | null;

export default function App() {
  const [query, setQuery] = useState<Query>(null);
  const [data, setData] = useState<RecipeData>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = (q: Query, parsed: NonNullable<RecipeData>) => {
    setQuery(q);
    setData(parsed);
  };

  const hasQuery =
    (!!query && (("text" in query && !!query?.text?.trim()) || "url" in query)) ||
    false;

  return (
    <main className="max-w-6xl mx-auto p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">FoodBridge</h1>
        <Cart />
      </header>

      <div className="grid md:grid-cols-[2fr_1fr] gap-8">
        <section>
          <SearchBar onSearch={handleSearch} setLoading={setLoading} />
          {!hasQuery ? (
            <Hero />
          ) : (
            <Results query={query} data={data} loading={loading} />
          )}
        </section>

        <aside className="border rounded p-3 bg-white">
          <h2 className="font-semibold mb-2">Recent parses</h2>
          <History />
        </aside>
      </div>
    </main>
  );
}
