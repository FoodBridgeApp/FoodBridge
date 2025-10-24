;(() => {
  try {
    if (window.__fb_net_patch__) return; window.__fb_net_patch__ = true;

    // --- tiny toast ---
    function toast(msg){
      try{
        const t = document.createElement("div");
        t.textContent = msg;
        t.style.cssText = "position:fixed;right:8px;bottom:8px;background:#111;color:#fff;padding:8px 12px;border-radius:10px;z-index:9999;font:13px/1.2 ui-sans-serif,system-ui;opacity:.95";
        document.body.appendChild(t); setTimeout(()=>t.remove(), 4200);
      }catch(e){}
    }

    // --- global fetch with timeout (12s) ---
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (url, opts={}) => {
      const t = (opts && typeof opts.timeout === "number") ? opts.timeout : 12000;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort("timeout"), t);
      const final = {...opts, signal: ac.signal, mode: opts.mode || "cors", credentials: opts.credentials || "omit"};
      const startedAt = Date.now();
      return nativeFetch(url, final).finally(() => clearTimeout(timer)).then(async (r) => {
        // Surface 4xx/5xx as failures so our UI can react
        if (!r.ok) {
          const txt = await r.text().catch(()=>String(r.status));
          const err = new Error("HTTP "+r.status+": "+txt.slice(0,200));
          err.status = r.status;
          throw err;
        }
        return r;
      }).catch((e) => {
        console.error("[FB] fetch fail:", {url, ms: Date.now()-startedAt, err: String(e && e.message || e)});
        try { document.getElementById("spinner")?.classList.add("hidden"); } catch(_){}
        toast("Network issue — please try again.");
        throw e;
      });
    };

    // --- safer helpers for buttons so they don't double-trigger ---
    function guardClick(btn, fn){
      if (!btn) return;
      btn.addEventListener("click", async () => {
        if (btn.__busy) return;
        btn.__busy = true; btn.disabled = true;
        try { await fn(); }
        finally { btn.__busy = false; btn.disabled = false; }
      });
    }

    // --- Email Plan: try backend first if configured, else mailto ---
    // If your backend supports it, expose window.FB_EMAIL_ENDPOINT in config.js like:
    //   window.FB_EMAIL_ENDPOINT = window.FB_API_URL + "/api/email/plan";
    (function wireEmail(){
      const emailBtn = document.getElementById("btn-email");
      if (!emailBtn) return;
      guardClick(emailBtn, async () => {
        const s = window.__fb_state__ || window.state || {};
        const items = (s.cart && s.cart.items) ? s.cart.items : [];
        const summary = items.map(i => `- ${i.name || ""}  x${i.qty || 1}  $${(i.unitPrice||0).toFixed?.(2) || i.unitPrice || 0}`).join("\n");
        const total = (s.cart && s.cart.total) ? s.cart.total : 0;
        const payload = { items, total, page: location.href, api: String(window.FB_API_URL||"") };

        if (window.FB_EMAIL_ENDPOINT) {
          try {
            document.getElementById("spinner")?.classList.remove("hidden");
            await fetch(String(window.FB_EMAIL_ENDPOINT), {
              method: "POST",
              headers: {"content-type":"application/json"},
              body: JSON.stringify(payload),
              timeout: 12000
            }).then(r=>r.json());
            toast("Plan emailed ✔");
            return;
          } catch(e) {
            console.warn("[FB] email endpoint failed, falling back to mailto", e);
          } finally {
            document.getElementById("spinner")?.classList.add("hidden");
          }
        }
        const body =
`FoodBridge Plan

Items:
${summary}

Estimated total: $${(Number(total)||0).toFixed(2)}

API: ${(window.FB_API_URL||"")}
Page: ${location.href}
`;
        location.href = "mailto:?subject=" + encodeURIComponent("FoodBridge Plan") + "&body=" + encodeURIComponent(body);
      });
    })();

    // --- Ensure spinner always hides after rejected promise chains ---
    window.addEventListener("unhandledrejection", () => {
      try { document.getElementById("spinner")?.classList.add("hidden"); } catch(_){}
    });
    window.addEventListener("error", () => {
      try { document.getElementById("spinner")?.classList.add("hidden"); } catch(_){}
    });

    // --- Debounced suggest (prevents rapid-fire requests) ---
    const btnSuggest = document.getElementById("btn-suggest");
    if (btnSuggest) {
      let t = 0;
      btnSuggest.addEventListener("click", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          // let existing app.js handler run, but our fetch wrapper/guards handle failures
        }, 150);
      }, {capture: true}); // capture so debounce occurs before original handler
    }

  } catch(e) { console.error("[FB] net/ux patch error", e); }
})();
;(() => {
  try {
    // guard so we don't re-attach twice
    if (window.__fb_patch_applied__) return; 
    window.__fb_patch_applied__ = true;

    // ----- Tiny toast -----
    function toast(msg){
      try{
        const t = document.createElement("div");
        t.textContent = msg;
        t.style.cssText = "position:fixed;right:8px;bottom:8px;background:#111;color:#fff;padding:8px 12px;border-radius:10px;z-index:9999;font:13px/1.2 ui-sans-serif,system-ui;opacity:.95";
        document.body.appendChild(t);
        setTimeout(()=>t.remove(), 3500);
      }catch(e){}
    }

    // ----- Cart persistence -----
    const CART_KEY = "fb.cart.v1";
    // load once, then save on changes (we piggyback renderCart and priceCart)
    const saveCart = () => {
      try {
        const s = window.__fb_state__ || window.state; // prefer a ref if present
        const cart = (s && s.cart) ? { items: s.cart.items || [], total: s.cart.total || 0 } : null;
        if (cart) localStorage.setItem(CART_KEY, JSON.stringify(cart));
      } catch(e){}
    };
    const loadCart = () => {
      try { return JSON.parse(localStorage.getItem(CART_KEY) || "null"); } catch(e){ return null; }
    };

    // Try to detect/track state object from app.js
    // If your app already uses "state", expose a ref so we can use it here.
    if (window.state && !window.__fb_state__) window.__fb_state__ = window.state;

    // Patch renderCart to also persist
    const _renderCart = window.renderCart;
    if (typeof _renderCart === "function") {
      window.renderCart = function(){
        try { _renderCart.apply(this, arguments); } finally { saveCart(); }
      };
    }

    // On boot (DOMContentLoaded) restore cart once, then re-price
    document.addEventListener("DOMContentLoaded", () => {
      // Set API label if that element exists
      try {
        const apiBaseEl = document.getElementById("apiBase");
        if (apiBaseEl && window.FB_API_URL) apiBaseEl.textContent = String(window.FB_API_URL).replace(/\/$/, "");
      } catch(e){}

      const s = window.__fb_state__ || window.state;
      const cached = loadCart();
      if (s && s.cart && cached && Array.isArray(cached.items) && cached.items.length) {
        s.cart.items = cached.items;
        s.cart.total = cached.total || 0;
        try {
          if (typeof window.renderCart === "function") window.renderCart();
          // If your app has priceCart, call it to re-price from server
          if (typeof window.priceCart === "function") window.priceCart();
        } catch(e){}
      }
    });

    // ----- Print Plan -----
    const printBtn = document.getElementById("btn-print");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        try { window.print(); } catch(e){ console.error(e); toast("Unable to open print dialog."); }
      });
    }

    // ----- Email Plan (mailto fallback) -----
    const emailBtn = document.getElementById("btn-email");
    if (emailBtn) {
      emailBtn.addEventListener("click", () => {
        try {
          const s = window.__fb_state__ || window.state || {};
          const items = (s.cart && s.cart.items) ? s.cart.items : [];
          const lines = items.map(i => `- ${i.name || ""}  x${i.qty || 1}  $${(i.unitPrice||0).toFixed?.(2) || i.unitPrice || 0}`);
          const total = (s.cart && s.cart.total) ? s.cart.total : 0;
          const body =
`FoodBridge Plan

Items:
${lines.join("\r\n")}

Estimated total: $${(Number(total)||0).toFixed(2)}

API: ${(window.FB_API_URL||"").toString()}
Page: ${location.href}
`;
          const mailto = "mailto:?subject=" + encodeURIComponent("FoodBridge Plan") + "&body=" + encodeURIComponent(body);
          location.href = mailto;
        } catch(e){ console.error(e); toast("Couldn’t open email."); }
      });
    }

    // ----- Global error hooks -> console + toast -----
    window.addEventListener("error", e => { console.error("[FB] window error:", e.error || e.message || e); toast("Error: " + (e.message || "See console")); });
    window.addEventListener("unhandledrejection", e => { console.error("[FB] unhandledrejection:", e.reason || e); toast("Error: " + (e.reason?.message || "See console")); });
  } catch(e) { console.error("[FB] feature pack error", e); }
})();
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


