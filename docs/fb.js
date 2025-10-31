// ===== FoodBridge frontend (main app) =====
// Works with docs/index.html you pasted.
// Talks to server at window.__FB_API_BASE__ (from config.js or index.html fallback)

(function () {
  // ---------- Config ----------
  const API_BASE =
    (typeof window.__FB_API_BASE__ === "string" && window.__FB_API_BASE__) ||
    (window.FB_CFG && window.FB_CFG.apiBase) ||
    "https://foodbridge-server-rv0a.onrender.com";

  const USER_ID = "christian"; // simple static user id for now
  const LS_CART_ID = "fb_cart_id_v1";

  // Small helper to show a spinner across sections
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

  // ---------- Utilities ----------
  function htmlEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

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

  // Normalize items to server schema
  function normalizeItems(rawTitles) {
    return rawTitles
      .map((t) => String(t).trim())
      .filter(Boolean)
      .map((title) => ({ type: "ingredient", title }));
  }

  function renderList(el, arr, ordered = false) {
    el.innerHTML = "";
    if (!arr || !arr.length) return;
    const frag = document.createDocumentFragment();
    arr.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      frag.appendChild(li);
    });
    el.appendChild(frag);
    if (ordered && el.tagName !== "OL") {
      // index.html already uses <ol> for steps; this is a guard if changed later
    }
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
      // no prices yet; keep total 0 unless you later enrich items
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
    } catch (_) {
      // ignore for now; leave empty UI
    }
  }

  // ---------- “AI Recipe – Generate” ----------
  async function onGenerate() {
    const dish = (elDish?.value || "").trim();
    const diet = (elDiet?.value || "").trim();
    if (!dish) {
      alert("Type a dish name first.");
      return;
    }

    // Build a brief text for the LLM extractor. It only returns items,
    // so we’ll synthesize steps client-side.
    const text = [
      `Dish: ${dish}`,
      diet ? `Diet: ${diet}` : "",
      "Ingredients: core ingredients for a simple home-cook rendition.",
      "Directions: short 4–6 steps.",
    ]
      .filter(Boolean)
      .join("\n");

    setBusy(true);
    try {
      const payload = { userId: USER_ID, text, sourceUrl: null };
      const data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Pick one recipe title if present, else fall back to the dish input
      const recipeItem = (data.items || []).find((x) => x.type === "recipe");
      const title = recipeItem?.title || dish;
      const ingr = dedupeTitles(
        (data.items || [])
          .filter((x) => x.type === "ingredient")
          .map((x) => x.title)
      );

      // Synthetic steps (client-side)
      const steps = [
        "Gather ingredients.",
        `Prep basics (chop/mince/measure).`,
        "Cook main component until done.",
        "Combine and adjust seasoning.",
        "Serve.",
      ];

      // Render
      dishTitle.textContent = title;
      dishMeta.textContent = diet ? `Diet: ${diet}` : "";
      renderList(dishIngredients, ingr, false);
      renderList(dishSteps, steps, true);

      // Enable add-to-cart if we have ingredients
      btnAddIngredients.disabled = ingr.length === 0;
      btnAddIngredients.onclick = async () => {
        if (!ingr.length) return;
        await addToCart(ingr);
      };
    } catch (err) {
      console.error(err);
      alert(`Generate failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- “Import from URL” ----------
  async function onImportUrl() {
    const u = (elUrl?.value || "").trim();
    if (!u) {
      alert("Paste a URL first.");
      return;
    }
    setBusy(true);
    try {
      // Send just the URL as text; extractor will try to make sense of it.
      const payload = { userId: USER_ID, text: u, sourceUrl: u };
      const data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const recipeItem = (data.items || []).find((x) => x.type === "recipe");
      const title = recipeItem?.title || "Imported Recipe";
      const ingr = dedupeTitles(
        (data.items || [])
          .filter((x) => x.type === "ingredient")
          .map((x) => x.title)
      );
      const steps = [
        "Open source link for full details.",
        "Prepare ingredients as required.",
        "Follow cooking steps as indicated.",
        "Adjust seasoning and serve.",
      ];

      urlTitle.textContent = title;
      urlMeta.textContent = u;
      renderList(urlIngredients, ingr, false);
      renderList(urlSteps, steps, true);

      btnAddIngredientsUrl.disabled = ingr.length === 0;
      btnAddIngredientsUrl.onclick = async () => {
        if (!ingr.length) return;
        await addToCart(ingr);
      };
    } catch (err) {
      console.error(err);
      alert(`Import failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- “Ingredient Suggestions” ----------
  async function onSuggest() {
    const q = (elQ?.value || "").trim();
    if (!q) {
      alert('Type a query (e.g., "tomato").');
      return;
    }
    setBusy(true);
    try {
      // Ask LLM for related ingredients
      const text = `Suggest pantry or produce items related to: ${q}. Return ingredients only.`;
      const payload = { userId: USER_ID, text, sourceUrl: null };
      const data = await api(`/api/ingest/llm`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const ingr = dedupeTitles(
        (data.items || [])
          .filter((x) => x.type === "ingredient")
          .map((x) => x.title)
      );

      // Render suggestions list with “+ Add” buttons
      suggestions.innerHTML = "";
      if (!ingr.length) {
        const li = document.createElement("li");
        li.textContent = "No suggestions.";
        suggestions.appendChild(li);
      } else {
        ingr.forEach((name) => {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.className = "btn";
          btn.style.marginLeft = "8px";
          btn.textContent = "+ Add";
          btn.onclick = async () => {
            await addToCart([name]);
          };
          li.textContent = name;
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

  // ---------- Cart wiring ----------
  async function addToCart(ingredientTitles) {
    const items = normalizeItems(ingredientTitles);
    const existing = getCartId();

    setBusy(true);
    try {
      if (existing) {
        // append to existing
        const data = await api(`/api/cart/${encodeURIComponent(existing)}/items`, {
          method: "POST",
          body: JSON.stringify({ userId: USER_ID, items }),
        });
        renderCart(data.cart);
      } else {
        // upsert -> create new cart
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

  // ---------- Email / Print (already present in your UI) ----------
  // Keep these no-ops here if your existing code binds elsewhere.
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
