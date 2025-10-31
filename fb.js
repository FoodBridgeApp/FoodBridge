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
  const savingsBox = document.getElementById("savings");

  // ---------- Mock Pricing (category-based + generic placeholder) ----------
  // Uniform price per category; "generic" is intentionally higher to show savings after Optimize.
  const CATEGORY_PRICES = {
    meat: 6.00,
    seafood: 6.00,
    poultry: 6.00,
    dairy: 3.00,
    vegetables: 1.50,
    fruit: 1.20,
    grains: 2.50,
    pantry: 2.00,
    bakery: 2.50,
    spices: 0.50,
    beverages: 1.00,
    condiments: 1.50,
    oils: 2.00,
    generic: 3.50 // placeholder; Optimize will try to reclassify and reduce
  };

  // Lightweight keyword map to classify items. Extend as needed.
  const CATEGORY_KEYWORDS = [
    { cat: "meat",       rx: /\b(steak|beef|pork|lamb|ground\s+beef|bacon|sausage)\b/i },
    { cat: "seafood",    rx: /\b(shrimp|salmon|tuna|cod|tilapia|anchovy|sardine|crab)\b/i },
    { cat: "poultry",    rx: /\b(chicken|turkey)\b/i },
    { cat: "dairy",      rx: /\b(milk|cheese|mozzarella|cheddar|parmesan|butter|yogurt|cream)\b/i },
    { cat: "vegetables", rx: /\b(tomato|onion|garlic|pepper|spinach|arugula|lettuce|carrot|broccoli|mushroom|zucchini)\b/i },
    { cat: "fruit",      rx: /\b(lemon|lime|apple|banana|orange|berries|strawberry|blueberry|avocado)\b/i },
    { cat: "grains",     rx: /\b(rice|pasta|spaghetti|penne|macaroni|flour|bread|tortilla|dough|crust)\b/i },
    { cat: "spices",     rx: /\b(salt|pepper|cumin|paprika|chili|oregano|basil|thyme|rosemary|coriander|turmeric|flake)\b/i },
    { cat: "condiments", rx: /\b(ketchup|mustard|mayo|mayonnaise|salsa|soy\s*sauce|vinegar)\b/i },
    { cat: "oils",       rx: /\b(olive\s*oil|oil|canola|avocado\s*oil|vegetable\s*oil)\b/i },
    { cat: "pantry",     rx: /\b(beans|tomato\s*sauce|tomato\s*paste|stock|broth|sugar|yeast|baking\s*powder|baking\s*soda)\b/i },
    { cat: "bakery",     rx: /\b(bun|roll|baguette|bread|pizza\s*dough|pie\s*crust)\b/i },
    { cat: "beverages",  rx: /\b(juice|soda|water|coffee|tea)\b/i },
  ];

  function classifyItem(title) {
    const t = String(title || "").toLowerCase();
    for (const { cat, rx } of CATEGORY_KEYWORDS) {
      if (rx.test(t)) return cat;
    }
    return "generic";
  }

  function priceFor(title) {
    const cat = classifyItem(title);
    return CATEGORY_PRICES[cat] ?? CATEGORY_PRICES.generic;
  }

  // Client-side price cache per cart line title (so we can show totals immediately)
  const PRICE_CACHE = new Map();
  function ensurePrice(title) {
    if (!PRICE_CACHE.has(title)) {
      PRICE_CACHE.set(title, priceFor(title));
    }
    return PRICE_CACHE.get(title);
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
      if (savingsBox) savingsBox.textContent = "";
      return;
    }
    const frag = document.createDocumentFragment();
    cart.items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.title || "(untitled)";
      frag.appendChild(li);
      total += ensurePrice(it.title || "");
    });
    cartItems.appendChild(frag);
    checkoutTotal.textContent = total.toFixed(2);
    // leave savings box alone here; only update on Optimize
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

    // Pre-fill price cache so totals update immediately
    ingredientTitles.forEach((t) => ensurePrice(t));

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

  // ---------- Strong prompts (because backend is extract-only in your current flow) ----------
  function buildIngredientExtractionTextForDish(dish, diet) {
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

      // Lightweight generic steps (until server returns real ones)
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

  // ---------- Ingredient Suggestions (Add ONE or ALL) ----------
  function renderSuggestionList(names) {
    suggestions.innerHTML = "";
    if (!names.length) {
      const li = document.createElement("li");
      li.textContent = "No suggestions.";
      suggestions.appendChild(li);
      return;
    }

    // Add-All control on top
    const addAll = document.createElement("button");
    addAll.className = "btn";
    addAll.textContent = "Add All";
    addAll.style.marginBottom = "8px";
    addAll.onclick = async () => {
      await addToCart(names);
    };
    suggestions.appendChild(addAll);

    names.forEach((name) => {
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

      renderSuggestionList(deduped);
    } catch (err) {
      console.error(err);
      alert(`Suggest failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Optimize All (mock reclassification to reduce generic costs) ----------
  if (btnOptimizeAll) {
    btnOptimizeAll.disabled = false;
    btnOptimizeAll.onclick = async () => {
      const cid = getCartId();
      if (!cid) {
        alert("No cart yet.");
        return;
      }
      try {
        setBusy(true);
        const data = await api(`/api/cart/${encodeURIComponent(cid)}`);
        const items = (data?.cart?.items || []).slice();

        let before = 0;
        let after = 0;

        // Current totals from PRICE_CACHE (pre-optimization)
        items.forEach((it) => {
          before += ensurePrice(it.title || "");
        });

        // Reclassify each item and set a possibly lower price if it was generic
        items.forEach((it) => {
          const title = it.title || "";
          const old = ensurePrice(title);
          const newPrice = priceFor(title); // if generic can now map to a specific cat via keywords
          // If still generic, keep generic price; else set category price (usually <= generic)
          const finalPrice = newPrice;
          PRICE_CACHE.set(title, finalPrice);
          after += finalPrice;
        });

        // Update UI
        renderCart({ items });
        const saved = Math.max(0, before - after);
        if (savingsBox) {
          savingsBox.textContent = saved > 0 ? `You saved $${saved.toFixed(2)} (mock optimization)` : "No savings found (mock).";
        }
        alert("Optimized (mock). Replace with real pricing when ready.");
      } catch (err) {
        console.error(err);
        alert(`Optimize failed: ${err.message || err}`);
      } finally {
        setBusy(false);
      }
    };
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