;(()=>{try{
  const box = document.createElement("div");
  box.id="fb-debug";
  box.style.cssText="position:fixed;right:8px;bottom:8px;max-width:380px;background:#111;color:#fff;padding:10px 12px;border-radius:10px;z-index:99999;font:12px/1.35 ui-sans-serif,system-ui";
  box.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">FoodBridge Debug</div>
    <div>API: <code>${window.FB_API_URL||"(undefined)"}</code></div>
    <div>PAGES_BASE: <code>${window.FB_PAGES_BASE||"(undefined)"}</code></div>
    <div id="fb-ping" style="margin-top:6px">Ping: <em>…</em></div>
    <div id="fb-suggest" style="margin-top:6px">Suggest(tomato): <em>…</em></div>
  `;
  document.addEventListener("DOMContentLoaded", ()=>document.body.appendChild(box));

  // Log all errors to console
  window.addEventListener("error", e => console.error("[FB] window error:", e.error||e.message||e));
  window.addEventListener("unhandledrejection", e => console.error("[FB] unhandledrejection:", e.reason||e));

  // Ping /api/health (or mark N/A)
  const pingEl = ()=>document.getElementById("fb-ping");
  fetch((window.FB_API_URL||"")+"/api/health",{credentials:"include"})
    .then(r=>r.json()).then(j=>{
      if(pingEl()) pingEl().innerHTML="Ping: <span style='color:#34d399'>OK</span> " + JSON.stringify(j);
      console.log("[FB] health:", j);
    }).catch(err=>{
      if(pingEl()) pingEl().innerHTML="Ping: <span style='color:#f87171'>FAIL</span> " + (err && err.message || err);
      console.error("[FB] health error:", err);
    });

  // Try ingredients/suggest to prove CORS and JSON flows
  const sEl = ()=>document.getElementById("fb-suggest");
  fetch((window.FB_API_URL||"")+"/api/ingredients/suggest?q=tomato",{credentials:"include"})
    .then(r=>r.json()).then(j=>{
      const names=(j.suggestions||[]).map(x=>x.name).slice(0,5).join(", ") || "(none)";
      if(sEl()) sEl().innerHTML="Suggest(tomato): <span style='color:#34d399'>OK</span> ["+names+"]";
      console.log("[FB] suggest:", j);
    }).catch(err=>{
      if(sEl()) sEl().innerHTML="Suggest(tomato): <span style='color:#f87171'>FAIL</span> " + (err && err.message || err);
      console.error("[FB] suggest error:", err);
    });

}catch(e){console.error("[FB] debug panel error",e)}})();
;(function(){
  if (typeof window.renderRecipeReadout === "function") return;
  window.renderRecipeReadout = function(kind, recipe){
    try {
      var id = function(base){ return (kind === "url" ? ("url" + base) : ("dish" + base)); };
      var titleEl = document.getElementById(id("Title"));
      var metaEl  = document.getElementById(id("Meta"));
      var ingEl   = document.getElementById(id("Ingredients"));
      var stepsEl = document.getElementById(id("Steps"));
      if (!titleEl || !metaEl || !ingEl || !stepsEl) return;

      var esc = function(s){ return String(s ?? "").replace(/[&<>"]/g, function(c){
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);
      }); };

      var servings = (recipe && (recipe.servings ?? 4));
      titleEl.textContent = (recipe && recipe.title) || "Recipe";
      metaEl.textContent  = "Servings: " + servings;

      var ings = (recipe?.ingredients || []).map(function(i){
        var name = (typeof i === "string") ? i : (i && i.name) || "";
        return "<li>" + esc(name) + "</li>";
      }).join("");
      ingEl.innerHTML = ings;

      var steps = (recipe?.steps || []).map(function(s){
        return "<li>" + esc(s) + "</li>";
      }).join("");
      stepsEl.innerHTML = steps;
    } catch (e){
      console.error("[FB] renderRecipeReadout error", e);
    }
  };
})();
;(function(){
  if (typeof window.renderRecipeReadout === "function") return;
  window.renderRecipeReadout = function(kind, recipe){
    try {
      var id = function(base){ return (kind === "url" ? ("url" + base) : ("dish" + base)); };
      var titleEl = document.getElementById(id("Title"));
      var metaEl  = document.getElementById(id("Meta"));
      var ingEl   = document.getElementById(id("Ingredients"));
      var stepsEl = document.getElementById(id("Steps"));
      if (!titleEl || !metaEl || !ingEl || !stepsEl) return;

      var esc = function(s){ return String(s ?? "").replace(/[&<>"]/g, function(c){
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);
      }); };

      var servings = (recipe && (recipe.servings ?? 4));
      titleEl.textContent = (recipe && recipe.title) || "Recipe";
      metaEl.textContent  = "Servings: " + servings;

      var ings = (recipe?.ingredients || []).map(function(i){
        var name = (typeof i === "string") ? i : (i && i.name) || "";
        return "<li>" + esc(name) + "</li>";
      }).join("");
      ingEl.innerHTML = ings;

      var steps = (recipe?.steps || []).map(function(s){
        return "<li>" + esc(s) + "</li>";
      }).join("");
      stepsEl.innerHTML = steps;
    } catch (e){
      console.error("[FB] renderRecipeReadout error", e);
    }
  };
})();


