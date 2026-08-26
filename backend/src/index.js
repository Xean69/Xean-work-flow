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
import rentPaymentsRouter from "./routes/rentPayments.js";
import maintenanceRouter from "./routes/maintenance.js";
import documentsRouter from "./routes/documents.js";
import staysRouter from "./routes/stays.js";
import scheduledMessagesRouter from "./routes/scheduledMessages.js";
import expensesRouter from "./routes/expenses.js";
import portalRouter from "./routes/portal.js";
import messagesRouter from "./routes/messages.js";
import addonsRouter from "./routes/addons.js";
import tenantOccupantsRouter from "./routes/tenantOccupants.js";
import evictionEventsRouter from "./routes/evictionEvents.js";
import importsRouter from "./routes/imports.js";
import teamRouter from "./routes/team.js";
import maintenanceStaffRouter from "./routes/staff.js";
import ownerStatementsRouter from "./routes/ownerStatements.js";
import strLicensesRouter from "./routes/strLicenses.js";
import activityRouter from "./routes/activity.js";
import complianceChecksRouter from "./routes/complianceChecks.js";
import insightsRouter from "./routes/insights.js";
import moveInInspectionsRouter from "./routes/moveInInspections.js";
import chargesRouter from "./routes/charges.js";
import recurringChargesRouter from "./routes/recurringCharges.js";
import contactRouter from "./routes/contact.js";
import { startLedgerScheduler } from "./services/scheduler.js";
import { ApiError } from "./utils/errors.js";
import { requireAdminAuth, requireRole } from "./utils/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Railway (like most PaaS) terminates TLS at its edge and forwards plain
// HTTP to this container, so without this, Express has no way to know the
// original request was actually HTTPS. That matters here specifically
// because the session cookie below sets secure: true in production —
// without trust proxy, Express treats every request as insecure and
// express-session silently drops the Set-Cookie header rather than send a
// secure cookie over what it believes is plain HTTP. Login would appear to
// succeed (200, correct body) with no session ever actually created.
app.set("trust proxy", 1);

// The deployed frontend (Vercel) proxies /api/* straight through to this
// backend at the edge (see frontend/vercel.json) rather than calling it
// cross-origin — so as far as any browser is concerned, this API is always
// same-site with whatever's calling it. No CORS handling needed, and no
// SameSite=None cookie either (that combination is what got silently
// dropped by Safari's ITP on mobile — SameSite=None only controls whether a
// cookie's *allowed* cross-site, it doesn't override a browser's own
// third-party-cookie blocking, which was the actual cause). Proxying
// through the same site sidesteps that whole class of problem instead of
// fighting individual mobile browsers' cookie policies.
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
      // Lax is the right default now that the frontend and this API are
      // always same-site (proxied, see above) — no cross-site case left to
      // handle. Secure only turns on when actually deployed on Railway
      // (RAILWAY_ENVIRONMENT is one of Railway's own injected vars): local
      // dev runs over plain HTTP, and a Secure cookie is silently refused
      // by the browser there.
      sameSite: "lax",
      secure: process.env.RAILWAY_ENVIRONMENT === "production",
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
// A third, separate login surface alongside admin/portal — same pattern:
// its own sub-routes handle their own auth internally (requireStaffAuth,
// applied per-route inside staff.js), never gated by requireAdminAuth.
app.use("/api/staff", maintenanceStaffRouter);
// The landing page's three "Contact Us" forms — genuinely unauthenticated,
// unlike everything else mounted here (admin/portal/staff each require
// *some* login, just via different session fields). No requireAdminAuth,
// no business scope: this is the only public write path in the app, open
// to anyone on the internet. Its own rate limiter (see
// utils/publicRateLimit.js) and honeypot check are the only things
// standing between this and unbounded abuse — see routes/contact.js and
// schema.sql's contact_submissions note for the full reasoning.
app.use("/api/contact", contactRouter);

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
app.use("/api/addons", requireAdminAuth, staffOnly, addonsRouter);
app.use("/api/occupants", requireAdminAuth, staffOnly, tenantOccupantsRouter);
app.use("/api/eviction-events", requireAdminAuth, staffOnly, evictionEventsRouter);
app.use("/api/charges", requireAdminAuth, staffOnly, chargesRouter);
app.use("/api/recurring-charges", requireAdminAuth, staffOnly, recurringChargesRouter);
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
// Owner/manager only, same reasoning as compliance-checks — not a
// bookkeeping concern, so accountants get no access at all here.
app.use("/api/move-in-inspections", requireAdminAuth, staffOnly, moveInInspectionsRouter);

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

startLedgerScheduler();
