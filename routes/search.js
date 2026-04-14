const express = require("express");
const axios   = require("axios");
const router  = express.Router();

async function getFatSecretToken() {
  const credentials = Buffer.from(
    `${process.env.FATSECRET_CLIENT_ID}:${process.env.FATSECRET_CLIENT_SECRET}`
  ).toString("base64");
  const res = await axios.post(
    "https://oauth.fatsecret.com/connect/token",
    "grant_type=client_credentials&scope=basic",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return res.data.access_token;
}

// ─── GET /search?name=apple&serving=0 ────────────────────
router.get("/", async (req, res) => {
  try {
    const { name, serving = 0 } = req.query;
    if (!name) return res.status(400).json({ error: "Se requiere el parámetro name" });

    const token = await getFatSecretToken();

    // Buscar alimento
    const searchRes = await axios.get(
      "https://platform.fatsecret.com/rest/server.api",
      {
        params: {
          method:            "foods.search",
          search_expression: name,
          format:            "json",
          max_results:       1,
        },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const foods = searchRes.data.foods?.food;
    if (!foods) return res.status(404).json({ error: "Alimento no encontrado" });

    const food   = Array.isArray(foods) ? foods[0] : foods;
    const foodId = food.food_id;

    // Obtener nutrición
    const nutritionRes = await axios.get(
      "https://platform.fatsecret.com/rest/server.api",
      {
        params: { method: "food.get.v2", food_id: foodId, format: "json" },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const servings = nutritionRes.data.food?.servings?.serving;
    if (!servings) return res.status(404).json({ error: "Sin datos nutricionales" });

    const allServings  = Array.isArray(servings) ? servings : [servings];
    const idx          = Math.min(parseInt(serving), allServings.length - 1);
    const selectedServ = allServings[idx];

    res.json({
      food_name:    food.food_name,
      calories:     selectedServ.calories,
      protein:      selectedServ.protein,
      carbs:        selectedServ.carbohydrate,
      fat:          selectedServ.fat,
      serving:      selectedServ.serving_description,
      all_servings: allServings.map((s) => s.serving_description ?? ""),
      food_id:      foodId,
    });

  } catch (err) {
    console.error("❌ /search error:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
