import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { z } from "zod";

const app = express();

const WHITELIST = new Set([
  "https://foodbridgeapp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000"
]);

// Diagnostics to stdout so we can see what the UI is doing
app.use((req,res,next)=>{
  const origin=req.headers.origin||"(none)";
  console.log(`[REQ] ${req.method} ${req.path} | origin=${origin}`);
  next();
});

// Security + caching
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  res.setHeader("Cache-Control","no-store, max-age=0");
  next();
});

// CORS + preflight (strict but allowed for GH Pages + localhost)
app.use(cors({
  origin:(origin,cb)=>{ if(!origin || WHITELIST.has(origin)) return cb(null,true); return cb(new Error("CORS blocked: "+origin)); },
  methods:["GET","POST","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization"],
  maxAge:86400
}));
app.options("*", cors());

// Body parser
app.use(bodyParser.json({ limit:"1mb" }));

// ---- schema ----
const Ingredient=z.object({ id:z.string(), name:z.string(), qty:z.number().nullable().optional(), unit:z.string().nullable().optional(), sectionId:z.string().nullable().optional() });
const Section   =z.object({ id:z.string(), label:z.string(), order:z.number() });
const Step      =z.object({ order:z.number(), text:z.string(), sectionId:z.string().nullable().optional() });
const Recipe    =z.object({ id:z.string(), title:z.string(), ingredients:z.array(Ingredient), sections:z.array(Section), steps:z.array(Step), tags:z.array(z.string()).optional().default([]) });

function pickQuery(req){
  const b = (req.body && typeof req.body==="object") ? req.body : {};
  const qs = req.query || {};
  const candidates = [b.q,b.query,b.text,b.url,qs.q,qs.query,qs.text,qs.url];
  const found = candidates.find(v => typeof v === "string" && v.trim().length>0);
  return (found||"demo").toString().trim();
}

function buildStub(q){
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

// Shape normalizer: guarantees arrays/objects exist so .map never hits undefined
function ensureArrays(recipe){
  const r = recipe || { id:"stub", title:"Recipe", ingredients:[], sections:[], steps:[], tags:[] };
  r.ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  r.sections    = Array.isArray(r.sections)    ? r.sections    : [];
  r.steps       = Array.isArray(r.steps)       ? r.steps       : [];
  r.tags        = Array.isArray(r.tags)        ? r.tags        : [];
  return r;
}

// Ultra-compat envelope to satisfy unknown selectors
function respondOmni(res, recipe){
  const r = ensureArrays(recipe);

  // Common legacy collections that UI might map over
  const listLike = [r];

  const payload = {
    ok: true,

    // Modern
    recipe: r,

    // Mirrors/aliases (a LOT of them on purpose)
    data:            { recipe: r, items: listLike, results: listLike, list: listLike },
    result:          { recipe: r, items: listLike, results: listLike, list: listLike },
    payload:         { recipe: r, items: listLike, results: listLike, list: listLike },
    meta:            { ok: true },

    // Flat collections some selectors may expect
    recipes:  listLike,
    items:    listLike,
    results:  listLike,
    list:     listLike,
    rows:     listLike,

    // Top-level mirrors for naive access
    id: r.id,
    title: r.title,
    ingredients: r.ingredients,
    sections: r.sections,
    steps: r.steps,
    tags: r.tags,

    // LLM-style shapes sometimes seen
    choices: [
      { message: { content: JSON.stringify({ recipe:r }) }, recipe: r }
    ],
    output: { recipe: r }
  };

  // Log keys that are arrays to confirm availability
  const arrayKeys = Object.keys(payload).filter(k => Array.isArray(payload[k]));
  console.log("[RESP] arrays:", arrayKeys.join(", "));
  return res.json(payload);
}

function handleParse(req, res){
  const q = pickQuery(req);
  const stub = buildStub(q);
  const parsed = Recipe.safeParse(stub);
  if(!parsed.success){
    console.warn("[WARN] Validation failed; serving safe recipe.");
    return respondOmni(res, ensureArrays(null));
  }
  return respondOmni(res, parsed.data);
}

app.post("/api/llm/parse", handleParse);
app.get ("/api/llm/parse", handleParse);
app.all ("/api/parse",      handleParse); // legacy alias

app.get("/api/health", (_req,res)=> res.json({ ok:true, ts:Date.now() }));

const port = process.env.PORT || 10000;
app.listen(port, ()=> console.log(`[foodbridge] server listening on ${port}`));
