import { useSelector } from "react-redux";
import type { RootState } from "../store";

export default function History() {
  const history = useSelector((s: RootState) => s.session.history);

  if (!history?.length) {
    return <div className="text-sm opacity-70">No recent results yet.</div>;
  }

  return (
    <ul className="text-sm space-y-2">
      {history.map((h, idx) => (
        <li key={idx} className="border rounded p-2">
          <div className="font-medium">{h.title}</div>
          <div className="opacity-70 mt-1">
            {h.ingredients.slice(0, 4).join(", ")}
            {h.ingredients.length > 4 ? "â€¦" : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}

