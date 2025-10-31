/* docs/fb.js — full frontend script wired to your HTML IDs (no [object Object], selectable adds, merge/optimize) */

/* =========================
   Config Resolution
   ========================= */
(function () {
  // Accept FB_CFG, FB_CONFIG, or legacy globals set by docs/config.js
  var CFG = window.FB_CFG || window.FB_CONFIG || {};
  var API =
    CFG.apiBase ||
    CFG.API_BASE ||
    window.__FB_API_BASE__ ||
    "https://foodbridge-server-rv0a.onrender.com";

  // Expose for console debugging if needed
  window.FB_API_BASE = API;

  /* =========================
     Small DOM helpers
     ========================= */
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var el = function (tag, props) {
    var n = document.createElement(tag || "div");
    if (props) {
      for (var k in props) {
        if (k === "dataset") {
          var ds = props[k];
          for (var dk in ds) n.dataset[dk] = ds[dk];
        } else {
          n[k] = props[k];
        }
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) continue;
      if (typeof kid === "string") n.appendChild(document.createTextNode(kid));
      else n.appendChild(kid);
    }
    return n;
  };

  var CURRENT_USER = "christian";

  function fmtItem(i) {
    var name = (i && (i.name || i.title)) ? (i.name || i.title) : "Untitled";
    var qty = i && i.qty ? String(i.qty) : "";
    var unit = i && i.unit ? String(i.unit) : "";
    var s = name;
    if (qty) s += " " + qty;
    if (unit) s += " " + unit;
    return s;
  }

  function showSpinner(on) {
    var sp = $("#spinner");
    if (!sp) return;
    sp.style.display = on ? "flex" : "none";
  }

  /* =========================
     Elements (match your HTML)
     ========================= */
  var inpDish = $("#dish");
  var selDiet = $("#diet");
  var btnDish = $("#btnDish");

  var dishTitle = $("#dishTitle");
  var dishMeta = $("#dishMeta");
  var dishIngredients = $("#dishIngredients");
  var dishSteps = $("#dishSteps");
  var btnAddIngredients = $("#btnAddIngredients");

  var inpUrl = $("#txt-url");
  var btnIngestUrl = $("#btn-ingest-url");
  var urlTitle = $("#urlTitle");
  var urlMeta = $("#urlMeta");
  var urlIngredients = $("#urlIngredients");
  var urlSteps = $("#urlSteps");
  var btnAddIngredientsUrl = $("#btnAddIngredientsUrl");

  var inpSuggest = $("#q");
  var btnSuggest = $("#btn-suggest");
  var ulSuggest = $("#suggestions");

  var cartList = $("#cart-items");
  var btnOptimizeAll = $("#btn-opt-all");
  var spanTotal = $("#checkout-total");
  var savingsBox = $("#savings");

  /* =========================
     API helpers
     ========================= */
  function postJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  function getJSON(url) {
    return fetch(url, { method: "GET" }).then(function (r) { return r.json(); });
  }

  // Back-end endpoints used by this UI:
  // POST  /api/ingest/llm             { dish, diet } -> { ok, recipe }
  // POST  /api/cart/upsert            { userId, items } -> { ok, cart }
  // POST  /api/cart/merge             { userId, sources:[{items:[]},...] } -> { ok, cart }
  // GET   /api/cart/export.json?userId=...          -> { ok, cart }

  function upsertCart(userId, items) {
    return postJSON(API + "/api/cart/upsert", { userId: String(userId), items: items || [] })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error ? j.error : "upsert_failed");
        return j.cart;
      });
  }

  function mergeSources(userId, arrays) {
    var sources = (arrays || []).map(function (items) { return { items: items || [] }; });
    return postJSON(API + "/api/cart/merge", { userId: String(userId), sources: sources })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error ? j.error : "merge_failed");
        return j.cart;
      });
  }

  function exportByUser(userId) {
    return getJSON(API + "/api/cart/export.json?userId=" + encodeURIComponent(String(userId)))
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error ? j.error : "export_failed");
        return j.cart;
      });
  }

  /* =========================
     AI Recipe (Dish + Diet)
     ========================= */
  var lastDishRecipe = { title: "", ingredients: [], steps: [] };

  function renderRecipe(intoTitleEl, intoMetaEl, intoIngrEl, intoStepsEl, recipe, addBtn) {
    if (intoTitleEl) intoTitleEl.textContent = recipe && recipe.title ? recipe.title : "";
    if (intoMetaEl) intoMetaEl.textContent = (recipe && recipe.diet) ? ("Diet: " + recipe.diet) : "";
    if (intoIngrEl) {
      intoIngrEl.innerHTML = "";
      var list = recipe && recipe.ingredients ? recipe.ingredients : [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        // each ingredient line -> checkbox + label
        var li = el("li", null,
          el("label", null,
            el("input", { type: "checkbox", checked: true, dataset: { idx: String(i) } }),
            " ",
            fmtItem(typeof it === "string" ? { name: it, qty: 1, unit: "" } : it)
          )
        );
        intoIngrEl.appendChild(li);
      }
    }
    if (intoStepsEl) {
      intoStepsEl.innerHTML = "";
      var steps = recipe && recipe.steps ? recipe.steps : [];
      for (var s = 0; s < steps.length; s++) {
        intoStepsEl.appendChild(el("li", { textContent: String(steps[s]) }));
      }
    }
    if (addBtn) addBtn.disabled = !(recipe && recipe.ingredients && recipe.ingredients.length > 0);
  }

  function normalizeIngrArray(arr) {
    var out = [];
    var list = Array.isArray(arr) ? arr : [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (typeof it === "string") out.push({ name: it, qty: 1, unit: "" });
      else if (it && typeof it === "object") {
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

  function selectedFromList(ul, backingList) {
    var picks = [];
    if (!ul) return picks;
    var boxes = ul.querySelectorAll("input[type=checkbox]:checked");
    for (var i = 0; i < boxes.length; i++) {
      var idx = Number(boxes[i].dataset.idx || "-1");
      if (!isFinite(idx) || idx < 0) continue;
      var raw = backingList[idx];
      if (!raw) continue;
      if (typeof raw === "string") picks.push({ name: raw, qty: 1, unit: "" });
      else picks.push(raw);
    }
    return normalizeIngrArray(picks);
  }

  function genDishRecipe() {
    var dish = (inpDish && inpDish.value ? inpDish.value : "").trim();
    var diet = (selDiet && selDiet.value ? selDiet.value : "").trim();

    showSpinner(true);
    return postJSON(API + "/api/ingest/llm", { dish: dish, diet: diet })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error ? j.error : "llm_failed");
        var rec = j.recipe || {};
        lastDishRecipe = {
          title: rec.title || (dish || "Recipe"),
          diet: diet || "",
          ingredients: normalizeIngrArray(rec.ingredients || []),
          steps: Array.isArray(rec.steps) ? rec.steps : []
        };
        renderRecipe(dishTitle, dishMeta, dishIngredients, dishSteps, lastDishRecipe, btnAddIngredients);
      })
      .catch(function (e) {
        console.error(e);
        alert("Generate failed");
      })
      .finally(function () { showSpinner(false); });
  }

  if (btnDish) {
    btnDish.addEventListener("click", function () {
      genDishRecipe();
    });
  }

  if (btnAddIngredients) {
    btnAddIngredients.addEventListener("click", function () {
      var selected = selectedFromList(dishIngredients, lastDishRecipe.ingredients);
      if (!selected.length) return;
      showSpinner(true);
      upsertCart(CURRENT_USER, selected)
        .then(refreshCart)
        .catch(function (e) { console.error(e); alert("Add to cart failed"); })
        .finally(function () { showSpinner(false); });
    });
  }

  /* =========================
     URL Ingest (placeholder UI wiring)
     ========================= */
  var lastUrlRecipe = { title: "", ingredients: [], steps: [] };

  function ingestFromUrl(url) {
    // If/when you add a real backend route for URL ingest, call it here.
    // For now we’ll just echo a simple fake so the UI path stays intact.
    return Promise.resolve({
      ok: true,
      recipe: {
        title: "Imported Recipe",
        diet: "",
        ingredients: [{ name: "tomato", qty: 2, unit: "" }, { name: "onion", qty: 1, unit: "" }, { name: "olive oil", qty: 1, unit: "tbsp" }],
        steps: ["Open the URL", "Read ingredients", "Cook and enjoy"]
      }
    });
  }

  if (btnIngestUrl) {
    btnIngestUrl.addEventListener("click", function () {
      var u = (inpUrl && inpUrl.value ? inpUrl.value : "").trim();
      if (!u) return;
      showSpinner(true);
      ingestFromUrl(u)
        .then(function (j) {
          if (!j || !j.ok) throw new Error("import_failed");
          var rec = j.recipe || {};
          lastUrlRecipe = {
            title: rec.title || "Imported Recipe",
            diet: rec.diet || "",
            ingredients: normalizeIngrArray(rec.ingredients || []),
            steps: Array.isArray(rec.steps) ? rec.steps : []
          };
          renderRecipe(urlTitle, urlMeta, urlIngredients, urlSteps, lastUrlRecipe, btnAddIngredientsUrl);
        })
        .catch(function (e) { console.error(e); alert("Import failed"); })
        .finally(function () { showSpinner(false); });
    });
  }

  if (btnAddIngredientsUrl) {
    btnAddIngredientsUrl.addEventListener("click", function () {
      var selected = selectedFromList(urlIngredients, lastUrlRecipe.ingredients);
      if (!selected.length) return;
      showSpinner(true);
      upsertCart(CURRENT_USER, selected)
        .then(refreshCart)
        .catch(function (e) { console.error(e); alert("Add to cart failed"); })
        .finally(function () { showSpinner(false); });
    });
  }

  /* =========================
     Suggestions (placeholder)
     ========================= */
  if (btnSuggest) {
    btnSuggest.addEventListener("click", function () {
      var q = (inpSuggest && inpSuggest.value ? inpSuggest.value : "").trim();
      if (!q) return;
      // Fake suggestions UI
      ulSuggest.innerHTML = "";
      ulSuggest.appendChild(el("li", null, "Try: tomato (2), onion (1), olive oil (1 tbsp)"));
    });
  }

  /* =========================
     Cart rendering + optimize
     ========================= */
  function fakePrice(item) {
    var s = String((item && (item.name || item.title)) || "");
    var base = (s.length % 3) + 1; // $1..$3
    return base;
  }

  function refreshCart() {
    if (!cartList) return Promise.resolve();
    return exportByUser(CURRENT_USER)
      .then(function (cart) {
        cartList.innerHTML = "";
        var items = (cart && cart.items) ? cart.items : [];
        var total = 0;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var price = fakePrice(it);
          total += price;
          cartList.appendChild(
            el("li", { className: "cart-line" },
              el("label", null,
                el("input", { type: "checkbox", checked: true, dataset: { idx: String(i) } }),
                " ",
                fmtItem(it),
                "  $",
                price.toFixed(2)
              )
            )
          );
        }
        if (spanTotal) spanTotal.textContent = total.toFixed(2);
        if (savingsBox) savingsBox.textContent = items.length ? "" : "";
      })
      .catch(function () {
        cartList.innerHTML = "";
        if (spanTotal) spanTotal.textContent = "0.00";
      });
  }

  function mergeAllSelectedFromCart() {
    // read current cart items & keep only the ones whose checkbox is checked
    return exportByUser(CURRENT_USER)
      .then(function (cart) {
        var items = (cart && cart.items) ? cart.items : [];
        var boxes = cartList ? cartList.querySelectorAll("input[type=checkbox]:checked") : [];
        var selectedIdx = {};
        for (var i = 0; i < boxes.length; i++) {
          var n = Number(boxes[i].dataset.idx || "-1");
          if (isFinite(n) && n >= 0) selectedIdx[n] = true;
        }
        var picked = [];
        for (var j = 0; j < items.length; j++) {
          if (selectedIdx[j]) picked.push(items[j]);
        }
        if (!picked.length) return null;
        return mergeSources(CURRENT_USER, [picked]);
      });
  }

  if (btnOptimizeAll) {
    btnOptimizeAll.addEventListener("click", function () {
      showSpinner(true);
      mergeAllSelectedFromCart()
        .then(function () { return refreshCart(); })
        .finally(function () { showSpinner(false); });
    });
  }

  /* =========================
     Boot
     ========================= */
  (function boot() {
    try {
      // reflect API base in header label if present
      var apiEl = document.getElementById("apiBase");
      if (apiEl) apiEl.textContent = API;
    } catch (e) { /* no-op */ }
    // Preload a recipe so the page has content
    genDishRecipe().finally(function () { refreshCart(); });
  })();
})();
