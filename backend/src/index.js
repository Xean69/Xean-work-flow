import "dotenv/config";
import express from "express";
import propertiesRouter from "./routes/properties.js";
import unitsRouter from "./routes/units.js";
import { ApiError } from "./utils/errors.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (req, res) => {
  res.send("Xean Intake API is running");
});

app.use("/api/properties", propertiesRouter);
app.use("/api/units", unitsRouter);

// Central error handler: ApiError carries its own status code, anything
// else is an unexpected failure.
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Xean Intake API listening on http://localhost:${PORT}`);
});
