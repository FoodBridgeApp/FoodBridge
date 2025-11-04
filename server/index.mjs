import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { z } from "zod";

// -------- app + CORS -----------
const app = express();
const WHITELIST = new Set([
  "https://foodbridgeapp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000"
]);

// Log requests so we can see what the UI calls
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} | origin=${req.headers.origin||"(none)"}`);
  next();
});

// Security headers
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  res.setHeader("Cache-Control","no-store, max-age=0");
  next();
});

// CORS middleware
const corsMw = cors({
  origin: (origin, cb) => { if (!origin || WHITELIST.has(origin)) return cb(null, true); return cb(new Error("CORS blocked: "+origin)); },
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  maxAge: 86400
});
app.use(corsMw);
app.options("*", corsMw);

// Fallback: force ACAO on ALL /api/* responses no matter what
app.use("/api", (req,res,next)=>{
  const o = req.headers.origin;
  if (!o) { res.setHeader("Access-Control-Allow-Origin", "*"); }
  else if (WHITELIST.has(o)) { res.setHeader("Access-Control-Allow-Origin", o); }
  res.setHeader("Vary","Origin");
  next();
});

app.use(bodyParser.json({ limit: "1mb" }));

// -------- schema + helpers -----------
const Ingredient=z.object({ id:z.string(), name:z.string(), qty:z.number().nullable().optional(), unit:z.string().nullable().optional(), sectionId:z.string().nullable().optional() });
const Section   =z.object({ id:z.string(), label:z.string(), order:z.number() });
const Step      =z.object({ order:z.number(), text:z.string(), sectionId:z.string().nullable().optional() });
const Recipe    =z.object({ id:z.string(), title:z.string(), ingredients:z.array(Ingredient), sections:z.array(Section), steps:z.array(Step), tags:z.array(z.string()).optional().default([]) });

function pickQuery(req){
  const b = (req.body && typeof req.body==="object") ? req.body : {};
  const qs = req.query || {};
  const cands = [b.q,b.query,b.text,b.url,qs.q,qs.query,qs.text,qs.url];
  const found = cands.find(v => typeof v === "string" && v.trim());
  return (found||"demo").toString().trim();
}
function stubRecipe(q){
  return {
    id: "stub-"+Date.now(),
    title: `Quick parse for: ${q}`,
    ingredients: [
      { id:"i1", name:"Flour", qty:2, unit:"cup", sectionId:"s1" },
      { id:"i2", name:"Water", qty:1, unit:"cup", sectionId:"s1" }
    ],
    sections: [{ id:"s1", label:"Dough", order:1 }],
    steps: [
      { order:1, text:"Mix ingredients until combined.", sectionId:"s1" },
      { order:2, text:"Bake until golden.", sectionId:"s1" }
    ],
    tags:["stub"]
  };
}
function ensureArrays(r){
  const x = r||{ id:"stub", title:"Recipe", ingredients:[], sections:[], steps:[], tags:[] };
  x.ingredients = Array.isArray(x.ingredients)?x.ingredients:[];
  x.sections    = Array.isArray(x.sections)?x.sections:[];
  x.steps       = Array.isArray(x.steps)?x.steps:[];
  x.tags        = Array.isArray(x.tags)?x.tags:[];
  return x;
}
function omniPayload(recipe){
  const r = ensureArrays(recipe);
  const list = [r];

  return {
    ok: true,

    // canonical
    recipe: r,

    // arrays many selectors might map over
    recipes: list, items: list, results: list, list: list, rows: list,

    // nested mirrors
    data:    { recipe: r, items: list, results: list, list: list },
    result:  { recipe: r, items: list, results: list, list: list },
    payload: { recipe: r, items: list, results: list, list: list },
    meta:    { ok: true },

    // top-level mirrors
    id: r.id, title: r.title, ingredients: r.ingredients, sections: r.sections, steps: r.steps, tags: r.tags,

    // llm-ish
    choices: [{ message: { content: JSON.stringify({ recipe:r }) }, recipe:r }],
    output: { recipe: r }
  };
}
function sendOmni(res, recipe){
  const body = omniPayload(recipe);
  // Final safety: always JSON with 200
  res.status(200).type("application/json").send(JSON.stringify(body));
}

// Specific health route
app.get("/api/health", (_req,res)=> res.json({ ok:true, healthy:true, ts:Date.now() }));

// Known routes
function handleParse(req,res){
  const q = pickQuery(req);
  let rec = stubRecipe(q);
  const parsed = Recipe.safeParse(rec);
  if(!parsed.success){ rec = ensureArrays(null); }
  console.log("[RESP] omni for", req.path);
  sendOmni(res, rec);
}
app.post("/api/llm/parse", handleParse);
app.get ("/api/llm/parse", handleParse);
app.all ("/api/parse",      handleParse);

// CATCH-ALL: any unknown /api/* path returns omni payload so selectors never break
app.all("/api/*", (req,res)=>{
  console.log("[RESP] omni catch-all for", req.path);
  sendOmni(res, stubRecipe(req.path));
});

// boot
const port = process.env.PORT || 10000;
app.listen(port, ()=> console.log(`[foodbridge] server listening on ${port}`));
