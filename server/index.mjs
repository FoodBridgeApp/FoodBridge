import express from "express";
import fetch from "node-fetch";
const app = express();
const PORT = process.env.PORT || 10000;

// Allow both Render and GitHub Pages
const ALLOWED = [
  "https://foodbridgeapp.github.io",
  "https://foodbridgeapp.github.io/FoodBridge",
  "http://localhost:5173",
  "http://localhost:3000"
];

app.use((req,res,next)=>{
  const origin=req.headers.origin||"";
  const allow=ALLOWED.find(o=>origin.startsWith(o))?origin:"*";
  res.setHeader("Access-Control-Allow-Origin",allow);
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization, Origin");
  if(req.method==="OPTIONS")return res.sendStatus(204);
  next();
});
app.use(express.json({limit:"1mb"}));

function synth(q){
  const t=q.trim()||"Untitled";
  return {
    id:`stub-${Date.now()}`,
    title:`${t[0].toUpperCase()+t.slice(1)} (quick start)`,
    sections:[{id:"s1",label:"Main",order:1}],
    ingredients:[
      {id:"i1",name:"Flour",qty:"2",unit:"cups",sectionId:"s1"},
      {id:"i2",name:"Water",qty:"1",unit:"cup",sectionId:"s1"},
      {id:"i3",name:"Salt",qty:"1",unit:"tsp",sectionId:"s1"},
      {id:"i4",name:"Yeast",qty:"2¼",unit:"tsp",sectionId:"s1"},
      {id:"i5",name:"Olive oil",qty:"2",unit:"tbsp",sectionId:"s1"}
    ],
    steps:[
      {order:1,text:"Mix dry ingredients; add water and oil; knead 8–10 min."},
      {order:2,text:"Let rise 1 hr until doubled."},
      {order:3,text:"Shape, top, bake at 500°F (260°C) 8–12 min."}
    ],
    tags:["stub","baseline"]
  };
}

app.get("/api/health",(req,res)=>{
  res.json({ok:true,ts:Date.now()});
});

app.post("/api/llm/parse",async(req,res)=>{
  const q=(req.body?.q||"").toString();
  if(!q)return res.status(400).json({ok:false,error:"missing q"});
  try{
    // future: hook your LLM here
    const recipe=synth(q);
    res.json({ok:true,recipe});
  }catch(e){
    res.json({ok:true,recipe:synth(q)});
  }
});

app.listen(PORT,()=>console.log(`FoodBridge server on :${PORT}`));
