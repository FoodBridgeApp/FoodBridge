/* docs/fb.js — wired to index.html above; renders names (no [object Object]),
   checkbox-select adds, “optimize selected”, and cart export-by-user. */

(function () {
  // Resolve API base from config.js
  var CFG = window.FB_CONFIG || window.FB_CFG || {};
  var API = CFG.API_BASE || CFG.apiBase || window.__FB_API_BASE__ || "https://foodbridge-server-rv0a.onrender.com";
  var CURRENT_USER = "christian";

  // Tiny DOM helpers
  function $(s){return document.querySelector(s)}
  function $$(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  function el(tag, props){
    var n=document.createElement(tag||"div");
    if(props){for(var k in props){
      if(k==="dataset"){for(var dk in props.dataset){n.dataset[dk]=props.dataset[dk]}}
      else n[k]=props[k];
    }}
    for(var i=2;i<arguments.length;i++){var c=arguments[i]; if(c==null) continue; n.appendChild(typeof c==="string"?document.createTextNode(c):c)}
    return n;
  }

  // Reflect API in header
  var apiLbl = $("#apiBase"); if (apiLbl) apiLbl.textContent = API;

  // Spinner
  function spin(on){var s=$("#spinner"); if(s) s.style.display=on?"flex":"none"}

  // Pretty item string
  function fmtItem(i){
    var name = i && (i.name||i.title) ? (i.name||i.title) : "Untitled";
    var qty  = i && i.qty ? String(i.qty) : "";
    var unit = i && i.unit ? String(i.unit) : "";
    return name + (qty?(" "+qty):"") + (unit?(" "+unit):"");
  }

  // API helpers
  function jget(u){return fetch(u).then(r=>r.json())}
  function jpost(u,b){return fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})}).then(r=>r.json())}
  function upsertCart(userId,items){return jpost(API+"/api/cart/upsert",{userId:String(userId),items:items||[]}).then(j=>{if(!j.ok)throw Error(j.error||"upsert_failed");return j.cart})}
  function mergeSources(userId,arrays){return jpost(API+"/api/cart/merge",{userId:String(userId),sources:(arrays||[]).map(a=>({items:a||[]}))}).then(j=>{if(!j.ok)throw Error(j.error||"merge_failed");return j.cart})}
  function exportByUser(userId){return jget(API+"/api/cart/export.json?userId="+encodeURIComponent(String(userId))).then(j=>{if(!j.ok)throw Error(j.error||"export_failed");return j.cart})}
  function ingestLLM(dish,diet){return jpost(API+"/api/ingest/llm",{dish:String(dish||""),diet:String(diet||"")})}

  // Elements
  var dish=$("#dish"), diet=$("#diet"), btnDish=$("#btnDish");
  var dishTitle=$("#dishTitle"), dishMeta=$("#dishMeta"), dishIngredients=$("#dishIngredients"), dishSteps=$("#dishSteps"), btnAddIngredients=$("#btnAddIngredients");

  var urlIn=$("#txt-url"), btnUrl=$("#btn-ingest-url");
  var urlTitle=$("#urlTitle"), urlMeta=$("#urlMeta"), urlIngredients=$("#urlIngredients"), urlSteps=$("#urlSteps"), btnAddUrl=$("#btnAddIngredientsUrl");

  var suggestIn=$("#q"), btnSuggest=$("#btn-suggest"), ulSuggest=$("#suggestions");

  var cartList=$("#cart-items"), btnOpt=$("#btn-opt-all"), totalLbl=$("#checkout-total"), savings=$("#savings");

  // Normalize array of ingredients into {name, qty, unit, title}
  function normalize(arr){
    var out=[]; arr = Array.isArray(arr)?arr:[];
    for(var i=0;i<arr.length;i++){
      var it=arr[i];
      if(typeof it==="string"){ out.push({name:it,title:it,qty:1,unit:""}); continue; }
      if(it && typeof it==="object"){
        out.push({
          name: it.name || it.title || "Untitled",
          title: it.title || it.name || "Untitled",
          qty: it.qty || 1,
          unit: it.unit || "",
          type: it.type || "ingredient"
        });
      }
    }
    return out;
  }

  // Render a recipe into the given nodes
  function renderRecipe(titleEl, metaEl, ulEl, stepsEl, recipe, addBtn){
    var r = recipe||{};
    if(titleEl) titleEl.textContent = r.title||"";
    if(metaEl)  metaEl.textContent  = r.diet ? ("Diet: "+r.diet) : "";
    if(ulEl){
      ulEl.innerHTML=""; var list = r.ingredients||[];
      for(var i=0;i<list.length;i++){
        var it=list[i];
        ulEl.appendChild(
          el("li", null,
            el("label", null,
              el("input",{type:"checkbox",checked:true,dataset:{idx:String(i)}}),
              " ",
              fmtItem(it)
            )
          )
        );
      }
    }
    if(stepsEl){
      stepsEl.innerHTML=""; var steps = r.steps||[];
      for(var s=0;s<steps.length;s++) stepsEl.appendChild(el("li",{textContent:String(steps[s])}));
    }
    if(addBtn) addBtn.disabled = !(r.ingredients && r.ingredients.length);
  }

  function selectedFrom(ul, backing){
    var out=[], boxes = ul?ul.querySelectorAll("input[type=checkbox]:checked"):[];
    for(var i=0;i<boxes.length;i++){
      var idx = Number(boxes[i].dataset.idx||"-1"); if(!(idx>=0)) continue;
      var raw = backing[idx]; if(!raw) continue;
      out.push(typeof raw==="string"?{name:raw,title:raw,qty:1,unit:""}:raw);
    }
    return normalize(out);
  }

  // Dish flow
  var lastDish={title:"",diet:"",ingredients:[],steps:[]};

  function doGenerate(){
    var d=(dish&&dish.value||"").trim();
    var t=(diet&&diet.value||"").trim();
    spin(true);
    return ingestLLM(d,t).then(j=>{
      if(!j.ok) throw Error(j.error||"llm_failed");
      var rec=j.recipe||{};
      lastDish={
        title: rec.title || (d||"Recipe"),
        diet: t || "",
        ingredients: normalize(rec.ingredients||[]),
        steps: Array.isArray(rec.steps)?rec.steps:[]
      };
      renderRecipe(dishTitle,dishMeta,dishIngredients,dishSteps,lastDish,btnAddIngredients);
    }).catch(e=>{console.error(e); alert("Generate failed");}).finally(()=>spin(false));
  }

  btnDish && btnDish.addEventListener("click", doGenerate);

  btnAddIngredients && btnAddIngredients.addEventListener("click", ()=>{
    var picks = selectedFrom(dishIngredients, lastDish.ingredients);
    if(!picks.length) return;
    spin(true);
    upsertCart(CURRENT_USER, picks).then(refreshCart).catch(e=>{console.error(e);alert("Add failed");}).finally(()=>spin(false));
  });

  // URL (placeholder)
  var lastUrl={title:"",diet:"",ingredients:[],steps:[]};
  function fakeUrlIngest(){
    return Promise.resolve({
      ok:true,
      recipe:{title:"Imported Recipe",diet:"",ingredients:[{name:"tomato",qty:2},{name:"onion",qty:1},{name:"olive oil",qty:1,unit:"tbsp"}],steps:["Open URL","Extract","Cook"]}
    });
  }
  btnUrl && btnUrl.addEventListener("click", ()=>{
    if(!urlIn || !urlIn.value.trim()) return;
    spin(true);
    fakeUrlIngest().then(j=>{
      lastUrl = { title:j.recipe.title, diet:"", ingredients:normalize(j.recipe.ingredients), steps:j.recipe.steps };
      renderRecipe(urlTitle,urlMeta,urlIngredients,urlSteps,lastUrl,btnAddUrl);
    }).finally(()=>spin(false));
  });
  btnAddUrl && btnAddUrl.addEventListener("click", ()=>{
    var picks = selectedFrom(urlIngredients, lastUrl.ingredients);
    if(!picks.length) return;
    spin(true);
    upsertCart(CURRENT_USER, picks).then(refreshCart).finally(()=>spin(false));
  });

  // Suggestions (placeholder)
  btnSuggest && btnSuggest.addEventListener("click", ()=>{
    var q=(suggestIn&&suggestIn.value||"").trim(); if(!q) return;
    ulSuggest.innerHTML=""; ulSuggest.appendChild(el("li",null,"Try: tomato (2), onion (1), olive oil (1 tbsp)"));
  });

  // Cart
  function fakePrice(it){ return ((String(it.name||it.title||"").length%3)+1) }
  function refreshCart(){
    if(!cartList) return Promise.resolve();
    return exportByUser(CURRENT_USER).then(cart=>{
      cartList.innerHTML=""; var items=(cart&&cart.items)||[]; var total=0;
      for(var i=0;i<items.length;i++){
        var it=items[i], p=fakePrice(it); total+=p;
        cartList.appendChild(
          el("li",null,
            el("label",null,
              el("input",{type:"checkbox",checked:true,dataset:{idx:String(i)}})," ",
              fmtItem(it),"  $",p.toFixed(2)
            )
          )
        );
      }
      if(totalLbl) totalLbl.textContent = total.toFixed(2);
      if(savings) savings.textContent = "";
    }).catch(()=>{
      cartList.innerHTML=""; if(totalLbl) totalLbl.textContent="0.00";
    });
  }

  btnOpt && btnOpt.addEventListener("click", ()=>{
    spin(true);
    // pick only checked items, then merge; this also dedupes
    exportByUser(CURRENT_USER).then(cart=>{
      var items=(cart&&cart.items)||[];
      var boxes=cartList.querySelectorAll('input[type=checkbox]:checked'), pick=[];
      for(var i=0;i<boxes.length;i++){var n=Number(boxes[i].dataset.idx||"-1"); if(n>=0) pick.push(items[n]);}
      if(!pick.length) return null;
      return mergeSources(CURRENT_USER,[pick]);
    }).then(()=>refreshCart()).finally(()=>spin(false));
  });

  // Boot: create first recipe then load cart
  (function boot(){
    try{ var apiLbl=document.getElementById("apiBase"); if(apiLbl) apiLbl.textContent=API; }catch{}
    doGenerate().finally(refreshCart);
  })();
})();
