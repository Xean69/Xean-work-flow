import "dotenv/config";
import express from "express";
import multer from "multer";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pool from "./db.js";
import propertiesRouter from "./routes/properties.js";
import unitsRouter from "./routes/units.js";
import tenantsRouter from "./routes/tenants.js";
import maintenanceRouter from "./routes/maintenance.js";
import documentsRouter from "./routes/documents.js";
import staysRouter from "./routes/stays.js";
import scheduledMessagesRouter from "./routes/scheduledMessages.js";
import expensesRouter from "./routes/expenses.js";
import portalRouter from "./routes/portal.js";
import { ApiError } from "./utils/errors.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Session store lives in the same Postgres database — no extra
// infrastructure (like Redis) needed for a single-server app like this.
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

app.get("/health", (req, res) => {
  res.send("Xean Intake API is running");
});

app.use("/api/properties", propertiesRouter);
app.use("/api/units", unitsRouter);
app.use("/api/tenants", tenantsRouter);
app.use("/api/maintenance", maintenanceRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/stays", staysRouter);
app.use("/api/scheduled-messages", scheduledMessagesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/portal", portalRouter);

// Central error handler: ApiError carries its own status code, a MulterError
// means an upload was rejected (e.g. too large), anything else is
// unexpected.
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Xean Intake API listening on http://localhost:${PORT}`);
});
