// ===== Global state =====
const state = {
  plan: [],       // [{ title, servings, diet, steps:[], items:[{name,quantity,unit,notes, price, choice}] }]
  merged: [],     // merged items
  totals: { subtotal: 0, savings: 0, serviceFee: 0, total: 0 },
  serviceFeeRate: 0.05,
  serviceFeeMin: 1.99,
};

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const showSpinner = (on) => { $("globalSpinner").style.display = on ? "inline-flex" : "none"; };
const fmt = (n) => `$${(n || 0).toFixed(2)}`;
const nonEmpty = (s) => s && String(s).trim().length > 0;

// Defensive: ensure all expected elements exist (avoids null errors)
[
  "titleInput","servingsInput","dietSelect","excludesInput","importUrlInput","audioFileInput",
  "suggestAddBtn","importUrlBtn","uploadAudioBtn","clearPlanBtn","savePlanBtn","loadPlanBtn","previewBtn","printBtn",
  "planChips","ingredientsBody","summaryText",
  "feeSubtotal","feeSavings","feeService","feeTotal","checkoutBtn","checkoutMsg",
  "emailToInput","emailNoteInput","emailBtn","emailMsg","previewModal","previewJson","closePreviewBtn","printContainer",
  "healthDot","healthText"
].forEach(id => { if(!$(id)){ const phantom = document.createElement("div"); phantom.id=id; phantom.style.display="none"; document.body.appendChild(phantom); } });

// ===== Health check =====
async function health(){
  try{
    const res = await fetch("/health");
    const d = await res.json();
    $("healthDot").className = "dot " + (d.ok && d.hasKey ? "ok" : "warn");
    $("healthText").textContent = d.ok ? (d.hasKey ? "connected" : "no API key") : "backend error";
  }catch{
    $("healthDot").className = "dot err";
    $("healthText").textContent = "offline";
  }
}
health();

// ===== Merging, totals, rendering =====
function rebuildMerged(){
  // merge by (name+unit+notes) simple
  const map = new Map();
  state.plan.forEach(r => {
    (r.items||[]).forEach(it => {
      const key = `${(it.name||"").toLowerCase()}|${it.unit||""}|${it.notes||""}`;
      const cur = map.get(key) || {name:it.name, quantity:0, unit:it.unit, notes:it.notes||"", basePrice:it.price||0, choice: it.choice||"default"};
      cur.quantity += Number(it.quantity||0);
      if(!cur.basePrice && it.price) cur.basePrice = it.price;
      map.set(key, cur);
    });
  });
  state.merged = Array.from(map.values());
  computeTotals();
  renderPlanChips();
  renderItems();
}

function computeTotals(){
  let subtotal=0, savings=0;
  state.merged.forEach(it=>{
    const base = Number(it.basePrice||0);
    const best = Number(it.bestPrice||0);
    const chosen = (it.choice==="opt") ? (best||base) : base;
    subtotal += chosen * (Number.isFinite(it.quantity)? it.quantity : 1);
    if(best && base && best < base){
      savings += (base-best) * (Number.isFinite(it.quantity)? it.quantity : 1);
    }
  });
  const fee = Math.max(subtotal*state.serviceFeeRate, state.serviceFeeMin);
  state.totals = {
    subtotal, savings, serviceFee: fee, total: Math.max(subtotal - savings, 0) + fee
  };
  updateFeeSummary();
}

function updateFeeSummary(){
  $("feeSubtotal").textContent = fmt(state.totals.subtotal);
  $("feeSavings").textContent = fmt(state.totals.savings);
  $("feeService").textContent = fmt(state.totals.serviceFee);
  $("feeTotal").textContent = fmt(state.totals.total);
  $("summaryText").textContent = `Items: ${state.merged.length} • Subtotal ${fmt(state.totals.subtotal)} • Savings ${fmt(state.totals.savings)}`;
}

