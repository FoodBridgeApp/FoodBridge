import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { z } from "zod";

// ---------- CORS ----------
const WHITELIST = new Set([
  "https://foodbridgeapp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
]);

const corsMw = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow same-origin or curl
    if (WHITELIST.has(origin)) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin));
  },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: false,
  maxAge: 86400
});

// ---------- App ----------
const app = express();

// Security headers
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  next();
});

app.use(corsMw);
app.options("*", corsMw);

app.use(bodyParser.json({ limit: "2mb" }));

// ---------- Schemas & Safe Builders ----------
const Ingredient = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional()
});

const Section = z.object({
  id: z.string(),
  label: z.string(),
  order: z.number()
});

const Step = z.object({
  order: z.number(),
  text: z.string(),
  sectionId: z.string().nullable().optional()
});

const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  ingredients: z.array(Ingredient).default([]),
  sections: z.array(Section).default([]),
  steps: z.array(Step).default([]),
  tags: z.array(z.string()).default([])
});

function safeRecipe(titleText) {
  const base = {
    id: "stub-" + Date.now(),
    title: titleText || "Quick recipe",
    ingredients: [
      { id:"i1", name:"Flour", qty:2, unit:"cup", sectionId:"s1" },
      { id:"i2", name:"Water", qty:1, unit:"cup", sectionId:"s1" }
    ],
    sections: [{ id:"s1", label:"Dough", order:1 }],
    steps: [
      { order:1, text:"Mix ingredients until combined.", sectionId:"s1" },
      { order:2, text:"Bake until golden.", sectionId:"s1" }
    ],
    tags: ["stub"]
  };
  const parsed = RecipeSchema.safeParse(base);
  return parsed.success ? parsed.data : { id:"fallback", title:"Recipe", ingredients:[], sections:[], steps:[], tags:[] };
}

// Omni payload so UI selectors can never crash on `.map` or missing keys.
function omniPayload(q) {
  const recipe = safeRecipe(`Quick parse for: ${q || "your search"}`);
  const listItem = { id:"i1", name:"Flour", qty:2, unit:"cup" };
  const result = { recipe, items:[listItem] };

  return {
    ok: true,
    title: recipe.title,
    // common keys used by various UIs:
    recipe,                         // object
    recipes: [recipe],              // array
    data: { recipe, items:[listItem] },
    result,                         // object
    results: [result],              // array
    items: [listItem],              // array
    list: [listItem],               // array
    output: { recipe },
    payload: { recipe },
    choices: [{ message: { content: JSON.stringify({ recipe }) } }]
  };
}

// ---------- Routes ----------
app.get("/api/health", (req,res)=> {
  res.json({ ok:true, ts: Date.now() });
});

// Accept GET or POST; never 400 even if q is missing.
app.all("/api/llm/parse", (req,res)=> {
  try {
    const q = (req.method === "GET" ? (req.query?.q ?? "") : (req.body?.q ?? "")).toString().trim();
    const payload = omniPayload(q);
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin && WHITELIST.has(req.headers.origin) ? req.headers.origin : "*");
    return res.json(payload);
  } catch (e) {
    // Last-resort: still return UI-safe payload
    const payload = omniPayload("");
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin && WHITELIST.has(req.headers.origin) ? req.headers.origin : "*");
    return res.status(200).json(payload);
  }
});

// Silence favicon lookups if someone hits the server directly
app.get("/favicon.ico", (_,res)=> res.status(204).end());

// Global error guard – always reply with safe shape
app.use((err, req, res, next)=>{
  const payload = omniPayload("");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin && WHITELIST.has(req.headers.origin) ? req.headers.origin : "*");
  return res.status(200).json(payload);
});

// Port
const port = process.env.PORT || 10000; // Render binds 10000
app.listen(port, ()=> {
  console.log("[foodbridge] server listening on " + port);
});
