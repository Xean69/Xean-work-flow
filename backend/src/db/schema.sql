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
