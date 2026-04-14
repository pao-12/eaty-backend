const express = require("express");
const cors    = require("cors");
require("dotenv").config();

const analyzeRouter = require("./routes/analyze");
const searchRouter  = require("./routes/search");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" })); // imágenes en base64 son grandes

// Rutas
app.use("/analyze", analyzeRouter);
app.use("/search",  searchRouter);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Eaty API corriendo ✅", version: "1.0.0" });
});

app.listen(PORT, () => {
  console.log(`🚀 Eaty backend corriendo en puerto ${PORT}`);
});
