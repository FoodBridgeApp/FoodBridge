/** docs/js/wireup.js — wires buttons/inputs on dev page to API */
import { api } from "./api.js";

const $ = (sel) => document.querySelector(sel);
const els = {
  health:   $("[data-btn=health]"),
  upsert:   $("[data-btn=upsert]"),
  append:   $("[data-btn=append]"),
  read:     $("[data-btn=read]"),
  exportJs: $("[data-btn=export]"),
  emailH:   $("[data-btn=emailHealth]"),
  email:    $("[data-btn=emailSend]"),
  demo:     $("[data-btn=demoIngest]"),

  out:      $("[data-out]"),
  cartId:   $("[data-field=cartId]"),
  userId:   $("[data-field=userId]"),
  emailTo:  $("[data-field=emailTo]"),
};

const show = (x) => {
  els.out.textContent = typeof x === "string" ? x : JSON.stringify(x, null, 2);
};

const val = (el, fallback="") => (el?.value || "").trim() || fallback;

if (els.userId && !els.userId.value) els.userId.value = "christian";

els.health?.addEventListener("click", async () => show(await api.health()));
els.demo?.addEventListener("click", async () => {
  const r = await api.demoIngest({ userId: val(els.userId,"christian"), items: [{type:"recipe", title:"Pasta"}] });
  show(r);
});

els.upsert?.addEventListener("click", async () => {
  const r = await api.upsertCart({
    userId: val(els.userId,"christian"),
    items: [{ type:"recipe", title:"Pasta", sourceUrl:"https://ex", durationSec:900 }],
  });
  if (els.cartId) els.cartId.value = r.cart.cartId;
  show(r);
});

els.append?.addEventListener("click", async () => {
  const id = val(els.cartId);
  if (!id) return show("No cartId");
  const r = await api.appendItems(id, { userId: val(els.userId,"christian"), items: [{ type:"ingredient", title:"Tomato" }] });
  show(r);
});

els.read?.addEventListener("click", async () => {
  const id = val(els.cartId);
  if (!id) return show("No cartId");
  show(await api.getCart(id));
});

els.exportJs?.addEventListener("click", async () => {
  const id = val(els.cartId);
  if (!id) return show("No cartId");
  show(await api.exportJson(id));
});

els.emailH?.addEventListener("click", async () => show(await api.emailHealth()));

els.email?.addEventListener("click", async () => {
  const id = val(els.cartId);
  const to = val(els.emailTo);
  if (!id) return show("No cartId");
  if (!to) return show("Set recipient email");
  show(await api.sendCartEmail(id, { to }));
});