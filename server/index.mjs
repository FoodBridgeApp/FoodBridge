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

// Basic diagnostics while stabilizing
app.use((req,res,next)=>{
  const origin=req.headers.origin||"(none)";
  const allowed=!origin||WHITELIST.has(origin);
  console.log(`[CORS] ${req.method} ${req.path} | Origin=${origin} | Allowed=${allowed}`);
  next();
});

// Security/caching headers
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  res.setHeader("Cache-Control","no-store, max-age=0");
  next();
});

// CORS + preflight
app.use(cors({
  origin:(origin,cb)=>{ if(!origin||WHITELIST.has(origin)) return cb(null,true); return cb(new Error("CORS blocked: "+origin)); },
  methods:["GET","POST","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization"],
  maxAge:86400
}));
app.options("*", cors());

// JSON body
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

// ultra-compatible envelope: every legacy path gets data
function respondCompat(res, recipe){
  // also attach obvious fallbacks for naive selectors
  const payload = {
    ok: true,

    // Primary modern
    recipe,

    // Legacy nested
    data: { recipe },
    result: { recipe },

    // Arrays some selectors expect
    recipes: [recipe],
    items: [recipe],
    payload: { recipe },

    // Top-level mirrors that some selectors read directly
    id: recipe.id,
    title: recipe.title,
    ingredients: recipe.ingredients,
    sections: recipe.sections,
    steps: recipe.steps,
    tags: recipe.tags
  };
  return res.json(payload);
}

function handleParse(req, res){
  const q = pickQuery(req);
  const stub = buildStub(q);
  const parsed = Recipe.safeParse(stub);
  if(!parsed.success){
    // give a minimal compat object even on error to avoid undefined access in UI
    const safe = {
      id:"stub-error",
      title:"Recipe",
      ingredients:[],
      sections:[],
      steps:[],
      tags:[]
    };
    return respondCompat(res, safe);
  }
  return respondCompat(res, parsed.data);
}

app.post("/api/llm/parse", handleParse);
app.get ("/api/llm/parse", handleParse);

// Explicit legacy alias just in case the UI points there
app.all("/api/parse", handleParse);

app.get("/api/health", (_req,res)=> res.json({ ok:true, ts:Date.now() }));

const port = process.env.PORT || 10000;
app.listen(port, ()=> console.log(`[foodbridge] server listening on ${port}`));
