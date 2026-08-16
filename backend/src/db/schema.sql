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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_unit_id ON tenants(unit_id);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_unit_id ON maintenance_requests(unit_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_tenant_id ON maintenance_requests(tenant_id);

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

-- Only one global template (stay_id IS NULL) per message type — the
-- portfolio-wide toggle panel assumes exactly one row per type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_messages_global_type
  ON scheduled_messages(message_type) WHERE stay_id IS NULL;

-- Seeds the 4 default global templates once; safe to re-run.
INSERT INTO scheduled_messages (message_type, send_timing, is_active)
VALUES
  ('checkin_instructions', '24h_before_checkin', true),
  ('welcome', 'on_arrival', true),
  ('checkout_reminder', '8am_checkout_day', true),
  ('review_request', '2h_after_checkout', false)
ON CONFLICT (message_type) WHERE stay_id IS NULL DO NOTHING;

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
