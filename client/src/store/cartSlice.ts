import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
type Item = { id: string; label: string; qty: number };
type State = { items: Record<string, Item> };

const saved = (() => { try { return JSON.parse(localStorage.getItem("fb.cart") || "{}"); } catch { return {}; }})();
const initialState: State = { items: (saved as any)?.items ?? {} };

const cartSlice = createSlice({
  name: "cart", initialState,
  reducers: {
    addManyToCart(state, action: PayloadAction<string[]>){
      for (const raw of action.payload){
        const key = raw.trim().toLowerCase();
        if(!key) continue;
        const existing = state.items[key];
        state.items[key] = existing
          ? { ...existing, qty: existing.qty + 1 }
          : { id:key, label:raw, qty:1 };
      }
    },
    removeFromCart(state, action: PayloadAction<string>){ delete state.items[action.payload]; },
    clearCart(state){ state.items = {}; }
  }
});
export const { addManyToCart, removeFromCart, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
