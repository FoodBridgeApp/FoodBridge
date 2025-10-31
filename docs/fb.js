// ===== FoodBridge frontend (main app) =====
// Talks to server at window.__FB_API_BASE__ (from config.js)

(function () {
  const BUILD = "fb-2025-10-31b"; // <- shows in console to confirm new JS is live
  console.log("[%cFoodBridge%c] %s", "color:#4da3ff", "color:inherit", BUILD);

  // ---------- Config ----------
  const API_BASE =
    (typeof window.__FB_API_BASE__ === "string" && window.__FB_API_BASE__) ||
    "https://foodbridge-server-rv0a.onrender.com";

  const USER_ID = "christian";
  const LS_CART_ID = "fb_cart_id_v1";

  // Mock pricing config (client-side only)
  const CATEGORY_PRICES = {
    meat: 8.0,
    seafood: 9.0,
    dairy: 4.0,
    produce: 2.0,
    bakery: 3.5,
    grains: 3.0,
    pantry: 3.0,
    spices: 1.5,
    beverages: 2.5,
    frozen: 4.5,
    other: 3.0,
  };
  const GENERIC_DISCOUNT = 0.15; // 15% cheaper generics
  const BRAND_HINTS = ["kraft", "barilla", "rao", "heinz", "oreo", "kerrygold", "tillamook", "pepsi", "coke"];

  // Show API in header
  const apiBaseLabel = document.getElementById("apiBase");
  if (apiBaseLabel) apiBaseLabel.textContent = API_BASE;

  // ---------- Spinner ----------
  const spinner = document.getElementById("spinner");
  function setBusy(isBusy) {
    if (spinner) spinner.style.display = isBusy ? "flex" : "none";
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

  // Local enrichment store (title -> {category, basePrice, price, optimized})
  const priceCache = new Map();

  // ---------- Helpers ----------
  const normalize = (s) => String(s || "").toLowerCase();

  function categorizeIngredient(title) {
    const t = normalize(title);
    if (/(beef|chicken|pork|turkey|steak|ground|bacon|sausage|ham|lamb)/.test(t)) return "meat";
    if (/(salmon|shrimp|tuna|cod|tilapia|sardine|anchovy|fish)/.test(t)) return "seafood";
    if (/(milk|cheese|mozzarella|cheddar|parmesan|parmigiano|butter|yogurt|cream|half[-\s]?and[-\s]?half|egg)/.test(t)) return "dairy";
    if (/(tomato|onion|garlic|pepper|bell pepper|jalape|lettuce|spinach|kale|carrot|celery|basil|cilantro|parsley|lemon|lime|avocado|potato|mushroom|cucumber|zucchini|broccoli|cauliflower)/.test(t)) return "produce";
    if (/(bread|bun|tortilla|pita|baguette|roll|crust|pizza dough|dough)/.test(t)) return "bakery";
    if (/(pasta|spaghetti|penne|rigatoni|macaroni|noodle|rice|quinoa|farro|couscous|oats|flour|cornmeal)/.test(t)) return "grains";
    if (/(salt|pepper|oregano|basil|cumin|paprika|chili|flake|turmeric|coriander|clove|cinnamon)/.test(t)) return "spices";
    if (/(olive oil|oil|vinegar|soy sauce|sauce|ketchup|mustard|mayonnaise|mayo|stock|broth|beans|tomato paste|tomato sauce|canned|jarred|sugar|honey|yeast|baking powder|baking soda)/.test(t)) return "pantry";
    if (/(frozen|ice cream)/.test(t)) return "frozen";
    if (/(juice|soda|coffee|tea)/.test(t)) return "beverages";
    return "other";
  }

  function computeBasePrice(title) {
    const category = categorizeIngredient(title);
    const basePrice = CATEGORY_PRICES[category] ?? CATEGORY_PRICES.other;
    return { category, basePrice };
  }

  function looksLikeBrand(title) {
    const t = normalize(title);
    return BRAND_HINTS.some((b) => t.includes(b));
  }

  function ensureEnriched(itemTitle) {
    const key = itemTitle.trim();
    if (priceCache.has(key)) return priceCache.get(key);
    const { category, basePrice } = computeBasePrice(key);
    const isBrand = looksLikeBrand(key);
    const price = basePrice * (isBrand ? 1.0 : 1.0);
    const enriched = { category, basePrice, price, optimized: false, genericApplied: false };
    priceCache.set(key, enriched);
    return enriched;
  }

  const formatMoney = (n) => (Number.isFinite(n) ? n : 0).toFixed(2);

  function dedupeTitles(items) {
    const seen = new Set();
    return items.filter((it) => {
      const key = `${it.type}:${normalize(it.title)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function api(path, opts = {}) {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      method: "GET",
      ...opts,
      headers: { "content-type": "application/json", ...(opts.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      const e = new Error(msg);
      e.status = res.status;
      e.payload = data;
      throw e;
    }
    return data;
  }

  const getCartId = () => localStorage.getItem(LS_CART_ID);
  const setCartId = (id) => id && localStorage.setItem(LS_CART_ID, id);

  const normalizeItems = (titles) =>
    titles.map((t) => String(t).trim()).filter(Boolean).map((title) => ({ type: "ingredient", title }));

  // ---------- Cart UI ----------
  function renderCart(cart) {
    cartItems.innerHTML = "";
    savingsBox.textContent = "";

    if (!cart?.items?.length) {
      checkoutTotal.textContent = "0.00";
      if (btnOptimizeAll) btnOptimizeAll.disabled = true;
      return;
    }

    let subtotal = 0;
    let total = 0;
    let totalGenericSavings = 0;

    const frag = document.createDocumentFragment();
    cart.items.forEach((it) => {
      const title = it.title || "(untitled)";
      const info = ensureEnriched(title);
      subtotal += info.basePrice;
      total += info.price;
      if (info.genericApplied) totalGenericSavings += info.basePrice - info.price;

      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      li.style.gap = "8px";

      const left = document.createElement("div");
      left.textContent = `${title} · ${info.category}`;

      const right = document.createElement("div");
      right.textContent = `$${formatMoney(info.price)}`;
      right.style.fontVariantNumeric = "tabular-nums";

      li.appendChild(left);
      li.appendChild(right);
      frag.appendChild(li);
    });

    cartItems.appendChild(frag);
    checkoutTotal.textContent = formatMoney(total);
    if (btnOptimizeAll) btnOptimizeAll.disabled = false;

    if (totalGenericSavings > 0) {
      savingsBox.textContent = `You saved $${formatMoney(totalGenericSavings)} with generic swaps. (Before: $${formatMoney(
        subtotal
      )} → After: $${formatMoney(total)})`;
    }
  }

  async function refreshCartUI() {
    const cid = getCartId();
    if (!cid) {
      renderCart(null);
      return;
    }
    try {
      const data = await api(`/api/cart/${encodeURIComponent(cid)}`);
      (data.cart.items || []).forEach((it) => ensureEnriched(it.title));
      renderCart(data.cart);
    } catch { /* ignore */ }
  }

  async function addToCart(titles) {
    const items = normalizeItems(titles);
    const existing = getCartId();
    setBusy(true);
    try {
      const body = JSON.stringify({ userId: USER_ID, items });
      const data = existing
        ? await api(`/api/cart/${encodeURIComponent(existing)}/items`, { method: "POST", body })
        : await api(`/api/cart/upsert`, { method: "POST", body });

      const cid = data?.cart?.id;
      if (cid) setCartId(cid);
      (data.cart.items || []).forEach((it) => ensureEnriched(it.title));
      renderCart(data.cart);
    } catch (e) {
      console.error(e);
      alert(`Add to cart failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Dish Generator (true steps via backend) ----------
  async function onGenerate() {
    const dish = (elDish?.value || "").trim();
    const diet = (elDiet?.value || "").trim();
    if (!dish) return alert("Type a dish first.");

    setBusy(true);
    try {
      const data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, dish, diet }),
      });

      const recipe = data?.recipe || {};
      const ingredients = recipe.ingredients || [];
      const steps = recipe.steps?.length ? recipe.steps : ["(No steps returned)"];

      dishTitle.textContent = recipe.title || dish;
      dishMeta.textContent = diet ? `Diet: ${diet}` : "";
      renderSimpleList(dishIngredients, ingredients);
      renderSimpleList(dishSteps, steps);

      btnAddIngredients.disabled = !ingredients.length;
      btnAddIngredients.onclick = () => addToCart(ingredients);
    } catch (e) {
      console.error(e);
      alert(`Generate failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Import from URL (send explicit text prompt to backend) ----------
  async function onImportUrl() {
    const url = (elUrl?.value || "").trim();
    if (!url) return alert("Paste a URL first.");

    // IMPORTANT: include 'text' so /api/ingest/llm can use the classic extractor if needed
    const text = [
      `Extract the exact recipe title, complete ingredient list, and the real step-by-step method from this source:`,
      url,
      `Return structured, real steps (not generic placeholders).`,
      `Ingredients should be 8–30 short grocery-style names (no quantities or brands).`,
    ].join("\n");

    setBusy(true);
    try {
      const data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, text, sourceUrl: url }),
      });

      // Prefer new-style {recipe:{title,ingredients,steps}}, but also support old-style items
      const recipe = data?.recipe || {};
      let ingredients = recipe.ingredients || [];
      let steps = recipe.steps || [];

      if (!ingredients.length && Array.isArray(data?.items)) {
        ingredients = data.items.filter((x) => x.type === "ingredient").map((x) => x.title);
      }
      if (!steps?.length) {
        steps = ["Open the source link for full steps.", "Prepare and cook as directed."];
      }

      const title =
        recipe.title ||
        (Array.isArray(data?.items) ? data.items.find((x) => x.type === "recipe")?.title : null) ||
        "Imported Recipe";

      urlTitle.textContent = title;
      urlMeta.textContent = url;
      renderSimpleList(urlIngredients, ingredients);
      renderSimpleList(urlSteps, steps);

      btnAddIngredientsUrl.disabled = !ingredients.length;
      btnAddIngredientsUrl.onclick = () => addToCart(ingredients);
    } catch (e) {
      console.error(e);
      alert(`Import failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Ingredient Suggestions (robust: try suggest API, fallback to LLM text) ----------
  async function onSuggest() {
    const q = (elQ?.value || "").trim();
    if (!q) return alert('Type a query (e.g., "pasta").');

    setBusy(true);
    try {
      let list = [];
      let usedFallback = false;

      // Try the dedicated suggest endpoint first
      try {
        const resp = await api(`/api/ingest/ingredients/suggest?q=${encodeURIComponent(q)}`);
        list = (resp?.ingredients || []).map(String).map((s) => s.trim()).filter(Boolean);
      } catch (e) {
        // Fallback to LLM text mode (always available)
        usedFallback = true;
        const text = [
          `Suggest ingredients commonly used with: ${q}.`,
          `Return 8–12 short grocery-style names (no brands, no quantities, no utensils).`,
        ].join("\n");
        const resp = await api(`/api/ingest/llm`, {
          method: "POST",
          body: JSON.stringify({ userId: USER_ID, text, sourceUrl: null }),
        });
        list = (resp?.items || [])
          .filter((x) => x.type === "ingredient")
          .map((x) => x.title)
          .map((s) => String(s).trim())
          .filter(Boolean);
      }

      suggestions.innerHTML = "";
      if (!list.length) {
        suggestions.innerHTML = "<li>No suggestions.</li>";
      } else {
        list.forEach((name) => {
          const li = document.createElement("li");
          li.textContent = name;
          const btn = document.createElement("button");
          btn.className = "btn";
          btn.style.marginLeft = "8px";
          btn.textContent = "+ Add";
          btn.onclick = () => addToCart([name]);
          li.appendChild(btn);
          suggestions.appendChild(li);
        });
        const allBtn = document.createElement("button");
        allBtn.className = "btn";
        allBtn.textContent = "Add All";
        allBtn.style.marginTop = "8px";
        allBtn.onclick = () => addToCart(list);
        suggestions.appendChild(allBtn);

        if (usedFallback) {
          const note = document.createElement("div");
          note.className = "recipe-sub";
          note.style.marginTop = "6px";
          note.textContent = "(Using LLM fallback for suggestions.)";
          suggestions.appendChild(note);
        }
      }
    } catch (e) {
      console.error(e);
      alert(`Suggest failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // Renders a simple UL/OL of strings
  function renderSimpleList(el, arr) {
    el.innerHTML = "";
    if (!arr?.length) return;
    const frag = document.createDocumentFragment();
    arr.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      frag.appendChild(li);
    });
    el.appendChild(frag);
  }

  // ---------- Optimize ----------
  async function onOptimizeAll() {
    const cid = getCartId();
    if (!cid) return alert("No cart yet.");
    setBusy(true);
    try {
      const data = await api(`/api/cart/${encodeURIComponent(cid)}`);
      const items = data?.cart?.items || [];
      if (!items.length) {
        renderCart(data.cart);
        return;
      }
      items.forEach((it) => {
        const info = ensureEnriched(it.title || "");
        if (!info.genericApplied) {
          info.price = +(info.basePrice * (1 - GENERIC_DISCOUNT)).toFixed(2);
          info.genericApplied = true;
          info.optimized = true;
        }
      });
      renderCart({ items });
    } catch (e) {
      console.error(e);
      alert(`Optimize failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Email / Print ----------
  document.getElementById("btn-print")?.addEventListener("click", () => window.print());

  document.getElementById("btn-email")?.addEventListener("click", async () => {
    const cid = getCartId();
    if (!cid) return alert("No cart yet.");
    const to = prompt("Send cart to which email?");
    if (!to) return;
    setBusy(true);
    try {
      await api(`/api/cart/${encodeURIComponent(cid)}/email-summary`, {
        method: "POST",
        body: JSON.stringify({ to, subject: "Your FoodBridge Cart" }),
      });
      alert("Email sent.");
    } catch (e) {
      console.error(e);
      alert(`Email failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  });

  // ---------- Wire events ----------
  btnDish?.addEventListener("click", onGenerate);
  btnIngestUrl?.addEventListener("click", onImportUrl);
  btnSuggest?.addEventListener("click", onSuggest);
  btnOptimizeAll?.addEventListener("click", onOptimizeAll);

  // ---------- Initial ----------
  document.addEventListener("DOMContentLoaded", refreshCartUI);
})();
