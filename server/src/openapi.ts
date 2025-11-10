import express from "express";
import swaggerUi from "swagger-ui-express";

/** Minimal OpenAPI document without generators */
const doc = {
  openapi: "3.0.3",
  info: { title: "FoodBridge API", version: "0.1.0" },
  servers: [{ url: "/" }],
  paths: {
    "/api/parse": {
      post: {
        summary: "Parse free-text recipe into structured schema",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: { text: { type: "string", example: "Title\nIngredients:\n- 1 cup flour\n\nInstructions:\n1. Mix..." } }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Parsed recipe",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok","recipe"],
                  properties: {
                    ok: { type: "boolean", example: true },
                    recipe: { $ref: "#/components/schemas/Recipe" }
                  }
                }
              }
            }
          }
        },
        tags: ["parse"]
      }
    }
  },
  components: {
    schemas: {
      Recipe: {
        type: "object",
        required: ["id","title","ingredients","steps"],
        properties: {
          id: { type: "string", example: "rec_123" },
          title: { type: "string", example: "Simple Pancakes" },
          tags: { type: "array", items: { type: "string" } },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              required: ["id","name","quantity","unit"],
              properties: {
                id: { type: "string", example: "ing_1" },
                name: { type: "string", example: "flour" },
                quantity: { type: "number", example: 1 },
                unit: { type: "string", example: "cup" },
                note: { type: "string", nullable: true }
              }
            }
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              required: ["id","text","order"],
              properties: {
                id: { type: "string", example: "step_1" },
                order: { type: "integer", example: 1 },
                text: { type: "string", example: "Mix dry ingredients." }
              }
            }
          },
          media: { type: "array", items: { type: "string", format: "uri" } }
        }
      }
    }
  }
};

export function mountOpenAPI(app: express.Express) {
  app.get("/openapi.json", (_req, res) => res.json(doc));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(doc));
}
