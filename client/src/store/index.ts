import { configureStore } from "@reduxjs/toolkit";
import cart from "./cartSlice";
import session from "./sessionSlice";
export const store = configureStore({ reducer:{ cart, session }});
store.subscribe(()=>{ try { localStorage.setItem("fb.cart", JSON.stringify(store.getState().cart)); } catch {} });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
