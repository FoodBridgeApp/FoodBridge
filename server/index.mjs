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

// Log and validate origin for diagnostics
app.use((req,res,next)=>{
  const origin=req.headers.origin||"(none)";
  const allowed=!origin||WHITELIST.has(origin);
  console.log(`[CORS] ${req.method} ${req.path} | Origin=${origin} | Allowed=${allowed}`);
  next();
});

// Secure headers
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","SAMEORIGIN");
  next();
});

// CORS middleware + preflight
app.use(cors({
  origin:(origin,cb)=>{
    if(!origin||WHITELIST.has(origin)) return cb(null,true);
    return cb(new Error("CORS blocked: "+origin));
  },
  methods:["GET","POST","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization"],
  maxAge:86400
}));
app.options("*", cors());

// JSON body
app.use(bodyParser.json({limit:"1mb"}));

// ---- STUB ENDPOINT ----
const Ingredient=z.object({id:z.string(),name:z.string(),qty:z.number().nullable().optional(),unit:z.string().nullable().optional(),sectionId:z.string().nullable().optional()});
const Section=z.object({id:z.string(),label:z.string(),order:z.number()});
const Step=z.object({order:z.number(),text:z.string(),sectionId:z.string().nullable().optional()});
const Recipe=z.object({id:z.string(),title:z.string(),ingredients:z.array(Ingredient),sections:z.array(Section),steps:z.array(Step),tags:z.array(z.string()).optional().default([])});

app.post("/api/llm/parse",(req,res)=>{
  const q=(req.body?.q||"").toString().trim();
  if(!q) return res.status(400).json({ok:false,error:"Missing q"});
  const stub={
    id:"stub-"+Date.now(),
    title:`Quick parse for: ${q}`,
    ingredients:[
      {id:"i1",name:"Flour",qty:2,unit:"cup",sectionId:"s1"},
      {id:"i2",name:"Water",qty:1,unit:"cup",sectionId:"s1"}
    ],
    sections:[{id:"s1",label:"Dough",order:1}],
    steps:[
      {order:1,text:"Mix ingredients until combined.",sectionId:"s1"},
      {order:2,text:"Bake until golden.",sectionId:"s1"}
    ],
    tags:["stub"]
  };
  const parsed=Recipe.safeParse(stub);
  if(!parsed.success) return res.status(500).json({ok:false,error:"Validation failed"});
  res.json({ok:true,recipe:parsed.data});
});

app.get("/api/health",(req,res)=>res.json({ok:true,ts:Date.now()}));

const port=process.env.PORT||10000;
app.listen(port,()=>console.log(`[foodbridge] server listening on ${port}`));