function renderPlanChips(){
  const c = $("planChips"); c.innerHTML = "";
  state.plan.forEach((r)=>{
    const el = document.createElement("span");
    el.className = "chip";
    el.textContent = `${r.title} (${r.servings})`;
    el.title = r.diet ? `Diet: ${r.diet}` : "";
    c.appendChild(el);
  });
}

function renderItems(){
  const tbody = $("ingredientsBody"); tbody.innerHTML = "";
  state.merged.forEach((it, idx)=>{
    const tr = document.createElement("tr");

    const affordable = (it.bestLabel && it.bestPrice) ? `${fmt(it.bestPrice)} • ${it.bestLabel}` : "—";
    const rowMode = document.createElement("td");
    rowMode.innerHTML = `
      <label><input type="radio" name="rowmode_${idx}" value="default"${it.choice!=="opt"?" checked":""}/> Use default</label><br/>
      <label><input type="radio" name="rowmode_${idx}" value="opt"${it.choice==="opt"?" checked":""}/> Most affordable</label>
    `;

    const actions = document.createElement("td");
    actions.innerHTML = `
      <div class="row" style="gap:6px;flex-wrap:nowrap">
        <button class="btn small" data-act="opt" data-idx="${idx}">Optimize row</button>
        <button class="btn small outline" data-act="def" data-idx="${idx}">Use default</button>
        <button class="btn small outline" data-act="rm" data-idx="${idx}">Remove</button>
      </div>
    `;

    tr.innerHTML = `
      <td>${it.name||""}</td>
      <td>${Number(it.quantity||0)}</td>
      <td>${it.unit||""}</td>
      <td>${it.notes||""}</td>
    `;
    tr.appendChild(rowMode);
    const choiceTD = document.createElement("td");
    choiceTD.textContent = affordable;
    tr.appendChild(choiceTD);
    tr.appendChild(actions);
    tbody.appendChild(tr);

    // wire radios
    rowMode.querySelectorAll("input[type=radio]").forEach(r=>{
      r.addEventListener("change", ()=>{
        it.choice = r.value==="opt" ? "opt" : "default";
        computeTotals();
      });
    });
  });

  // row action buttons
  tbody.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;
      const it = state.merged[idx];
      if(!it) return;
      if(act==="rm"){
        state.merged.splice(idx,1);
      }else if(act==="def"){
        it.choice = "default";
      }else if(act==="opt"){
        await optimizeRow(it);
        it.choice = "opt";
      }
      computeTotals();
      renderItems();
    });
  });
}

