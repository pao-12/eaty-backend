const express = require("express");
const axios   = require("axios");
const router  = express.Router();

// ─── HELPERS ──────────────────────────────────────────────

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

async function searchFood(name, token) {
  const res = await axios.get(
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
  const foods = res.data.foods?.food;
  if (!foods) return null;
  const food = Array.isArray(foods) ? foods[0] : foods;
  return { id: food.food_id, name: food.food_name };
}

async function getNutrition(foodId, token, servingIndex = 0) {
  const res = await axios.get(
    "https://platform.fatsecret.com/rest/server.api",
    {
      params: { method: "food.get.v2", food_id: foodId, format: "json" },
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const servings = res.data.food?.servings?.serving;
  if (!servings) return null;

  const allServings = Array.isArray(servings) ? servings : [servings];
  const idx         = Math.min(servingIndex, allServings.length - 1);
  const serving     = allServings[idx];

  return {
    name:        res.data.food?.food_name,
    calories:    serving.calories,
    protein:     serving.protein,
    carbs:       serving.carbohydrate,
    fat:         serving.fat,
    serving:     serving.serving_description,
    allServings: allServings.map((s) => s.serving_description ?? ""),
    foodId:      foodId,
  };
}

function cleanFoodName(food) {
  food = food.toLowerCase().trim();
  const map = {
    pan:         "bread",
    manzana:     "apple",
    naranja:     "orange",
    plátano:     "banana",
    platano:     "banana",
    pollo:       "chicken breast",
    arroz:       "white rice",
    hamburguesa: "burger",
    huevo:       "egg",
    ensalada:    "salad",
    sopa:        "soup",
    bistec:      "beef steak",
    carne:       "beef steak",
    pescado:     "fish",
    camarón:     "shrimp",
    camaron:     "shrimp",
    tomate:      "tomato",
    sándwich:    "sandwich",
    sandwich:    "sandwich",
    leche:       "milk",
    queso:       "cheese",
    yogur:       "yogurt",
    aguacate:    "avocado",
    fresa:       "strawberry",
    uva:         "grapes",
    mango:       "mango",
    papa:        "potato",
    papas:       "potato",
    brócoli:     "broccoli",
    brocoli:     "broccoli",
    zanahoria:   "carrot",
    atún:        "tuna",
    atun:        "tuna",
    chocolate:   "chocolate",
    galleta:     "cookie",
    cereal:      "cereal",
    pizza:       "pizza",
    taco:        "taco",
    pasta:       "pasta",
  };
  for (const [key, value] of Object.entries(map)) {
    if (food.includes(key)) return value;
  }
  return food;
}

// ─── RUTA POST /analyze ───────────────────────────────────
// Body: { image: "base64string" }
router.post("/", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "Se requiere imagen en base64" });

    // 1 · Gemini identifica el alimento
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [
            {
              text: "Identifica el alimento en esta imagen. Responde SOLO con el nombre del alimento en español, nada más. Si no es comida, responde: NO_ES_COMIDA",
            },
            {
              inline_data: { mime_type: "image/jpeg", data: image },
            },
          ],
        }],
        generationConfig: { maxOutputTokens: 200, temperature: 0 },
      }
    );

    const foodName = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text
      ?.toLowerCase()
      ?.trim();

    if (!foodName || foodName === "no_es_comida") {
      return res.status(422).json({ error: "No se pudo identificar el alimento" });
    }

    // 2 · FatSecret busca nutrición
    const cleanName = cleanFoodName(foodName);
    const token     = await getFatSecretToken();
    const food      = await searchFood(cleanName, token);

    if (!food) {
      return res.status(404).json({ error: `Alimento no encontrado: ${cleanName}` });
    }

    const nutrition = await getNutrition(food.id, token);
    if (!nutrition) {
      return res.status(404).json({ error: "Sin datos nutricionales" });
    }

    res.json({
      food_name:    foodName,        // nombre en español de Gemini
      calories:     nutrition.calories,
      protein:      nutrition.protein,
      carbs:        nutrition.carbs,
      fat:          nutrition.fat,
      serving:      nutrition.serving,
      all_servings: nutrition.allServings,
      food_id:      nutrition.foodId,
    });

  } catch (err) {
    console.error("❌ /analyze error:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
