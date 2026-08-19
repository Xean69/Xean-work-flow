CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  bathrooms NUMERIC(3,1) NOT NULL DEFAULT 0,
  rent_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant', 'occupied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  lease_start DATE NOT NULL,
  lease_end DATE NOT NULL,
  rent_amount NUMERIC(10,2) NOT NULL,
  deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after the initial tenants table existed; ADD COLUMN IF NOT EXISTS
-- keeps this migration safe to re-run on a database that already has the
-- table without password_hash.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_tenants_unit_id ON tenants(unit_id);

-- A tenant needs a unique email to log in with, but email itself stays
-- optional (property managers won't always have it on file).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  -- NULL means "never opened" — any comment at all counts as unread until
  -- the corresponding side actually opens the ticket's comment thread.
  tenant_last_read_at TIMESTAMPTZ,
  manager_last_read_at TIMESTAMPTZ
);

-- Added after the initial table existed; ADD COLUMN IF NOT EXISTS keeps
-- this migration safe to re-run on a database that predates these columns.
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS tenant_last_read_at TIMESTAMPTZ;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS manager_last_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_unit_id ON maintenance_requests(unit_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_tenant_id ON maintenance_requests(tenant_id);

CREATE TABLE IF NOT EXISTS maintenance_comments (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('tenant', 'manager')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_comments_request_id ON maintenance_comments(request_id);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other' CHECK (doc_type IN ('lease', 'invoice', 'inspection', 'application', 'other')),
  notes TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_property_id ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);

CREATE TABLE IF NOT EXISTS stays (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('airbnb', 'vrbo', 'booking', 'direct')),
  guest_name TEXT NOT NULL,
  checkout_date DATE NOT NULL,
  next_checkin_date DATE NOT NULL,
  turnover_status TEXT NOT NULL DEFAULT 'checkout_done'
    CHECK (turnover_status IN ('checkout_done', 'inspection_done', 'cleaning_done', 'checkin_ready')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stays_unit_id ON stays(unit_id);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id SERIAL PRIMARY KEY,
  stay_id INTEGER REFERENCES stays(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('checkin_instructions', 'welcome', 'checkout_reminder', 'review_request')),
  send_timing TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_stay_id ON scheduled_messages(stay_id);

-- Only one global template (stay_id IS NULL) per message type, per
-- business — the portfolio-wide toggle panel assumes exactly one row per
-- type. Each business gets its own 4 default rows seeded when the business
-- is created (see routes/admin.js's signup handler and the backfill below
-- for existing data), not here — a fresh install has zero businesses, so
-- there's nothing to seed until someone signs up.

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  -- No default: NULL means "uncategorized", which the Expenses page
  -- surfaces as a real, countable state rather than defaulting it away.
  category TEXT CHECK (category IS NULL OR category IN
    ('repairs', 'cleaning', 'landscaping', 'utilities', 'property_tax', 'supplies', 'other')),
  vendor_name TEXT NOT NULL,
  expense_date DATE NOT NULL,
  receipt_file_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_property_id ON expenses(property_id);
CREATE INDEX IF NOT EXISTS idx_expenses_unit_id ON expenses(unit_id);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('tenant', 'manager')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);

-- Property manager dashboard account, separate from the tenants table used
-- by the tenant portal login. Each admin belongs to exactly one business
-- (see the multi-business section below) — this is what scopes everything
-- an admin can see to their own business's data.
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_email ON admins(lower(email));

CREATE TABLE IF NOT EXISTS property_guides (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  section_title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_guides_property_id ON property_guides(property_id);

-- ============================================================================
-- Multi-business support
--
-- Turns this from a single-property-manager app into one where many
-- property management businesses each use their own login and only ever
-- see their own data. Every table a business's data lives in gets a
-- business_id column; every admin belongs to exactly one business.
-- ============================================================================

CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
  business_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_contact_email ON businesses(lower(contact_email));

-- Columns start nullable so this is safe to run against a database that
-- already has rows in it — the backfill below fills them in, then the
-- NOT NULL constraints at the bottom lock the column down for good.
ALTER TABLE admins ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE maintenance_comments ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE stays ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE property_guides ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_admins_business_id ON admins(business_id);
CREATE INDEX IF NOT EXISTS idx_properties_business_id ON properties(business_id);
CREATE INDEX IF NOT EXISTS idx_tenants_business_id ON tenants(business_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_business_id ON maintenance_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_comments_business_id ON maintenance_comments(business_id);
CREATE INDEX IF NOT EXISTS idx_documents_business_id ON documents(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_stays_business_id ON stays(business_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_business_id ON scheduled_messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_property_guides_business_id ON property_guides(business_id);

-- Replaces the old single-column version of this index (one global template
-- per message_type across the whole app) now that business_id exists — each
-- business needs its own 4 defaults.
DROP INDEX IF EXISTS idx_scheduled_messages_global_type;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_messages_global_type
  ON scheduled_messages(business_id, message_type) WHERE stay_id IS NULL;

-- One-time backfill: if this database already had data before business_id
-- existed (i.e. any row is still missing one), attribute all of it to a
-- single "Aalion Properties" business so nothing gets orphaned. Guarded so
-- it's a no-op on a fresh database (nothing to backfill) and a no-op the
-- second time it runs (nothing left with a NULL business_id).
DO $$
DECLARE
  legacy_business_id INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM admins WHERE business_id IS NULL)
     OR EXISTS (SELECT 1 FROM properties WHERE business_id IS NULL) THEN

    SELECT id INTO legacy_business_id FROM businesses WHERE business_name = 'Aalion Properties';

    IF legacy_business_id IS NULL THEN
      INSERT INTO businesses (business_name, contact_email)
      VALUES ('Aalion Properties', COALESCE((SELECT email FROM admins ORDER BY id LIMIT 1), 'owner@aalion.example'))
      RETURNING id INTO legacy_business_id;
    END IF;

    UPDATE admins SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE properties SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE tenants SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE maintenance_requests SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE maintenance_comments SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE documents SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE expenses SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE stays SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE scheduled_messages SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE messages SET business_id = legacy_business_id WHERE business_id IS NULL;
    UPDATE property_guides SET business_id = legacy_business_id WHERE business_id IS NULL;
  END IF;
END $$;

ALTER TABLE admins ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE properties ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE tenants ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE maintenance_requests ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE maintenance_comments ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE stays ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE scheduled_messages ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE property_guides ALTER COLUMN business_id SET NOT NULL;

-- ============================================================================
-- Team roles
--
-- Each business can now have more than one admin login. Every admin has a
-- role — 'owner', 'manager', or 'accountant' — that's what the backend
-- authorizes API requests against (see requireRole in utils/auth.js), not
-- just something the frontend reads to decide what to show.
-- ============================================================================

ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT;

-- Every admin that existed before roles did was, by definition, the sole
-- admin of their business — i.e. its owner. Safe to re-run: nothing left
-- with a NULL role after the first time.
UPDATE admins SET role = 'owner' WHERE role IS NULL;

ALTER TABLE admins ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admins_role_check') THEN
    ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('owner', 'manager', 'accountant'));
  END IF;
END $$;

-- Exactly one owner per business, enforced at the database level (not just
-- app logic) — signup creates the one owner row, and the team invite/role
-- endpoints never allow assigning the 'owner' role, so nothing should ever
-- violate this, but the constraint is what actually guarantees it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_one_owner_per_business ON admins(business_id) WHERE role = 'owner';

-- Edmonton short-term rental business licenses. One property can have many
-- rows over time (each renewal is a new row, preserving history) — the
-- "current" license for a property is whichever has the latest issued_date.
-- Deliberately no status column: like tenants' lease status, it's derived
-- from expiry_date at request time (see computeStatus in
-- routes/strLicenses.js) rather than stored, so it can never go stale
-- sitting untouched in a row after the expiry date passes.
CREATE TABLE IF NOT EXISTS str_licenses (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  license_number TEXT NOT NULL,
  issued_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_str_licenses_business_id ON str_licenses(business_id);
CREATE INDEX IF NOT EXISTS idx_str_licenses_property_id ON str_licenses(property_id);

-- Needed for the Dashboard activity feed (routes/activity.js) to tell an
-- "added" event from an "updated" one and to know when it happened —
-- neither table tracked this before. Defaults to now() so a freshly
-- inserted row's updated_at exactly equals its created_at until something
-- actually edits it; the feed uses that equality to mean "never updated".
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE stays ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Drives the Documents page's "needs review" badge/checkbox and the
-- Dashboard's Intake queue count. New uploads start at 'needs_review';
-- existing documents from before this column existed also backfill to
-- 'needs_review' via the same DEFAULT, which is the honest state for them
-- (nothing has actually reviewed them either).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'needs_review';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_status_check') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_status_check CHECK (status IN ('needs_review', 'reviewed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Manual compliance tracking for now — no AI document-checking yet, so
-- these are entered by hand. clause_reference stays optional (a check
-- doesn't always cite one specific bylaw/RTA section).
CREATE TABLE IF NOT EXISTS compliance_checks (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  clause_reference TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_business_id ON compliance_checks(business_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_property_id ON compliance_checks(property_id);

-- AI document extraction: structured fields pulled from lease/invoice/
-- inspection uploads via the Anthropic API, plus a confidence signal so the
-- UI can flag anything ambiguous rather than silently guessing. Extraction
-- runs once, on upload (or on a manual re-extract), never on every view —
-- extraction_status distinguishes "never attempted" from "tried and
-- failed" from "the user typed it in by hand" from "AI succeeded". Doc
-- types with no extractor (application, other) get 'unsupported' and never
-- call the API at all.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_data JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_confidence TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_status TEXT NOT NULL DEFAULT 'not_run';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_extraction_confidence_check') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_extraction_confidence_check
      CHECK (extraction_confidence IS NULL OR extraction_confidence IN ('high', 'low'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_extraction_status_check') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_extraction_status_check
      CHECK (extraction_status IN ('not_run', 'success', 'failed', 'unsupported', 'manual'));
  END IF;
END $$;

-- Manual rent payment tracking. Recording is deliberate (owner/manager
-- marks a payment received) rather than automatic — there's no online
-- payment processing yet, this is just the record-keeping layer. A
-- tenant's current-period status (Tenants page, portal Home) is derived
-- by summing rows here for period_covered = the current month, not stored
-- anywhere, so it can never go stale independent of the payments it's
-- based on.
CREATE TABLE IF NOT EXISTS rent_payments (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('e_transfer', 'cash', 'cheque', 'other')),
  -- "YYYY-MM" — which month's rent this payment counts toward, independent
  -- of when it was actually paid (e.g. paid a few days early or late).
  period_covered TEXT NOT NULL CHECK (period_covered ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  notes TEXT,
  -- Who recorded it, for accountability — kept even if that admin is later
  -- removed from the team, so the payment record itself never disappears.
  recorded_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rent_payments_business_id ON rent_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_tenant_id ON rent_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_period_covered ON rent_payments(period_covered);

-- AI maintenance triage: urgency/trade classification pulled from the
-- title+description via the Anthropic API the moment a ticket is created,
-- from either the manager dashboard or the tenant portal. Deliberately
-- alongside the existing manual `priority` column, never replacing it —
-- the manager sets priority themselves and can see the AI's read next to
-- it. Runs once, at creation, never on a later view or edit (see
-- ai_classification_status: PUT /:id never touches these columns).
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS ai_urgency TEXT;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS ai_trade TEXT;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS ai_classification_status TEXT NOT NULL DEFAULT 'not_run';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_requests_ai_urgency_check') THEN
    ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_ai_urgency_check
      CHECK (ai_urgency IS NULL OR ai_urgency IN ('high', 'medium', 'low'));
  END IF;
  -- Mirrors the TRADES list in services/maintenanceTriage.js.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_requests_ai_trade_check') THEN
    ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_ai_trade_check
      CHECK (ai_trade IS NULL OR ai_trade IN ('plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest_control', 'locksmith', 'general'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_requests_ai_classification_status_check') THEN
    ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_ai_classification_status_check
      CHECK (ai_classification_status IN ('not_run', 'success', 'failed'));
  END IF;
END $$;

-- Password reset, for both admin and tenant logins. Only the hash of the
-- token is stored (SHA-256, not bcrypt — the token itself is already 256
-- bits of random entropy, so a fast deterministic hash is enough for a
-- WHERE lookup and is the standard approach; bcrypt's per-call salt would
-- make that lookup impossible without scanning every outstanding token).
-- A request for a new token overwrites any previous one, and a successful
-- reset clears both columns — either way the old token stops working,
-- which is what "single-use" means here since nothing else ever reads
-- these columns.
ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

-- Reset tokens are looked up by hash, not by admin/tenant id, so the hash
-- itself needs an index — the account lookup at request-a-reset time
-- already goes through the existing email indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_reset_token_hash ON admins(reset_token_hash) WHERE reset_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_reset_token_hash ON tenants(reset_token_hash) WHERE reset_token_hash IS NOT NULL;

-- File storage moved from local disk to Cloudinary (local storage doesn't
-- survive a deploy). file_path/receipt_file_path are left in place only for
-- rows uploaded before this migration — those old local files are no
-- longer served by the app. New uploads populate the columns below
-- instead; cloudinary_*_id/*_resource_type are what deletion needs
-- (Cloudinary's destroy API takes a public_id + resource_type, not a URL).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cloudinary_resource_type TEXT;
ALTER TABLE documents ALTER COLUMN file_path DROP NOT NULL;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_cloudinary_public_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_cloudinary_resource_type TEXT;

-- AI-generated portfolio insights (Insights page). Regenerated only on
-- demand (never automatically) to control Anthropic API cost, same pattern
-- as Documents' re-extract. insight_generations records one row per
-- "Generate" click, including the honest "not enough data yet" case (zero
-- insights, insufficient_data true) — so that explanation survives a page
-- reload instead of vanishing with the request that produced it. insights
-- holds the individual dismissible cards; a fresh generate call replaces
-- the whole current set rather than accumulating stale analysis on top of
-- it, since a later run reflects the portfolio's current state.
CREATE TABLE IF NOT EXISTS insight_generations (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  insufficient_data BOOLEAN NOT NULL DEFAULT false,
  note TEXT
);

CREATE TABLE IF NOT EXISTS insights (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  icon TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  figures JSONB NOT NULL DEFAULT '[]',
  dismissed BOOLEAN NOT NULL DEFAULT false,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insight_generations_business_id ON insight_generations(business_id);
CREATE INDEX IF NOT EXISTS idx_insights_business_id ON insights(business_id);
