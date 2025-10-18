(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    plan: [],
    merged: [],
    profile: {
      diet: localStorage.getItem("diet") || "",
      excludes: localStorage.getItem("excludes") || "",
      unitMode: localStorage.getItem("unitMode") || "metric",
    },
    pricing: {
      baseline: 0, optimized: 0, savings: 0, service: 0, due: 0,
      dial: Number(localStorage.getItem("savingsDial") || 60),
      region: "US-DEFAULT", multiplier: 1.0
    },
    optimizePref: JSON.parse(localStorage.getItem("optPrefs") || "{}"),
    integration: { openai: false, stripe: false, email: false, instacart: false },
  };

  function showLoader(show) {
    const el = $("loader"); if (!el) return;
    el.style.display = show ? "flex" : "none";
  }
  function toast(msg, ms = 1800) {
    const t = $("toast"); if (!t) return;
    t.textContent = msg; t.style.display = "block";
    setTimeout(() => (t.style.display = "none"), ms);
  }
  function money(n) { return Number.isFinite(n) ? `$${n.toFixed(2)}` : "$0.00"; }

  async function checkHealth() {
    try {
      const res = await fetch("/health");
      const data = await res.json();
      const dot = $("healthDot"); const txt = $("healthText");
      if (data.ok && data.hasKey) { dot.className = "dot ok"; txt.textContent = `connected :${data.port}`; }
      else if (data.ok) { dot.className = "dot warn"; txt.textContent = "no API key"; }
      else { dot.className = "dot bad"; txt.textContent = "backend error"; }
    } catch {}
  }
  async function loadStatusChip() {
    try {
      const res = await fetch("/status"); const s = await res.json();
      state.integration = s;
      $("statusChip").textContent =
        `OpenAI ${s.openai ? "✅" : "⚠️"} • Stripe ${s.stripe ? "✅" : "⚠️"} • Email ${s.email ? "✅" : "⚠️"} • Instacart ${s.instacart ? "✅" : "🔜"}`;
    } catch { $("statusChip").textContent = "Status unavailable"; }
  }

  const CONVERT = {
    toUS: (qty, unit) => {
      const u = String(unit).toLowerCase();
      if (u === "g") return { qty: qty / 28.3495, unit: "oz" };
      if (u === "ml") return { qty: qty / 240, unit: "cup" };
      if (["tsp","tbsp","cup","piece"].includes(u)) return { qty, unit };
      return { qty, unit };
    },
    toMetric: (qty, unit) => {
      const u = String(unit).toLowerCase();
      if (u === "oz") return { qty: qty * 28.3495, unit: "g" };
      if (u === "cup") return { qty: qty * 240, unit: "ml" };
      if (["tsp","tbsp","piece","g","ml"].includes(u)) return { qty, unit };
      return { qty, unit };
    },
  };
  function applyUnitModeToMerged() {
    const mode = state.profile.unitMode;
    state.merged = state.merged.map((row) => {
      const convert = mode === "us" ? CONVERT.toUS : CONVERT.toMetric;
      const out = convert(row.quantity, row.unit);
      return { ...row, quantity: Math.round(out.qty * 100) / 100, unit: out.unit };
    });
  }

  async function fetchRegion() {
    try {
      const res = await fetch("/geo");
      const g = await res.json();
      if (g?.region && Number.isFinite(Number(g.multiplier))) {
        state.pricing.region = g.region; state.pricing.multiplier = Number(g.multiplier);
        return true;
      }
    } catch {}
    return false;
  }

  function summarizePricing() {
    const base = state.merged.reduce((s,r)=> s + Number(r.basePrice || 0), 0);
    const opt = state.merged.reduce((s,r)=> s + Number((r.mode==="opt" ? r.optPrice : r.basePrice) || 0), 0);
    const savings = Math.max(0, base - opt);
    const service = Math.max(Number(window.SERVICE_MIN || 1.99), Number(window.SERVICE_RATE || 0.05) * opt);
    const due = opt + service;
    state.pricing = { ...state.pricing, baseline: base, optimized: opt, savings, service, due };

    $("sumBaseline").textContent = money(base);
    $("sumOptimized").textContent = money(opt);
    $("sumSavings").textContent = money(savings);
    $("sumDue").textContent = money(due);

    $("feeBaseline").textContent = money(base);
    $("feeOptimized").textContent = money(opt);
    $("feeSavings").textContent = money(savings);
    $("feeService").textContent = money(service);
    $("feeTotal").textContent = money(due);

    $("summaryText").textContent = `Baseline ${money(base)} • Optimized ${money(opt)} • You save ${money(savings)}`;
  }

  async function estimateRowPrice(row, regionOverride) {
    try {
      const res = await fetch("/price/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, quantity: row.quantity, unit: row.unit, region: regionOverride }),
      });
      const data = await res.json().catch(()=>({}));
      const basePrice = Number(data.price || 0);
      const dial = state.pricing.dial;
      const factor = 1 - Math.min(0.35, dial / 300);
      const optPrice = Math.max(0, basePrice * factor);
      return {
        basePrice,
        optPrice,
        optChoice: basePrice ? { label: "Most affordable", price: optPrice } : null,
      };
    } catch {
      return { basePrice: 1.0, optPrice: 0.9, optChoice: { label: "Most affordable", price: 0.9 } };
    }
  }

  async function refineAllPricesWithRegion() {
    let changed = false;
    for (let r of state.merged) {
      const p = await estimateRowPrice(r, state.pricing.region);
      if (Math.abs((p.basePrice||0) - (r.basePrice||0)) >= 0.25) changed = true;
      r.basePrice = p.basePrice; r.optPrice = p.optPrice; r.optChoice = p.optChoice;
    }
    if (changed) { renderMergedTable(); summarizePricing(); }
  }

  function mergePlanItems() {
    const map = new Map();
    for (const r of state.plan) {
      for (const it of r.items) {
        const key = `${it.name.toLowerCase()}|${it.unit.toLowerCase()}`;
        const prev = map.get(key) || {
          name: it.name, unit: it.unit, notes: it.notes || "",
          quantity: 0, basePrice: 0, optPrice: 0, optChoice: null,
          mode: state.optimizePref[it.name.toLowerCase()] || "default",
        };
        prev.quantity += Number(it.quantity || 0);
        map.set(key, prev);
      }
    }
    state.merged = Array.from(map.values());
  }
  async function priceAllRows(initialRegion) {
    for (let r of state.merged) {
      const p = await estimateRowPrice(r, initialRegion);
      r.basePrice = p.basePrice; r.optPrice = p.optPrice; r.optChoice = p.optChoice;
    }
  }

  function renderPlanChips() {
    const chips = $("planChips"); if (!chips) return;
    chips.innerHTML = "";
    state.plan.forEach((p) => {
      const span = document.createElement("span");
      span.className = "chip";
      span.textContent = `${p.title} • ${p.servings} servings`;
      chips.appendChild(span);
    });
  }
  function renderPlanCards() {
    const box = $("planCards"); if (!box) return;
    box.innerHTML = "";
    state.plan.forEach((p) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h3 style="margin:0 0 6px">${p.title}</h3>
        <div class="muted" style="margin-bottom:8px">${p.servings} servings</div>
        <div class="muted" style="margin-bottom:6px">Steps</div>
        <ol style="margin:0 0 8px 18px">
          ${(p.steps || []).slice(0,3).map(s=>`<li>${s}</li>`).join("")}
        </ol>
        ${(p.steps || []).length>3 ? '<div class="muted">…and more</div>' : ""}
      `;
      box.appendChild(card);
    });
  }
  function renderMergedTable() {
    const tbody = $("ingredientsBody"); if (!tbody) return;
    tbody.innerHTML = "";
    state.merged.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td contenteditable="true" data-field="name">${row.name}</td>
        <td contenteditable="true" data-field="quantity">${row.quantity}</td>
        <td contenteditable="true" data-field="unit">${row.unit}</td>
        <td contenteditable="true" data-field="notes">${row.notes || ""}</td>
        <td>
          <select data-field="mode">
            <option value="default" ${row.mode==="default"?"selected":""}>Use default</option>
            <option value="opt" ${row.mode==="opt"?"selected":""}>Most affordable per item</option>
          </select>
        </td>
        <td>${row.mode==="opt" && row.optChoice ? `${row.optChoice.label} • ${money(row.optPrice)}` : (row.basePrice? "—": "—")}</td>
        <td>
          <button data-action="opt" data-idx="${idx}">Optimize row</button>
          <button data-action="remove" data-idx="${idx}">Remove</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  function summarizeAndRender() { renderMergedTable(); summarizePricing(); }
  async function rebuildMerged() {
    mergePlanItems();
    const modeSel = $("unitToggle"); if (modeSel) state.profile.unitMode = modeSel.value;
    applyUnitModeToMerged();
    await priceAllRows();        // quick default prices
    summarizeAndRender();
    refineAllPricesWithRegion(); // silent refinement
  }

  async function suggestAndAddToPlan() {
    const title = $("titleInput").value.trim();
    const servings = Number($("servingsInput").value || 2);
    const diet = $("dietSelect").value;
    const excludes = $("excludesInput").value;
    if (!title) return toast("Please enter a recipe title");

    showLoader(true);
    const btn = $("suggestAddBtn"); btn.disabled = true;
    try {
      const res = await fetch("/ingredients/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, servings, diet, excludes }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      state.plan.push({
        title: data.title || title,
        servings: Number(data.servings || servings),
        steps: Array.isArray(data.steps) ? data.steps : [],
        items: data.items || [],
      });
      renderPlanChips();
      renderPlanCards();
      await rebuildMerged();
      toast("Added to plan");
    } catch (e) {
      console.error(e);
      toast("Suggest failed. Check the server console.");
    } finally {
      showLoader(false);
      btn.disabled = false;
    }
  }
  async function importAndAdd() {
    const url = $("importUrl").value.trim();
    if (!url) return toast("Paste a recipe URL first");

    showLoader(true);
    const btn = $("importBtn"); btn.disabled = true;
    try {
      const res = await fetch("/import/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      state.plan.push({
        title: data.title || "Imported Recipe",
        servings: Number(data.servings || 2),
        steps: Array.isArray(data.steps) ? data.steps : [],
        items: data.items || [],
      });
      renderPlanChips();
      renderPlanCards();
      await rebuildMerged();
      toast("Imported and added");
    } catch (e) {
      console.error("Import error:", e);
      toast("Import failed (some socials block scraping). Paste blog URLs for best results.");
    } finally {
      showLoader(false);
      btn.disabled = false;
    }
  }
  function clearPlan() {
    state.plan = []; state.merged = [];
    renderPlanChips(); renderPlanCards(); renderMergedTable(); summarizePricing();
    toast("Plan cleared");
  }
  function savePlan() {
    localStorage.setItem("plan", JSON.stringify(state.plan));
    localStorage.setItem("diet", $("dietSelect").value);
    localStorage.setItem("excludes", $("excludesInput").value);
    localStorage.setItem("unitMode", $("unitToggle").value);
    localStorage.setItem("savingsDial", String(state.pricing.dial));
    localStorage.setItem("optPrefs", JSON.stringify(state.optimizePref));
    toast("Saved");
  }
  async function loadPlan() {
    const p = JSON.parse(localStorage.getItem("plan") || "[]");
    state.plan = Array.isArray(p) ? p : [];
    $("dietSelect").value = localStorage.getItem("diet") || "";
    $("excludesInput").value = localStorage.getItem("excludes") || "";
    $("unitToggle").value = localStorage.getItem("unitMode") || "metric";
    state.pricing.dial = Number(localStorage.getItem("savingsDial") || 60);
    $("savingsDial").value = String(state.pricing.dial);
    updateDialLabel();
    renderPlanChips(); renderPlanCards();
    await rebuildMerged();
    toast("Loaded plan");
  }
  async function optimizeAll() {
    state.merged.forEach((r) => {
      r.mode = "opt"; state.optimizePref[r.name.toLowerCase()] = "opt";
    });
    localStorage.setItem("optPrefs", JSON.stringify(state.optimizePref));
    summarizeAndRender(); toast("Optimized all");
  }
  async function useDefaultAll() {
    state.merged.forEach((r) => {
      r.mode = "default"; state.optimizePref[r.name.toLowerCase()] = "default";
    });
    localStorage.setItem("optPrefs", JSON.stringify(state.optimizePref));
    summarizeAndRender(); toast("Using defaults for all");
  }

  $("ingredientsBody").addEventListener("input", (e) => {
    const td = e.target.closest("td[contenteditable], select[data-field='mode']"); if (!td) return;
    const tr = td.closest("tr"); const idx = Array.from(tr.parentNode.children).indexOf(tr);
    const field = td.dataset.field; if (field === "mode") return;
    const val = td.textContent.trim(); const row = state.merged[idx];
    if (field === "quantity") row.quantity = Number(val || 0);
    else row[field] = val;
  });
  $("ingredientsBody").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-field='mode']"); if (!sel) return;
    const tr = sel.closest("tr"); const idx = Array.from(tr.parentNode.children).indexOf(tr);
    const row = state.merged[idx];
    row.mode = sel.value; state.optimizePref[row.name.toLowerCase()] = sel.value;
    localStorage.setItem("optPrefs", JSON.stringify(state.optimizePref));
    summarizeAndRender();
  });
  $("ingredientsBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]"); if (!btn) return;
    const idx = Number(btn.dataset.idx); const action = btn.dataset.action;
    if (action === "remove") { state.merged.splice(idx, 1); summarizeAndRender(); }
    else if (action === "opt") {
      state.merged[idx].mode = "opt";
      state.optimizePref[state.merged[idx].name.toLowerCase()] = "opt";
      localStorage.setItem("optPrefs", JSON.stringify(state.optimizePref));
      summarizeAndRender();
    }
  });

  $("previewBtn").addEventListener("click", () => {
    const modal = $("previewModal"); const pre = $("previewJson");
    const payload = { plan: state.plan, merged: state.merged, pricing: state.pricing, unitMode: state.profile.unitMode };
    pre.textContent = JSON.stringify(payload, null, 2); modal.style.display = "block";
  });
  $("closePreviewBtn").addEventListener("click", () => { $("previewModal").style.display = "none"; });

  $("checkoutBtn").addEventListener("click", async () => {
    const btn = $("checkoutBtn"); btn.disabled = true; btn.textContent = "Starting checkout…";
    $("checkoutMsg").textContent = "";
    try {
      const res = await fetch("/checkout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: state.pricing.service }),
      });
      const data = await res.json();
      if (!data.url) throw new Error("Checkout start error");
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      $("checkoutMsg").textContent = "Checkout error: Checkout start error";
      toast("Checkout error");
    } finally { btn.disabled = false; btn.textContent = "Charge service fee & continue"; }
  });

  $("emailBtn").addEventListener("click", async () => {
    const to = $("emailTo").value.trim();
    const note = $("emailNote").value.trim();
    if (!to) return toast("Enter recipient email");

    const recipeCount = state.plan.length;
    const subject = `Your FoodBridge plan – ${recipeCount} recipe${recipeCount===1?"":"s"} • ${money(state.pricing.savings)} saved`;
    const preheader = `Savings ${money(state.pricing.savings)} • Optimized ${money(state.pricing.optimized)} • Due now ${money(state.pricing.due)}`;
    const companyMsg = `
      <p style="margin:0 0 10px;color:#94a3b8">
        Thanks for using <strong>FoodBridge</strong>. We optimize your grocery list for value while keeping your preferences in mind.
        Cook with confidence—less guesswork, more good meals. ${note ? `<em>Note from you: ${note}</em>` : ""}
      </p>
    `;
    const stepsHTML = state.plan.map(p => `
      <div style="margin:16px 0;padding:12px;border-radius:12px;background:#0f172a;border:1px solid #22385f">
        <h3 style="margin:0 0 6px;color:#e6edf6">${p.title} <span style="color:#94a3b8">• ${p.servings} servings</span></h3>
        <h4 style="margin:8px 0 6px;color:#9fb0c8">Ingredients</h4>
        <ul style="margin:0 0 8px 20px;color:#cfe1ff">
          ${(p.items||[]).map(it=>`<li>${it.name} — ${it.quantity}${it.unit} ${it.notes?`(${it.notes})`:""}</li>`).join("")}
        </ul>
        <h4 style="margin:8px 0 6px;color:#9fb0c8">How to make it</h4>
        <ol style="margin:0 0 4px 20px;color:#cfe1ff">
          ${(p.steps||[]).map(s=>`<li>${s}</li>`).join("")}
        </ol>
      </div>
    `).join("");
    const savingsBlock = `
      <div style="margin:16px 0;padding:12px;border-radius:12px;background:#0f172a;border:1px solid #22385f">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#9fb0c8">
          <span>Baseline (est.)</span><strong style="color:#e6edf6">${money(state.pricing.baseline)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#9fb0c8">
          <span>Optimized (est.)</span><strong style="color:#e6edf6">${money(state.pricing.optimized)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#9fb0c8">
          <span>Estimated savings</span><strong style="color:#22c55e">${money(state.pricing.savings)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;color:#9fb0c8">
          <span>Service fee</span><strong style="color:#e6edf6">${money(state.pricing.service)}</strong>
        </div>
      </div>
    `;
    const html = `
      <div style="display:none;max-height:0;overflow:hidden">${preheader}</div>
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;background:#0b1220;color:#e6edf6;padding:20px">
        <h2 style="margin:0 0 10px">Your FoodBridge plan</h2>
        ${companyMsg}
        ${savingsBlock}
        <h3 style="margin:16px 0 6px;color:#9fb0c8">Recipes</h3>
        ${stepsHTML}
        <p style="margin-top:16px;color:#94a3b8">Questions? Reply to this email and we’ll help.</p>
      </div>
    `;
    try {
      const res = await fetch("/email/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, html }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast("Email sent");
    } catch (e) { console.error(e); toast("Email failed. Check SMTP in .env"); }
  });

  $("printBtn").addEventListener("click", () => {
    const root = $("printRoot");
    root.innerHTML = `
      <h2 style="margin:0 0 6px">FoodBridge – Current Plan</h2>
      <div style="color:#666;margin-bottom:10px">Baseline ${money(state.pricing.baseline)} • Optimized ${money(state.pricing.optimized)} • Savings ${money(state.pricing.savings)}</div>
      ${state.plan.map(p => `
        <div class="card" style="margin-bottom:12px">
          <h3 style="margin:0 0 4px">${p.title}</h3>
          <div style="color:#555;margin-bottom:8px">${p.servings} servings</div>
          <h4 style="margin:6px 0 4px">Ingredients</h4>
          <ul style="margin:0 0 8px 18px">
            ${(p.items||[]).map(it=>`<li style="break-inside:avoid">${it.name} — ${it.quantity}${it.unit} ${it.notes?`(${it.notes})`:""}</li>`).join("")}
          </ul>
          <h4 style="margin:6px 0 4px">How to make it</h4>
          <ol style="margin:0 0 8px 18px">
            ${(p.steps||[]).map(s=>`<li style="break-inside:avoid">${s}</li>`).join("")}
          </ol>
        </div>
      `).join("")}
    `;
    requestAnimationFrame(() => window.print());
  });

  $("presetBudget").addEventListener("click", () => {
    $("dietSelect").value = "";
    $("servingsInput").value = "4";
    $("excludesInput").value = "salt, pepper, sugar, flour, rice, olive oil";
    toast("Preset applied: Budget week");
  });
  $("presetLowSodium").addEventListener("click", () => {
    $("dietSelect").value = "low sodium";
    $("servingsInput").value = "2";
    $("excludesInput").value = "salt, soy sauce, canned soup";
    toast("Preset applied: Low-sodium");
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); savePlan(); }
    if (e.key === "Enter" && document.activeElement === $("titleInput")) { suggestAndAddToPlan(); }
  });

  function updateDialLabel() {
    const v = state.pricing.dial;
    $("savingsDialLabel").textContent = v <= 25 ? "Premium" : (v >= 80 ? "Best value" : "Balanced");
  }
  $("savingsDial").addEventListener("input", async (e) => {
    state.pricing.dial = Number(e.target.value);
    localStorage.setItem("savingsDial", String(state.pricing.dial));
    await rebuildMerged();
  });

  $("unitToggle").addEventListener("change", async (e) => {
    state.profile.unitMode = e.target.value;
    localStorage.setItem("unitMode", state.profile.unitMode);
    await rebuildMerged();
  });

  $("suggestAddBtn").addEventListener("click", suggestAndAddToPlan);
  $("importBtn").addEventListener("click", importAndAdd);
  $("clearPlanBtn").addEventListener("click", clearPlan);
  $("savePlanBtn").addEventListener("click", savePlan);
  $("loadPlanBtn").addEventListener("click", loadPlan);
  $("optimizeAllBtn").addEventListener("click", optimizeAll);
  $("useDefaultAllBtn").addEventListener("click", useDefaultAll);

  (async function init() {
    $("dietSelect").value = state.profile.diet;
    $("excludesInput").value = state.profile.excludes;
    $("unitToggle").value = state.profile.unitMode;
    $("savingsDial").value = String(state.pricing.dial);
    updateDialLabel();

    await checkHealth();
    await loadStatusChip();

    fetchRegion().then((ok) => { if (ok) refineAllPricesWithRegion(); });

    if (localStorage.getItem("plan")) { await loadPlan(); }
  })();
})();
