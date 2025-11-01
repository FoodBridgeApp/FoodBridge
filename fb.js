// docs/fb.js — clean, no autostart, every section selectable + addable

(function () {
  // ---- config / constants ----
  var CFG = (window.FB_CONFIG || window.FB_CFG || {});
  var API = CFG.API_BASE || CFG.apiBase || window.__FB_API_BASE__ || "https://foodbridge-server-rv0a.onrender.com";
  var CURRENT_USER = "christian";

  // ---- dom helpers ----
  function $(s){return document.querySelector(s)}
  function $$(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  function el(tag, props){var n=document.createElement(tag||"div");if(props){for(var k in props){if(k==="dataset"){for(var d in props.dataset){n.dataset[d]=props.dataset[d]}}else{n[k]=props[k]}}} for(var i=2;i<arguments.length;i++){var c=arguments[i]; if(c==null)continue; n.appendChild(typeof c==="string"?document.createTextNode(c):c)} return n}
  function spin(on){var s=$("#spinner"); if(s) s.style.display=on?"flex":"none"}
  var apiLbl=$("#apiBase"); if(apiLbl) apiLbl.textContent=API;

  // ---- normalizers ----
  function normItems(arr){
    var out=[]; if(!Array.isArray(arr)) return out;
    for(var i=0;i<arr.length;i++){
      var it=arr[i];
      if(typeof it==="string"){out.push({name:it,title:it,qty:1,unit:"",type:"ingredient"});continue;}
      if(it && typeof it==="object"){
        out.push({
          name: it.name || it.title || "Untitled",
          title: it.title || it.name || "Untitled",
          qty: it.qty || 1,
          unit: it.unit || "",
          type: it.type || "ingredient",
          sourceUrl: it.sourceUrl || null
        });
      }
    }
    return out;
  }
  function fmtItem(i){
    var name=(i&& (i.name||i.title)) || "Untitled";
    var qty=i&&i.qty?(" "+String(i.qty)):"";
    var unit=i&&i.unit?(" "+String(i.unit)):"";
    return name+qty+unit;
  }

  // ---- API helpers ----
  function jget(u){return fetch(u).then(r=>r.json())}
  function jpost(u,b){return fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})}).then(r=>r.json())}
  function upsertCart(userId,items){return jpost(API+"/api/cart/upsert",{userId:String(userId),items:items||[]}).then(j=>{if(!j.ok)throw Error(j.error||"upsert_failed");return j.cart})}
  function mergeSources(userId,arrays){return jpost(API+"/api/cart/merge",{userId:String(userId),sources:(arrays||[]).map(x=>({items:x||[]}))}).then(j=>{if(!j.ok)throw Error(j.error||"merge_failed");return j.cart})}
  function exportByUserIfExists(userId){
    return jget(API+"/api/cart/export.json?userId="+encodeURIComponent(String(userId)))
      .then(j=> j.ok ? j.cart : null)
      .catch(()=> null);
  }
  function ingestLLM(dish,diet){
    return jpost(API+"/api/ingest/llm",{dish:String(dish||""),diet:String(diet||"")});
  }

  // ---- elements (AI recipe) ----
  var dish=$("#dish"), diet=$("#diet"), btnDish=$("#btnDish");
  var aiEmpty=$("#aiEmpty"), aiBlock=$("#aiBlock");
  var dishTitle=$("#dishTitle"), dishMeta=$("#dishMeta"), dishIngredients=$("#dishIngredients"), dishSteps=$("#dishSteps"), btnAddIngredients=$("#btnAddIngredients");
  var lastAI={title:"",diet:"",ingredients:[],steps:[]};

  function renderChecklist(ul, items){
    ul.innerHTML="";
    for(var i=0;i<items.length;i++){
      ul.appendChild(
        el("li",null,
          el("label",null,
            el("input",{type:"checkbox",checked:true,dataset:{idx:String(i)}}),
            " ",
            fmtItem(items[i])
          )
        )
      );
    }
  }
  function selectedFrom(ul, backing){
    var out=[], boxes = ul.querySelectorAll("input[type=checkbox]:checked");
    for(var i=0;i<boxes.length;i++){
      var idx = Number(boxes[i].dataset.idx||"-1"); if(idx<0) continue;
      var raw = backing[idx]; if(!raw) continue;
      out.push(typeof raw==="string"?{name:raw,title:raw,qty:1,unit:""}:raw);
    }
    return normItems(out);
  }

  btnDish && btnDish.addEventListener("click", function(){
    var d=(dish&&dish.value||"").trim();
    var t=(diet&&diet.value||"").trim();
    if(!d){ alert("Type a dish first."); return; }
    spin(true);
    ingestLLM(d,t).then(function(j){
      if(!j.ok) throw Error(j.error||"llm_failed");
      var r=j.recipe||{};
      lastAI={
        title: r.title || d,
        diet: t || "",
        ingredients: normItems(r.ingredients||[]),
        steps: Array.isArray(r.steps)?r.steps:[]
      };
      aiEmpty.style.display="none"; aiBlock.style.display="";
      dishTitle.textContent = lastAI.title;
      dishMeta.textContent  = lastAI.diet ? ("Diet: "+lastAI.diet) : "";
      renderChecklist(dishIngredients,lastAI.ingredients);
      dishSteps.innerHTML="";
      for(var s=0;s<lastAI.steps.length;s++){dishSteps.appendChild(el("li",{textContent:String(lastAI.steps[s])}))}
      btnAddIngredients.disabled = lastAI.ingredients.length===0;
    }).catch(function(e){ console.error(e); alert("Generate failed."); })
      .finally(function(){ spin(false); });
  });

  btnAddIngredients && btnAddIngredients.addEventListener("click", function(){
    var picks = selectedFrom(dishIngredients, lastAI.ingredients);
    if(!picks.length) return;
    spin(true);
    upsertCart(CURRENT_USER, picks).then(refreshCart).finally(function(){spin(false)});
  });

  // ---- Import URL (uses LLM behind the scenes with the URL as hint) ----
  var urlIn=$("#txt-url"), btnUrl=$("#btnUrl");
  var urlEmpty=$("#urlEmpty"), urlBlock=$("#urlBlock");
  var urlTitle=$("#urlTitle"), urlMeta=$("#urlMeta"), urlIngredients=$("#urlIngredients"), urlSteps=$("#urlSteps"), btnAddUrl=$("#btnAddUrl");
  var lastURL={title:"",diet:"",ingredients:[],steps:[]};

  btnUrl && btnUrl.addEventListener("click", function(){
    var u=(urlIn&&urlIn.value||"").trim();
    if(!u){ alert("Paste a URL first."); return; }
    spin(true);
    // We ask the same LLM endpoint to infer a recipe from the URL text.
    ingestLLM(u,"").then(function(j){
      if(!j.ok) throw Error(j.error||"llm_failed");
      var r=j.recipe||{};
      lastURL={
        title: r.title || "Imported Recipe",
        diet: "",
        ingredients: normItems(r.ingredients||[]),
        steps: Array.isArray(r.steps)?r.steps:[]
      };
      urlEmpty.style.display="none"; urlBlock.style.display="";
      urlTitle.textContent = lastURL.title;
      urlMeta.textContent  = u;
      renderChecklist(urlIngredients,lastURL.ingredients);
      urlSteps.innerHTML="";
      for(var s=0;s<lastURL.steps.length;s++){urlSteps.appendChild(el("li",{textContent:String(lastURL.steps[s])}))}
      btnAddUrl.disabled = lastURL.ingredients.length===0;
    }).catch(function(e){ console.error(e); alert("Import failed."); })
      .finally(function(){ spin(false); });
  });

  btnAddUrl && btnAddUrl.addEventListener("click", function(){
    var picks = selectedFrom(urlIngredients, lastURL.ingredients);
    if(!picks.length) return;
    spin(true);
    upsertCart(CURRENT_USER, picks).then(refreshCart).finally(function(){spin(false)});
  });

  // ---- Suggestions (simple, selectable) ----
  var sugEmpty=$("#sugEmpty"), sugBlock=$("#sugBlock"), btnSuggest=$("#btnSuggest"), btnAddSug=$("#btnAddSug"), ulSug=$("#suggestions");
  var lastSug=[];
  btnSuggest && btnSuggest.addEventListener("click", function(){
    var q=($("#q")&&$("#q").value||"").trim(); if(!q){alert("Type a theme first."); return;}
    // Local small set – replace with your true suggester when ready
    lastSug = normItems([q+" sauce", q+" noodles", "garlic", "olive oil", "salt", "pepper"]);
    sugEmpty.style.display="none"; sugBlock.style.display="";
    renderChecklist(ulSug,lastSug);
    btnAddSug.disabled = lastSug.length===0;
  });
  btnAddSug && btnAddSug.addEventListener("click", function(){
    var picks = selectedFrom(ulSug, lastSug);
    if(!picks.length) return;
    spin(true);
    upsertCart(CURRENT_USER, picks).then(refreshCart).finally(function(){spin(false)});
  });

  // ---- Cart ----
  var cartList=$("#cart-items"), totalLbl=$("#checkout-total"), btnOpt=$("#btn-opt"), savings=$("#savings");
  function fakePrice(it){ return ((String((it&&it.name)||"").length%3)+1) }
  function refreshCart(){
    if(!cartList) return Promise.resolve();
    return exportByUserIfExists(CURRENT_USER).then(function(cart){
      cartList.innerHTML="";
      if(!cart || !Array.isArray(cart.items)) { totalLbl.textContent="0.00"; return; }
      var total=0;
      for(var i=0;i<cart.items.length;i++){
        var it=cart.items[i], p=fakePrice(it); total+=p;
        cartList.appendChild(
          el("li",null,
            el("label",null,
              el("input",{type:"checkbox",checked:true,dataset:{idx:String(i)}}),
              " ",
              fmtItem(it),"  $",p.toFixed(2)
            )
          )
        );
      }
      totalLbl.textContent = total.toFixed(2);
      savings.textContent="";
    });
  }
  btnOpt && btnOpt.addEventListener("click", function(){
    exportByUserIfExists(CURRENT_USER).then(function(cart){
      if(!cart||!Array.isArray(cart.items)||!cart.items.length) return;
      var boxes=cartList.querySelectorAll('input[type="checkbox"]:checked'), pick=[];
      for(var i=0;i<boxes.length;i++){var n=Number(boxes[i].dataset.idx||"-1"); if(n>=0) pick.push(cart.items[n]);}
      if(!pick.length) return;
      spin(true);
      mergeSources(CURRENT_USER,[pick]).then(refreshCart).finally(function(){spin(false)});
    });
  });

  // ---- boot: show nothing loaded; cart only if exists ----
  refreshCart();
})();
