import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../store";
import { clearCart, removeFromCart } from "../store/cartSlice";

export default function Cart() {
  const dispatch = useDispatch();
  const items = useSelector((s: RootState) => Object.values(s.cart.items));
  const total = items.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm">
        <strong>Cart:</strong> {total} item{total === 1 ? "" : "s"}
      </div>
      <button
        className="px-3 py-1 rounded border"
        disabled={items.length === 0}
        onClick={() => dispatch(clearCart())}
        title="Clear cart"
      >
        Clear
      </button>
      {/* simple dropdown-ish list */}
      {items.length > 0 && (
        <div className="relative group">
          <button className="px-3 py-1 rounded bg-black text-white">
            View
          </button>
          <div className="absolute right-0 mt-2 hidden group-hover:block bg-white border rounded shadow w-64 max-h-72 overflow-auto z-10">
            <ul className="divide-y">
              {items.map((i) => (
                <li key={i.id} className="p-2 text-sm flex items-center gap-2">
                  <span className="flex-1">
                    {i.label} <span className="opacity-60">Ã—{i.qty}</span>
                  </span>
                  <button
                    className="text-xs px-2 py-1 border rounded"
                    onClick={() => dispatch(removeFromCart(i.id))}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
