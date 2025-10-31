// ===== FoodBridge frontend (main app) =====
// Talks to server at window.__FB_API_BASE__ (from config.js) or defaults to your Render URL.

(function () {
  // ---------- Config ----------
  const API_BASE =
    (typeof window.__FB_API_BASE__ === "string" && window.__FB_API_BASE__) ||
    (window.FB_CFG && window.FB_CFG.apiBase) ||
    "https://foodbridge-server-rv0a.onrender.com";

  const USER_ID = "christian";
  const LS_CART_ID = "fb_cart_id_v1";

  // Show API in header
  const apiBaseLabel = document.getElementById("apiBase");
  if (apiBaseLabel) apiBaseLabel.textContent = API_BASE;

  // ---------- Spinner ----------
  const spinner = document.getElementById("spinner");
  function setBusy(isBusy) {
    if (!spinner) return;
    spinner.style.display = isBusy ? "flex" : "none";
  }

  // ---------- DOM refs ----------
  const elDish = document.getElementById("dish");
  const elDiet = document.getElementById("diet");
  const btnDish = document.getElementById("btnDish");
  const dishTitle = document.getElementById("dishTitle");
  const dishMeta = document.getElementById("dishMeta");
  const dishIngredients = document.getElementById("dishIngredients");
  const dishSteps = document.getElementById("dishSteps");
  const btnAddIngredients = document.getElementById("btnAddIngredients");

  const elUrl = document.getElementById("txt-url");
  const btnIngestUrl = document.getElementById("btn-ingest-url");
  const urlTitle = document.getElementById("urlTitle");
  const urlMeta = document.getElementById("urlMeta");
  const urlIngredients = document.getElementById("urlIngredients");
  const urlSteps = document.getElementById("urlSteps");
  const btnAddIngredientsUrl = document.getElementById("btnAddIngredientsUrl");

  const elQ = document.getElementById("q");
  const btnSuggest = document.getElementById("btn-suggest");
  const suggestions = document.getElementById("suggestions");

  const cartItems = document.getElementById("cart-items");
  const checkoutTotal = document.getElementById("checkout-total");
  const btnOptimizeAll = document.getElementById("btn-opt-all");

  // Disable Optimize (no pricing yet)
  if (btnOptimizeAll) {
    btnOptimizeAll.onclick = () => alert("Optimizer coming soon (pricing not wired yet).");
    btnOptimizeAll.disabled = true;
  }

  // ---------- Utils ----------
  function dedupeTitles(items) {
    const seen = new Set();
    return items.filter((it) => {
      const k = `${it.type}:${it.title}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function api(path, opts = {}) {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      method: "GET",
      ...opts,
      headers: {
        "content-type": "application/json",
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  function getCartId() {
    return localStorage.getItem(LS_CART_ID) || null;
  }
  function setCartId(id) {
    if (id) localStorage.setItem(LS_CART_ID, id);
  }

  function normalizeItems(rawTitles) {
    return rawTitles
      .map((t) => String(t).trim())
      .filter(Boolean)
      .map((title) => ({ type: "ingredient", title }));
  }

  function renderList(el, arr) {
    el.innerHTML = "";
    if (!arr || !arr.length) return;
    const frag = document.createDocumentFragment();
    arr.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      frag.appendChild(li);
    });
    el.appendChild(frag);
  }

  function renderCart(cart) {
    cartItems.innerHTML = "";
    let total = 0;
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      checkoutTotal.textContent = "0.00";
      return;
    }
    const frag = document.createDocumentFragment();
    cart.items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.title || "(untitled)";
      frag.appendChild(li);
    });
    cartItems.appendChild(frag);
    checkoutTotal.textContent = total.toFixed(2);
  }

  async function refreshCartUI() {
    const cid = getCartId();
    if (!cid) {
      renderCart(null);
      return;
    }
    try {
      const data = await api(`/api/cart/${encodeURIComponent(cid)}`);
      renderCart(data.cart);
    } catch (_) {}
  }

  async function addToCart(ingredientTitles) {
    const items = normalizeItems(ingredientTitles);
    const existing = getCartId();

    setBusy(true);
    try {
      if (existing) {
        const data = await api(`/api/cart/${encodeURIComponent(existing)}/items`, {
          method: "POST",
          body: JSON.stringify({ userId: USER_ID, items }),
        });
        renderCart(data.cart);
      } else {
        const data = await api(`/api/cart/upsert`, {
          method: "POST",
          body: JSON.stringify({ cartId: null, userId: USER_ID, items }),
        });
        const cid = data?.cart?.id;
        if (cid) setCartId(cid);
        renderCart(data.cart);
      }
    } catch (err) {
      console.error(err);
      alert(`Add to cart failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Strong prompts (because backend is extract-only) ----------
  function buildIngredientExtractionTextForDish(dish, diet) {
    // The server returns items it can infer. Feed it a directive that *forces* ingredients.
    return [
      `Extract a realistic grocery shopping list for a home-cook version of: ${dish}.`,
      diet ? `Dietary style: ${diet}. Honor it when listing ingredients.` : "",
      `Return 8–14 specific ingredient names (short, common grocery terms) that would appear on a shopping list.`,
      `Include bases and essentials for the dish (e.g., for pizza include dough/crust, sauce, cheese, typical toppings).`,
      `Avoid utensils, cookware, brand names, and quantities. Do not include the word "steps".`,
      `Only ingredients and/or a single recipe title.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildIngredientExtractionTextForQuery(query) {
    return [
      `Suggest ingredients that pair with or are commonly used alongside: ${query}.`,
      `Return 8–12 short ingredient names suitable for a grocery list.`,
      `Prefer produce, pantry, protein, dairy/alt; avoid generic oils unless clearly central to the query.`,
      `No utensils, no brand names, no quantities.`,
    ].join("\n");
  }

  function strictRetrySuffix() {
    return [
      `IMPORTANT: If you returned no ingredients, try again and`,
      `return ONLY "ingredient" items (8–14) in plain grocery terms.`,
    ].join(" ");
  }

  // ---------- Generate (AI Recipe section) ----------
  async function onGenerate() {
    const dish = (elDish?.value || "").trim();
    const diet = (elDiet?.value || "").trim();
    if (!dish) {
      alert("Type a dish name first.");
      return;
    }

    setBusy(true);
    try {
      let text = buildIngredientExtractionTextForDish(dish, diet);
      let data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, text, sourceUrl: null }),
      });

      // If model didn’t give ingredients, retry once with strict suffix
      let ingr = (data.items || [])
        .filter((x) => x.type === "ingredient")
        .map((x) => x.title);

      if (ingr.length === 0) {
        text = buildIngredientExtractionTextForDish(dish, diet) + "\n" + strictRetrySuffix();
        data = await api(`/api/ingest/llm`, {
          method: "POST",
          body: JSON.stringify({ userId: USER_ID, text, sourceUrl: null }),
        });
        ingr = (data.items || [])
          .filter((x) => x.type === "ingredient")
          .map((x) => x.title);
      }

      const recipeItem = (data.items || []).find((x) => x.type === "recipe");
      const title = recipeItem?.title || dish;

      const deduped = dedupeTitles(
        ingr.map((t) => ({ type: "ingredient", title: t }))
      ).map((x) => x.title);

      // Lightweight generic steps (until we add a generator endpoint)
      const steps = [
        "Gather ingredients.",
        "Prep basics (chop/mince/measure).",
        "Cook main component until done.",
        "Combine and adjust seasoning.",
        "Serve.",
      ];

      dishTitle.textContent = title;
      dishMeta.textContent = diet ? `Diet: ${diet}` : "";
      renderList(dishIngredients, deduped);
      renderList(dishSteps, steps);

      btnAddIngredients.disabled = deduped.length === 0;
      btnAddIngredients.onclick = async () => {
        if (!deduped.length) return;
        await addToCart(deduped);
      };
    } catch (err) {
      console.error(err);
      alert(`Generate failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Import from URL ----------
  async function onImportUrl() {
    const u = (elUrl?.value || "").trim();
    if (!u) {
      alert("Paste a URL first.");
      return;
    }
    setBusy(true);
    try {
      // First pass tries to extract both a title and ingredients from the URL text.
      let text = [
        `Extract the recipe name and the ingredient list from this source: ${u}`,
        `Return 8–20 short grocery-style ingredient names.`,
        `No utensils, no quantities, no brands.`,
      ].join("\n");

      let data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, text, sourceUrl: u }),
      });

      let ingr = (data.items || [])
        .filter((x) => x.type === "ingredient")
        .map((x) => x.title);

      if (ingr.length === 0) {
        text += "\n" + strictRetrySuffix();
        data = await api(`/api/ingest/llm`, {
          method: "POST",
          body: JSON.stringify({ userId: USER_ID, text, sourceUrl: u }),
        });
        ingr = (data.items || [])
          .filter((x) => x.type === "ingredient")
          .map((x) => x.title);
      }

      const recipeItem = (data.items || []).find((x) => x.type === "recipe");
      const title = recipeItem?.title || "Imported Recipe";
      const deduped = dedupeTitles(
        ingr.map((t) => ({ type: "ingredient", title: t }))
      ).map((x) => x.title);

      const steps = [
        "Open the source link for full steps.",
        "Prepare ingredients as required.",
        "Cook/assemble per the source.",
        "Adjust seasoning and serve.",
      ];

      urlTitle.textContent = title;
      urlMeta.textContent = u;
      renderList(urlIngredients, deduped);
      renderList(urlSteps, steps);

      btnAddIngredientsUrl.disabled = deduped.length === 0;
      btnAddIngredientsUrl.onclick = async () => {
        if (!deduped.length) return;
        await addToCart(deduped);
      };
    } catch (err) {
      console.error(err);
      alert(`Import failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Ingredient Suggestions ----------
  async function onSuggest() {
    const q = (elQ?.value || "").trim();
    if (!q) {
      alert('Type a query (e.g., "pasta").');
      return;
    }
    setBusy(true);
    try {
      let text = buildIngredientExtractionTextForQuery(q);
      let data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, text, sourceUrl: null }),
      });

      let ingr = (data.items || [])
        .filter((x) => x.type === "ingredient")
        .map((x) => x.title);

      if (ingr.length === 0) {
        text = buildIngredientExtractionTextForQuery(q) + "\n" + strictRetrySuffix();
        data = await api(`/api/ingest/llm`, {
          method: "POST",
          body: JSON.stringify({ userId: USER_ID, text, sourceUrl: null }),
        });
        ingr = (data.items || [])
          .filter((x) => x.type === "ingredient")
          .map((x) => x.title);
      }

      const deduped = dedupeTitles(
        ingr.map((t) => ({ type: "ingredient", title: t }))
      ).map((x) => x.title);

      // Render suggestions with +Add
      suggestions.innerHTML = "";
      if (!deduped.length) {
        const li = document.createElement("li");
        li.textContent = "No suggestions.";
        suggestions.appendChild(li);
      } else {
        deduped.forEach((name) => {
          const li = document.createElement("li");
          li.textContent = name;

          const btn = document.createElement("button");
          btn.className = "btn";
          btn.style.marginLeft = "8px";
          btn.textContent = "+ Add";
          btn.onclick = async () => {
            await addToCart([name]);
          };

          li.appendChild(btn);
          suggestions.appendChild(li);
        });
      }
    } catch (err) {
      console.error(err);
      alert(`Suggest failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Email / Print ----------
  const btnPrint = document.getElementById("btn-print");
  if (btnPrint) {
    btnPrint.onclick = () => window.print();
  }
  const btnEmail = document.getElementById("btn-email");
  if (btnEmail) {
    btnEmail.onclick = async () => {
      const cid = getCartId();
      if (!cid) return alert("No cart yet.");
      try {
        setBusy(true);
        const to = prompt("Send cart to which email?");
        if (!to) return;
        await api(`/api/cart/${encodeURIComponent(cid)}/email-summary`, {
          method: "POST",
          body: JSON.stringify({ to, subject: "Your FoodBridge Cart" }),
        });
        alert("Email sent.");
      } catch (err) {
        console.error(err);
        alert(`Email failed: ${err.message || err}`);
      } finally {
        setBusy(false);
      }
    };
  }

  // ---------- Hook up events ----------
  if (btnDish) btnDish.addEventListener("click", onGenerate);
  if (btnIngestUrl) btnIngestUrl.addEventListener("click", onImportUrl);
  if (btnSuggest) btnSuggest.addEventListener("click", onSuggest);

  // Initial cart render on load
  document.addEventListener("DOMContentLoaded", refreshCartUI);
})();
