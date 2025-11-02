import { useState } from "react";
import SearchBar from "./components/SearchBar";
import Results from "./components/Results";
import Hero from "./components/Hero";

type Query = { text: string } | { url: string } | null;
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

  const hasQuery = !!query;

  return (
    <main className="max-w-4xl mx-auto p-4">
      <SearchBar onSearch={handleSearch} setLoading={setLoading} />
      {!hasQuery ? <Hero /> : <Results query={query} data={data} loading={loading} />}
    </main>
  );
}
