import "dotenv/config";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;

app.get("/health", (req, res) => {
  res.send("Xean Intake API is running");
});

app.listen(PORT, () => {
  console.log(`Xean Intake API listening on http://localhost:${PORT}`);
});
