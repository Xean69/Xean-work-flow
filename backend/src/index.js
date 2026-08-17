import "dotenv/config";
import express from "express";
import multer from "multer";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pool from "./db.js";
import adminRouter from "./routes/admin.js";
import propertiesRouter from "./routes/properties.js";
import unitsRouter from "./routes/units.js";
import tenantsRouter from "./routes/tenants.js";
import maintenanceRouter from "./routes/maintenance.js";
import documentsRouter from "./routes/documents.js";
import staysRouter from "./routes/stays.js";
import scheduledMessagesRouter from "./routes/scheduledMessages.js";
import expensesRouter from "./routes/expenses.js";
import portalRouter from "./routes/portal.js";
import messagesRouter from "./routes/messages.js";
import guideSectionsRouter from "./routes/guideSections.js";
import importsRouter from "./routes/imports.js";
import { ApiError } from "./utils/errors.js";
import { requireAdminAuth } from "./utils/auth.js";

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

// /api/admin (login/logout) and /api/portal (tenant login) each guard their
// own sub-routes internally, since both need at least one route (login)
// reachable while logged out. Every other manager-dashboard route below
// requires an admin session up front — previously none of these had any
// auth check at all.
app.use("/api/admin", adminRouter);
app.use("/api/portal", portalRouter);

app.use("/api/properties", requireAdminAuth, propertiesRouter);
app.use("/api/units", requireAdminAuth, unitsRouter);
app.use("/api/tenants", requireAdminAuth, tenantsRouter);
app.use("/api/maintenance", requireAdminAuth, maintenanceRouter);
app.use("/api/documents", requireAdminAuth, documentsRouter);
app.use("/api/stays", requireAdminAuth, staysRouter);
app.use("/api/scheduled-messages", requireAdminAuth, scheduledMessagesRouter);
app.use("/api/expenses", requireAdminAuth, expensesRouter);
app.use("/api/messages", requireAdminAuth, messagesRouter);
app.use("/api/guide-sections", requireAdminAuth, guideSectionsRouter);
app.use("/api/import", requireAdminAuth, importsRouter);

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
