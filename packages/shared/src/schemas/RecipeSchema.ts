import { z } from "zod";

export const UnitEnum = z.enum([
  "g","kg","mg","ml","l","tsp","tbsp","cup","oz","lb","unit"
]);

export const IngredientSchema = z.object({
  id: z.string().min(1),
  raw: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().nonnegative().nullable(),
  unit: UnitEnum.nullable(),
  notes: z.string().optional().nullable()
});

export const StepSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().min(1)
});

export const MediaSchema = z.object({
  kind: z.enum(["image","video"]),
  url: z.string().url(),
  caption: z.string().optional()
});

export const SectionSchema = z.object({
  title: z.string().min(1),
  ingredientIds: z.array(z.string())
});

export const RecipeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  yield: z.string().optional(),
  ingredients: z.array(IngredientSchema).min(1),
  sections: z.array(SectionSchema).optional().default([]),
  steps: z.array(StepSchema).min(1),
  tags: z.array(z.string()).optional().default([]),
  media: z.array(MediaSchema).optional().default([])
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;

