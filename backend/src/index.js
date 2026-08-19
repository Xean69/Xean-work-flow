import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pool from "./db.js";
import adminRouter from "./routes/admin.js";
import propertiesRouter from "./routes/properties.js";
import unitsRouter from "./routes/units.js";
import tenantsRouter from "./routes/tenants.js";
import rentPaymentsRouter from "./routes/rentPayments.js";
import maintenanceRouter from "./routes/maintenance.js";
import documentsRouter from "./routes/documents.js";
import staysRouter from "./routes/stays.js";
import scheduledMessagesRouter from "./routes/scheduledMessages.js";
import expensesRouter from "./routes/expenses.js";
import portalRouter from "./routes/portal.js";
import messagesRouter from "./routes/messages.js";
import guideSectionsRouter from "./routes/guideSections.js";
import importsRouter from "./routes/imports.js";
import teamRouter from "./routes/team.js";
import ownerStatementsRouter from "./routes/ownerStatements.js";
import strLicensesRouter from "./routes/strLicenses.js";
import activityRouter from "./routes/activity.js";
import complianceChecksRouter from "./routes/complianceChecks.js";
import insightsRouter from "./routes/insights.js";
import { ApiError } from "./utils/errors.js";
import { requireAdminAuth, requireRole } from "./utils/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Set only when the frontend is hosted on a different origin than this API
// (e.g. Vercel calling Railway) — comma-separated list of allowed origins.
// Unset in local dev, where Vite's dev-server proxy makes every request
// same-origin already, so neither CORS nor a cross-site cookie is needed.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : null;

if (corsOrigins) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
}

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
      // A cross-site cookie (frontend and API on different origins) needs
      // SameSite=None, which browsers only honor alongside Secure — fine
      // in production (Railway is HTTPS-only), but Secure would silently
      // drop the cookie over the plain-HTTP local dev server, so this
      // only switches on when CORS_ORIGIN says the origins actually differ.
      sameSite: corsOrigins ? "none" : "lax",
      secure: !!corsOrigins,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

app.get("/health", (req, res) => {
  res.send("Xean API is running");
});

// /api/admin (login/logout) and /api/portal (tenant login) each guard their
// own sub-routes internally, since both need at least one route (login)
// reachable while logged out. Every other manager-dashboard route below
// requires an admin session up front — previously none of these had any
// auth check at all.
app.use("/api/admin", adminRouter);
app.use("/api/portal", portalRouter);

// Accountants are read-only on documents/expenses and have no access at
// all to anything else here — the mount-level check below only covers the
// "no access at all" half for the other routers; documents.js and
// expenses.js each additionally gate their own write routes (POST/PUT/
// DELETE) to owner/manager, since GET stays open to accountants too.
const staffOnly = requireRole("owner", "manager");
const anyRole = requireRole("owner", "manager", "accountant");

app.use("/api/properties", requireAdminAuth, staffOnly, propertiesRouter);
app.use("/api/units", requireAdminAuth, staffOnly, unitsRouter);
app.use("/api/tenants", requireAdminAuth, staffOnly, tenantsRouter);
// Read access for accountants (they don't reach the Tenants page itself,
// but do need this to make sense of Expenses/Owner Statements) — write
// routes are gated staff-only inside rentPayments.js, same pattern as
// documents.js and expenses.js.
app.use("/api/rent-payments", requireAdminAuth, anyRole, rentPaymentsRouter);
app.use("/api/maintenance", requireAdminAuth, staffOnly, maintenanceRouter);
app.use("/api/documents", requireAdminAuth, anyRole, documentsRouter);
app.use("/api/stays", requireAdminAuth, staffOnly, staysRouter);
app.use("/api/scheduled-messages", requireAdminAuth, staffOnly, scheduledMessagesRouter);
app.use("/api/expenses", requireAdminAuth, anyRole, expensesRouter);
app.use("/api/messages", requireAdminAuth, staffOnly, messagesRouter);
app.use("/api/guide-sections", requireAdminAuth, staffOnly, guideSectionsRouter);
app.use("/api/import", requireAdminAuth, staffOnly, importsRouter);
app.use("/api/team", requireAdminAuth, requireRole("owner"), teamRouter);
app.use("/api/owner-statements", requireAdminAuth, anyRole, ownerStatementsRouter);
app.use("/api/str-licenses", requireAdminAuth, staffOnly, strLicensesRouter);
// Role-aware internally (see routes/activity.js) rather than blocked at
// the mount level — an accountant gets a real, correctly-scoped feed
// (documents/expenses only) instead of a 403, on the off chance this ever
// gets surfaced somewhere an accountant can reach (it isn't yet; the
// Dashboard page itself is owner/manager only).
app.use("/api/activity", requireAdminAuth, anyRole, activityRouter);
// Owner/manager only — compliance isn't financial, so it's not part of
// the accountant's read-only allowance the way expenses/documents are.
app.use("/api/compliance-checks", requireAdminAuth, staffOnly, complianceChecksRouter);
// Owner/manager only, matching the Insights page itself (see
// frontend/src/utils/permissions.js) — a decision-making tool for
// management, not something accountants need, and regenerating costs a
// real Anthropic API call.
app.use("/api/insights", requireAdminAuth, staffOnly, insightsRouter);

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
  console.log(`Xean API listening on http://localhost:${PORT}`);
});
