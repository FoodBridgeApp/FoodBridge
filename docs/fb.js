/* frontend fb.js — binds UI to API, renders names (no [object Object]), lets you select items, merges/optimizes */
const API = window.API_BASE || "https://foodbridge-server-rv0a.onrender.com";

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function el(tag, props = {}, ...kids) { const n = document.createElement(tag); Object.assign(n, props); kids.forEach(k=>n.append(k)); return n; }
function fmtItem(i){ const name=i?.name||i?.title||"Untitled"; const qty=i?.qty?String(i.qty):""; const unit=i?.unit?String(i.unit):""; return `${name}${qty?` ${qty}`:""}${unit?` ${unit}`:""}`; }

// ---------- AI recipe ----------
const inpDish=$("#ai-dish"); const selDiet=$("#ai-diet"); const btnGen=$("#ai-generate"); const btnAdd=$("#ai-add");
const ulIngr=$("#ai-ingredients"); const olSteps=$("#ai-steps");
let lastRecipe={ title:"", ingredients:[], steps:[] };

async function genRecipe(){
  const dish=(inpDish?.value||"").trim(); const diet=(selDiet?.value||"").trim();
  const r=await fetch(`${API}/api/ingest/llm`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dish,diet})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||"llm_failed");
  const rec=j.recipe||{};
  lastRecipe={ title: rec.title||dish||"Recipe", ingredients:(rec.ingredients||[]).map(x=>typeof x==="string"?{name:x,qty:1,unit:""}:x), steps:rec.steps||[] };
  renderRecipe();
}

function renderRecipe(){
  ulIngr.innerHTML="";
  lastRecipe.ingredients.forEach((it,idx)=>{
    const li=el("li",{className:"ai-item"});
    const cb=el("input",{type:"checkbox",checked:true}); cb.dataset.idx=String(idx);
    const label=el("span",{textContent:fmtItem(it),className:"ml-2"});
    li.append(cb,label); ulIngr.append(li);
  });
  olSteps.innerHTML=""; lastRecipe.steps.forEach(s=>olSteps.append(el("li",{textContent:s})));
}

btnGen?.addEventListener("click", async()=>{ try{ await genRecipe(); }catch(e){ console.error(e); alert("Generate failed"); } });
btnAdd?.addEventListener("click", async()=>{
  const checked=$$("#ai-ingredients input[type=checkbox]:checked");
  const items=checked.map(cb=>lastRecipe.ingredients[Number(cb.dataset.idx)]).filter(Boolean);
  if(!items.length) return; await upsertCart(CURRENT_USER,items); await refreshCart();
});

// ---------- Cart ----------
const CURRENT_USER="christian";
const ulCart=$("#cart-list"); const btnOpt=$("#btn-optimize"); const spanTotal=$("#cart-total");

async function upsertCart(userId,items){
  const r=await fetch(`${API}/api/cart/upsert`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,items})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||"upsert_failed"); return j.cart;
}
async function mergeSources(userId,arrays){
  const r=await fetch(`${API}/api/cart/merge`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,sources:arrays.map(items=>({items}))})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||"merge_failed"); return j.cart;
}
async function exportByUser(userId){
  const r=await fetch(`${API}/api/cart/export.json?userId=${encodeURIComponent(userId)}`);
  const j=await r.json(); if(!j.ok) throw new Error(j.error||"export_failed"); return j.cart;
}
function fakePrice(item){ const base=(String(item.name||item.title||"").length%3)+1; return base; }

async function refreshCart(){
  try{
    const cart=await exportByUser(CURRENT_USER);
    ulCart.innerHTML=""; let total=0;
    (cart.items||[]).forEach((it,idx)=>{
      const price=fakePrice(it); total+=price;
      const li=el("li",{className:"cart-line"},
        el("input",{type:"checkbox",checked:true,dataset:{idx:String(idx)}}),
        el("span",{textContent:fmtItem(it),className:"ml-2"}),
        el("span",{textContent:` $${price.toFixed(2)}`,className:"ml-2 op-60"}));
      ulCart.append(li);
    });
    if(spanTotal) spanTotal.textContent=`$${total.toFixed(2)}`;
  }catch{ ulCart.innerHTML=""; if(spanTotal) spanTotal.textContent="$0.00"; }
}

btnOpt?.addEventListener("click", async ()=>{
  const selected=$$("#cart-list input[type=checkbox]:checked`).map(cb=>Number(cb.dataset.idx));
  let current; try{ current=await exportByUser(CURRENT_USER);}catch{ current={items:[]}; }
  const picked=(current.items||[]).filter((_,i)=>selected.includes(i));
  await mergeSources(CURRENT_USER,[picked]); await refreshCart();
});

// ---------- boot ----------
(async function boot(){ try{ await genRecipe(); }catch{} await refreshCart(); })();