// ===== API calls =====
async function suggest(title, servings, diet, excludes){
  const body = { title, servings, diet, excludes };
  const res = await fetch("/ingredients/suggest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok) throw new Error("Server error in suggest");
  return await res.json(); // {title,servings,items:[{...}], steps?:[]}
}

async function importFromUrl(url){
  const res = await fetch("/import/recipe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
  if(!res.ok) throw new Error("Import failed");
  return await res.json(); // {title,servings,items,steps}
}

async function uploadAudio(file){
  const fd = new FormData();
  fd.append("audio", file);
  const res = await fetch("/import/audio",{method:"POST",body:fd});
  if(!res.ok) throw new Error("Audio import failed");
  return await res.json();
}

async function optimizeRow(it){
  try{
    const res = await fetch("/pricing/optimize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({item:it})});
    if(res.ok){
      const d = await res.json(); // {bestPrice, bestLabel}
      it.bestPrice = d.bestPrice; it.bestLabel = d.bestLabel;
    }else{
      if(!it.basePrice) it.basePrice = 1.5;
      it.bestPrice = +(it.basePrice*0.95).toFixed(2);
      it.bestLabel = "Mock cheaper pick";
    }
  }catch{
    if(!it.basePrice) it.basePrice = 1.5;
    it.bestPrice = +(it.basePrice*0.95).toFixed(2);
    it.bestLabel = "Mock cheaper pick";
  }
}

async function optimizeAll(){
  showSpinner(true);
  try{
    const res = await fetch("/pricing/optimize-batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:state.merged})});
    if(res.ok){
      const d = await res.json(); // [{bestPrice,bestLabel}...]
      d.forEach((r,i)=>{
        state.merged[i].bestPrice = r.bestPrice;
        state.merged[i].bestLabel = r.bestLabel;
        state.merged[i].choice = "opt";
      });
    }else{
      for(const it of state.merged){ await optimizeRow(it); it.choice="opt"; }
    }
  }catch{
    for(const it of state.merged){ await optimizeRow(it); it.choice="opt"; }
  }finally{
    computeTotals(); renderItems(); showSpinner(false);
  }
}

// ===== Email & Print =====
async function sendEmailPlan(to, note){
  const subject = `Your FoodBridge plan – ${new Date().toLocaleDateString()}`;
  const body = { to, subject, note, plan:state.plan, merged:state.merged, totals:state.totals };
  const res = await fetch("/email/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!res.ok){
    const t = await res.text();
    throw new Error(t||"Email failed");
  }
  return await res.json();
}

function buildPrintableHTML(){
  const lines = [];
  lines.push(`<h1 style="margin:0 0 10px 0">FoodBridge – Full Plan</h1>`);
  lines.push(`<div style="color:#444;margin-bottom:12px">Generated ${new Date().toLocaleString()}</div>`);

  state.plan.forEach((r)=>{
    lines.push(`<div class="recipe">`);
    lines.push(`<h2 style="margin:12px 0 4px 0">${r.title} <span style="color:#666;font-weight:400">(${r.servings} servings${r.diet?`, ${r.diet}`:""})</span></h2>`);
    if(r.items?.length){
      lines.push(`<h3 style="margin:8px 0 4px 0">Ingredients</h3><ul>`);
      r.items.forEach(it=>{
        lines.push(`<li>${it.name} – ${it.quantity||""} ${it.unit||""} ${it.notes?("("+it.notes+")"):""}</li>`);
      });
      lines.push(`</ul>`);
    }
    if(r.steps?.length){
      lines.push(`<h3 style="margin:8px 0 4px 0">Instructions</h3>`);
      r.steps.forEach((s,i)=> lines.push(`<div class="step" style="margin:6px 0">${i+1}. ${s}</div>`));
    }
    lines.push(`</div>`);
  });

  lines.push(`<hr style="margin:16px 0;border:none;border-top:1px solid #ddd"/>`);
  lines.push(`<div><strong>Estimated subtotal:</strong> ${fmt(state.totals.subtotal)}</div>`);
  lines.push(`<div><strong>Estimated savings (optimization):</strong> ${fmt(state.totals.savings)}</div>`);
  lines.push(`<div><strong>Service fee:</strong> ${fmt(state.totals.serviceFee)}</div>`);
  lines.push(`<div><strong>Total due now:</strong> ${fmt(state.totals.total)}</div>`);

  return lines.join("\n");
}

function printFullPlan(){
  const html = buildPrintableHTML();
  const cont = $("printContainer");
  cont.innerHTML = html;
  cont.style.display = "block";
  window.print();
  cont.style.display = "none";
}

// ===== Button handlers =====
$("suggestAddBtn").addEventListener("click", async ()=>{
  const title = $("titleInput").value.trim();
  const servings = Number($("servingsInput").value||2);
  const diet = $("dietSelect").value;
  const excludes = $("excludesInput").value;

  if(!title){ alert("Please enter a recipe title."); return; }
  showSpinner(true);
  try{
    const data = await suggest(title, servings, diet, excludes);
    data.items = Array.isArray(data.items)? data.items : [];
    data.steps = Array.isArray(data.steps)? data.steps : (nonEmpty(data.steps)? [String(data.steps)] : []);
    state.plan.push({title:data.title||title, servings:data.servings||servings, diet, steps:data.steps, items:data.items});
    rebuildMerged();
  }catch(e){ console.error(e); alert("Suggest failed. Check the server console."); }
  finally{ showSpinner(false); }
});

$("importUrlBtn").addEventListener("click", async ()=>{
  const url = $("importUrlInput").value.trim();
  if(!url){ alert("Paste a recipe URL."); return; }
  showSpinner(true);
  try{
    const data = await importFromUrl(url);
    data.items = Array.isArray(data.items)? data.items : [];
    data.steps = Array.isArray(data.steps)? data.steps : [];
    state.plan.push({title:data.title||"Imported recipe", servings:data.servings||2, diet:"", steps:data.steps, items:data.items});
    rebuildMerged();
  }catch(e){ console.error("Import error:", e); alert("Import failed. Check the server console."); }
  finally{ showSpinner(false); }
});

$("uploadAudioBtn").addEventListener("click", async ()=>{
  const f = $("audioFileInput").files?.[0];
  if(!f){ alert("Choose an audio file first."); return; }
  showSpinner(true);
  try{
    const data = await uploadAudio(f);
    data.items = Array.isArray(data.items)? data.items : [];
    data.steps = Array.isArray(data.steps)? data.steps : [];
    state.plan.push({title:data.title||"Audio recipe", servings:data.servings||2, diet:"", steps:data.steps, items:data.items});
    rebuildMerged();
  }catch(e){ console.error("Audio import error:", e); alert("Audio import failed."); }
  finally{ showSpinner(false); }
});

$("optimizeAllBtn").addEventListener("click", optimizeAll);
$("useDefaultAllBtn").addEventListener("click", ()=>{
  state.merged.forEach(it=> it.choice="default");
  computeTotals(); renderItems();
});

$("clearPlanBtn").addEventListener("click", ()=>{
  if(!confirm("Clear current plan?")) return;
  state.plan = []; state.merged = [];
  computeTotals(); renderPlanChips(); renderItems();
});

$("savePlanBtn").addEventListener("click", ()=>{
  localStorage.setItem("fb_plan", JSON.stringify(state.plan));
  alert("Plan saved locally.");
});

$("loadPlanBtn").addEventListener("click", ()=>{
  const raw = localStorage.getItem("fb_plan");
  if(!raw){ alert("No saved plan."); return; }
  try{
    state.plan = JSON.parse(raw)||[];
  }catch{ state.plan = []; }
  rebuildMerged();
});

$("previewBtn").addEventListener("click", ()=>{
  $("previewJson").textContent = JSON.stringify({merged:state.merged, totals:state.totals}, null, 2);
  $("previewModal").style.display = "block";
});
$("closePreviewBtn").addEventListener("click", ()=> $("previewModal").style.display = "none");

$("printBtn").addEventListener("click", printFullPlan);

$("checkoutBtn").addEventListener("click", async ()=>{
  showSpinner(true);
  $("checkoutMsg").textContent = "";
  try{
    const res = await fetch("/checkout/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({totals:state.totals})});
    if(!res.ok) throw new Error("Checkout start error");
    const d = await res.json();
    $("checkoutMsg").textContent = d.message || "Checkout ready.";
  }catch(e){
    console.error(e);
    $("checkoutMsg").textContent = "Checkout error.";
  }finally{
    showSpinner(false);
  }
});

$("emailBtn").addEventListener("click", async ()=>{
  const to = $("emailToInput").value.trim();
  const note = $("emailNoteInput").value.trim();
  if(!to){ alert("Enter the recipient email."); return; }
  $("emailMsg").textContent = "";
  showSpinner(true);
  try{
    const d = await sendEmailPlan(to, note);
    $("emailMsg").textContent = d.message || "Email sent!";
  }catch(e){
    console.error(e);
    $("emailMsg").textContent = "Email failed.";
  }finally{
    showSpinner(false);
  }
});

// initial totals/UI
computeTotals(); renderPlanChips(); renderItems();
