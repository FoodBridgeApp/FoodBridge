import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
type Recipe = { title: string; ingredients: string[] };
type State = { history: Recipe[] };
const sessionSlice = createSlice({
  name:"session", initialState:{ history: [] } as State,
  reducers:{
    pushResult(state, action: PayloadAction<Recipe>){
      state.history.unshift(action.payload);
      state.history = state.history.slice(0,10);
    },
    clearHistory(state){ state.history = []; }
  }
});
export const { pushResult, clearHistory } = sessionSlice.actions;
export default sessionSlice.reducer;
