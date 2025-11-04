import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { z } from "zod";

const app = express();

// --- whitelist GitHub Pages + localhost ---
const WHITELIST = new Set([
  "https://foodbridgeapp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
]);

// --- CORS that also covers errors ---
const corsCheck = (origin, cb) => {
  if (!origin || WHITELIST.has(origin)) return cb(null, true);
  return cb(new Error("CORS blocked: " + origin));
};

app.use((req, res, next) => {
  // security
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

app.use(cors({
  origin: corsCheck,
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  maxAge: 86400
}));
app.options("*", cors());

// parse json
app.use(bodyParser.json({ limit: "1mb" }));

// --- schemas ---
const Ingredient = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
});
const Section = z.object({ id: z.string(), label: z.string(), order: z.number() });
const Step = z.object({ order: z.number(), text: z.string(), sectionId: z.string().nullable().optional() });

const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  ingredients: z.array(Ingredient).default([]),
  sections: z.array(Section).default([]),
  steps: z.array(Step).default([]),
  tags: z.array(z.string()).default([])
});

// --- helper: safe OK payload no matter what ---
function okRecipe(q) {
  const base = {
    id: "stub-" + Date.now(),
    title: q ? `Quick parse for: ${q}` : "Quick parse",
    ingredients: [],
    sections: [],
    steps: [],
    tags: []
  };
  return RecipeSchema.parse(base); // ensures arrays exist
}

// health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// parse endpoint: never 400 the UI; always return shaped recipe
app.post("/api/llm/parse", async (req, res, next) => {
  try {
    const q = (req.body?.q ?? "").toString().trim();
    // TODO: replace this stub with your real LLM call; keep the shape.
    const recipe = okRecipe(q);

    // If q has content, add minimal demo content so UI shows something
    if (q) {
      recipe.sections = [{ id: "s1", label: "Main", order: 1 }];
      recipe.ingredients = [
        { id: "i1", name: "Flour", qty: 2, unit: "cup", sectionId: "s1" },
        { id: "i2", name: "Water", qty: 1, unit: "cup", sectionId: "s1" }
      ];
      recipe.steps = [
        { order: 1, text: "Mix ingredients.", sectionId: "s1" },
        { order: 2, text: "Bake until golden.", sectionId: "s1" }
      ];
      recipe.tags = ["stub"];
    }

    res.json({ ok: true, recipe });
  } catch (err) {
    next(err);
  }
});

// 404 json (with CORS already applied by middleware)
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

// centralized error handler that STILL returns CORS’d JSON
app.use((err, req, res, _next) => {
  console.error("[server error]", err?.message || err);
  const status = Number(err?.status || 500);
  res.status(status).json({ ok: false, error: err?.message || "Internal Error" });
});

// Render requires binding to $PORT
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("FoodBridge server on :" + port));
