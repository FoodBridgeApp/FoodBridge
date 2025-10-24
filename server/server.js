import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();
const PORT = process.env.PORT || 10000;

// Allow your Pages origin + local dev
const allowed = [
  "https://foodbridgeapp.github.io",
  "https://foodbridgeapp.github.io/FoodBridge",
  "https://foodbridgeapp.github.io/FoodBridge/",
  "http://localhost:5173",
  "http://localhost:3000"
];
app.use(cors({
  origin(origin, cb){
    if (!origin || allowed.some(a => origin?.startsWith(a))) return cb(null, true);
    return cb(null, true); // permissive for now
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

// ---- Health ----
app.get("/api/health", (req,res)=> {
  res.json({ ok:true, message:"FoodBridge API live", env: { port: PORT }});
});

// ---- Ingredient suggestions (simple demo) ----
app.get("/api/ingredients/suggest", (req,res)=>{
  const q = (req.query.q||"").toString().toLowerCase();
  const base = ["tomato","onion","garlic","chicken","beef","rice","pasta","basil","cilantro","avocado","egg","milk","cheese"];
  const suggestions = base
    .filter(n => !q || n.includes(q))
    .slice(0, 10)
    .map(n => ({ name:n }));
  res.json({ ok:true, query:q, suggestions });
});

// ---- AI-ish recipe stubs so UI renders immediately ----
function demoRecipe(title="AI Dish", servings=4){
  return {
    title,
    servings,
    ingredients: [
      { name: "tomato" }, { name: "onion" }, { name: "garlic" }, { name: "olive oil" },
      { name: "salt" }, { name: "pepper" }
    ],
    steps: [
      "Prep the ingredients.",
      "Saute aromatics.",
      "Combine and simmer.",
      "Season to taste and serve."
    ]
  };
}

app.post("/api/ingest/free-text", (req,res)=>{
  const { prompt="", diet="", servings=4 } = req.body || {};
  res.json({ ok:true, recipe: demoRecipe(prompt || "Chef's Choice", servings) });
});

app.post("/api/ingest/url", (req,res)=>{
  const { url="", diet="", servings=4 } = req.body || {};
  res.json({ ok:true, recipe: demoRecipe("Imported Recipe", servings) });
});

app.post("/api/ingest/audio", (req,res)=>{
  res.json({ ok:true, recipe: demoRecipe("Audio Transcribed Recipe", 4) });
});

// ---- Cart pricing/optimization (demo math so UI doesn't hang) ----
function priceItems(items=[]){
  let total = 0;
  const priced = (items||[]).map(it=>{
    const unit = Number(it.unitPrice ?? (Math.random()*3 + 1)).toFixed(2);
    const qty  = Number(it.qty ?? 1);
    const line = qty * Number(unit);
    total += line;
    return { ...it, unitPrice: Number(unit), qty, lineTotal: Number(line.toFixed(2)) };
  });
  return { items: priced, total: Number(total.toFixed(2)) };
}

app.post("/api/pricing/cart", (req,res)=>{
  const { items=[] } = req.body || {};
  const priced = priceItems(items);
  res.json(priced);
});

app.post("/api/optimize/item", (req,res)=>{
  const { item } = req.body || {};
  if (!item) return res.status(400).json({ ok:false, error:"Missing item" });
  const cheaper = Math.max(0.5, (item.unitPrice ?? 2) * 0.9);
  const lineTotal = Number((cheaper * (item.qty ?? 1)).toFixed(2));
  res.json({ ...item, unitPrice: Number(cheaper.toFixed(2)), lineTotal });
});

app.post("/api/optimize/all", (req,res)=>{
  const { items=[] } = req.body || {};
  const before = priceItems(items);
  const optimized = before.items.map(it=>{
    const cut = Math.max(0.5, (it.unitPrice ?? 2) * 0.9);
    return { ...it, unitPrice: Number(cut.toFixed(2)), lineTotal: Number((cut * it.qty).toFixed(2)) };
  });
  const afterTotal = optimized.reduce((s,x)=> s + (x.lineTotal ?? (x.unitPrice*x.qty)), 0);
  const savings = Number((before.total - afterTotal).toFixed(2));
  res.json({ items: optimized, total: Number(afterTotal.toFixed(2)), savings });
});

// ---- Email plan (SMTP) ----
// Set in Render: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO (optional)
app.post("/api/email/plan", async (req,res)=>{
  try{
    const { subject="FoodBridge Plan", body="", to } = req.body || {};
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || "no-reply@foodbridge.local";
    const rcpt = to || process.env.SMTP_TO;
    if (!host || !user || !pass || !from || !rcpt){
      return res.status(400).json({ ok:false, error:"SMTP env vars missing (SMTP_HOST/PORT/USER/PASS/FROM[/TO])" });
    }
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    const info = await transporter.sendMail({ from, to: rcpt, subject, text: body });
    res.json({ ok:true, id: info.messageId });
  }catch(e){
    res.status(500).json({ ok:false, error: e.message || String(e) });
  }
});

// ---- Static ping on root ----
app.get("/", (_req,res)=> res.json({ ok:true, message:"FoodBridge server root" }));

app.listen(PORT, ()=> {
  console.log(`[foodbridge] listening on :${PORT}`);
});
