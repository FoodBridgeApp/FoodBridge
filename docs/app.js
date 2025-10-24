;(() => { try {
  console.log("[FB] boot", { API: window.FB_API_URL, PAGES_BASE: window.FB_PAGES_BASE });
  window.addEventListener("error", e => console.error("[FB] window error:", e.error || e.message || e));
  window.addEventListener("unhandledrejection", e => console.error("[FB] unhandledrejection:", e.reason || e));
  document.addEventListener("DOMContentLoaded", () => {
    try {
      const b = document.createElement("div");
      b.textContent = "FoodBridge UI loaded ✓";
      b.style.cssText = "position:fixed;left:8px;bottom:8px;padding:6px 10px;background:#0ea5e9;color:#fff;border-radius:8px;z-index:9999;font:14px/1.2 ui-sans-serif,system-ui";
      document.body.appendChild(b);
      setTimeout(()=>b.remove(), 4500);
    } catch (e) { console.error("[FB] banner error", e); }
  });
} catch(e){ console.error("[FB] early boot error", e); } })();
(() => {
  const API = (window.FB_API_URL || "").replace(/\/$/, "");
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));
  const state={recipes:[],cart:{items:[],total:0},savings:0};

  const apiBaseEl = document.getElementById("apiBase");
  if (apiBaseEl) apiBaseEl.textContent = API;

  function showSpinner(v){document.getElementById("spinner").classList.toggle("hidden",!v)}
  function press(btn){ if(!btn) return; btn.classList.add("pressed"); setTimeout(()=>btn.classList.remove("pressed"),120); }
  function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

  function renderRecipes(){
    const wrap=document.getElementById("recipes"); wrap.innerHTML="";
    state.recipes.forEach((r,idx)=>{
      const card=document.createElement("div"); card.className="recipe-card";
      card.innerHTML=`<div class="recipe-col">
        <div class="recipe-title">🍽️ ${escapeHtml(r.title||"Recipe")}</div>
        <div class="recipe-sub">Servings: ${r.servings??4}</div>
        <div class="memphis"></div>
        <h3>Ingredients</h3><ul>${(r.ingredients||[]).map(i=>`<li>${escapeHtml(i.name||i)}</li>`).join("")}</ul>
      </div>
      <div class="recipe-col">
        <h3>Steps</h3><ol>${(r.steps||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ol>
        <div style="margin-top:12px"><button class="btn" data-add="${idx}">Add to Cart</button></div>
      </div>`;
      wrap.appendChild(card);
    });
    $$('#recipes [data-add]').forEach(btn=>btn.addEventListener('click',()=>{press(btn); const r=state.recipes[Number(btn.dataset.add)]; addRecipeToCart(r);}));
  }

  function addRecipeToCart(r){(r.ingredients||[]).forEach(it=>{const name=typeof it==="string"?it:(it.name||""); if(name) state.cart.items.push({name,qty:1})}); priceCart();}

  async function priceCart(){
    showSpinner(true);
    const res=await fetch(API+"/api/pricing/cart",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items:state.cart.items})}).then(r=>r.json());
    state.cart.items=res.items; state.cart.total=res.total; renderCart(); showSpinner(false);
  }

  function renderCart(){
    document.getElementById("cart-items").innerHTML=state.cart.items.map((i,idx)=>`<li>
      <span class="name">${escapeHtml(i.name)}</span>
      <span>${i.qty} × $${(i.unitPrice||0).toFixed(2)}</span>
      <div class="item-actions">
        <button class="btn" data-dec="${idx}">−</button>
        <button class="btn" data-inc="${idx}">+</button>
        <button class="btn" data-opt="${idx}">Optimize</button>
      </div>
    </li>`).join("");
    document.getElementById("checkout-total").textContent=(state.cart.total||0).toFixed(2);
    document.getElementById("savings").textContent=state.savings?`You saved $${state.savings.toFixed(2)}!`:"";
    bindCartButtons();
  }

  function bindCartButtons(){
    $$('#cart-items [data-inc]').forEach(b=>b.onclick=()=>{press(b); const i=Number(b.dataset.inc); state.cart.items[i].qty++; priceCart();});
    $$('#cart-items [data-dec]').forEach(b=>b.onclick=()=>{press(b); const i=Number(b.dataset.dec); state.cart.items[i].qty=Math.max(1,(state.cart.items[i].qty-1)); priceCart();});
    $$('#cart-items [data-opt]').forEach(b=>b.onclick=async()=>{press(b); showSpinner(true);
      const i=Number(b.dataset.opt);
      const res=await fetch(API+"/api/optimize/item",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({item:state.cart.items[i]})}).then(r=>r.json());
      state.cart.items[i]=res;
      state.cart.total=state.cart.items.reduce((s,x)=>s+(x.lineTotal||x.unitPrice*x.qty),0);
      renderCart(); showSpinner(false);
    });
  }

  document.getElementById("btn-opt-all")?.addEventListener("click", async ()=>{ press(document.getElementById("btn-opt-all")); showSpinner(true);
    const res=await fetch(API+"/api/optimize/all",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items:state.cart.items})}).then(r=>r.json());
    state.cart.items=res.items; state.cart.total=res.total; state.savings=res.savings||0; renderCart(); showSpinner(false);
  });

  document.getElementById("btnDish")?.addEventListener("click", async ()=>{
    press(document.getElementById("btnDish")); showSpinner(true);
    document.getElementById("btnAddIngredients").disabled=true;
    try{
      const dish=(document.getElementById("dish").value||"").trim()||"fish tacos";
      const diet=(document.getElementById("diet").value||"").trim();
      const data=await fetch(API+"/api/ingest/free-text",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:dish,diet,servings:4})}).then(r=>r.json());
      const recipe=data.recipe||{};
      renderRecipeReadout("dish", recipe);
      const ings=recipe.ingredients||[];
      if(ings.length){ const b=document.getElementById("btnAddIngredients"); b.disabled=false; b.onclick=()=>{press(b); ings.forEach(x=> addRecipeToCart({ingredients:[x]}));}; }
      state.recipes.push(recipe); renderRecipes();
    }catch(e){ alert(e.message||"Failed"); } finally{ showSpinner(false); }
  });

  document.getElementById("btn-ingest-url")?.addEventListener("click", async ()=>{
    press(document.getElementById("btn-ingest-url")); showSpinner(true);
    document.getElementById("btnAddIngredientsUrl").disabled=true;
    try{
      const url=(document.getElementById("txt-url").value||"").trim();
      const diet=(document.getElementById("diet").value||"").trim();
      const data=await fetch(API+"/api/ingest/url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url,diet,servings:4})}).then(r=>r.json());
      const recipe=data.recipe||{};
      renderRecipeReadout("url", recipe);
      const ings=recipe.ingredients||[];
      if(ings.length){ const b=document.getElementById("btnAddIngredientsUrl"); b.disabled=false; b.onclick=()=>{press(b); ings.forEach(x=> addRecipeToCart({ingredients:[x]}));}; }
      state.recipes.push(recipe); renderRecipes();
    }catch(e){ alert(e.message||"Failed"); } finally{ showSpinner(false); }
  });

  document.getElementById("btn-ingest-audio")?.addEventListener("click", async ()=>{
    const f=document.getElementById("file-audio")?.files?.[0]; if(!f) return;
    press(document.getElementById("btn-ingest-audio")); showSpinner(true);
    const fd=new FormData(); fd.append("audio",f);
    try{
      const res=await fetch(API+"/api/ingest/audio",{method:"POST",body:fd}).then(r=>r.json());
      const recipe=res.recipe; state.recipes.push(recipe); renderRecipes();
    } finally { showSpinner(false); }
  });

  document.getElementById("btn-suggest")?.addEventListener("click", async ()=>{
    press(document.getElementById("btn-suggest")); showSpinner(true);
    const ul=document.getElementById("suggestions"); ul.innerHTML="<li>Loading...</li>";
    try{
      const q=(document.getElementById("q").value||"").trim()||"tomato";
      const data=await fetch(API+"/api/ingredients/suggest?q="+encodeURIComponent(q)).then(r=>r.json());
      ul.innerHTML=(data.suggestions||[]).map(s=>`<li>${s.name} <button class="btn" data-suggest="${encodeURIComponent(s.name)}">+</button></li>`).join("")||"<li>(no results)</li>";
    } finally { showSpinner(false); }
  });
  document.getElementById("suggestions")?.addEventListener("click",(e)=>{const b=e.target.closest("button[data-suggest]"); if(!b)return; const name=decodeURIComponent(b.getAttribute("data-suggest")); state.cart.items.push({name,qty:1}); priceCart();});
})();

// bump 20251023081801

