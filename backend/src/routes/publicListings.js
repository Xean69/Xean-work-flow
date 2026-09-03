import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { rateLimit } from "../utils/publicRateLimit.js";

const router = Router();

// Generous relative to contact.js's 5/15min — this is a read a real
// prospective tenant browsing the page will hit repeatedly, not a
// spam-prone write, but still worth capping against scraping.
router.use(rateLimit({ windowMs: 60 * 1000, max: 60 }));

// Shared by both lookup routes below (by slug, by custom/subdomain host) —
// everything past "find the site row" is identical regardless of how the
// business was identified.
async function loadListingResponse(site) {
  const { rows: units } = await pool.query(
    `SELECT
       u.id, u.bedrooms, u.bathrooms, u.rent_amount,
       p.name AS property_name, p.address, p.city, p.province,
       o.incentive_text,
       COALESCE(o.advertised_price, u.rent_amount) AS advertised_price,
       COALESCE(o.description, '') AS description
     FROM units u
     JOIN properties p ON p.id = u.property_id
     LEFT JOIN unit_listing_overrides o ON o.unit_id = u.id
     WHERE p.business_id = $1 AND u.status = 'vacant'
     ORDER BY p.name, u.unit_number`,
    [site.business_id]
  );

  const unitIds = units.map((u) => u.id);
  const { rows: photos } = unitIds.length
    ? await pool.query(
        "SELECT unit_id, url FROM unit_listing_photos WHERE unit_id = ANY($1) ORDER BY position, id",
        [unitIds]
      )
    : { rows: [] };

  const photosByUnit = new Map();
  for (const photo of photos) {
    if (!photosByUnit.has(photo.unit_id)) photosByUnit.set(photo.unit_id, []);
    photosByUnit.get(photo.unit_id).push(photo.url);
  }

  return {
    business_name: site.business_name,
    logo_url: site.logo_url,
    contact_email: site.contact_email,
    tagline: site.tagline,
    description: site.description,
    theme: site.theme,
    primary_color: site.primary_color,
    units: units.map((u) => ({
      id: u.id,
      property_name: u.property_name,
      address: u.address,
      city: u.city,
      province: u.province,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      rent_amount: u.rent_amount,
      advertised_price: u.advertised_price,
      incentive_text: u.incentive_text,
      description: u.description,
      photos: photosByUnit.get(u.id) || [],
    })),
  };
}

// Registered before the /:slug route below — Express matches routes in
// registration order, and "/by-host" would otherwise be swallowed by
// "/:slug" (matching with slug = "by-host") and never run.
//
// This mirrors the :slug route below exactly, except the lookup key is the
// incoming Host header instead of a URL param — this is what a visitor to
// <subdomain>.xean.ca actually hits (see frontend/src/App.jsx's
// SubdomainGate and api/client.js's getPublicListingByHost).
//
// Trust boundary: req.hostname is attacker-influenced (anyone can send any
// Host header) but is used here only as an equality lookup key against
// already-verified rows (custom_domain_verified = true) — never
// interpolated into a query, never used for a redirect or anything
// privileged. Same generic 404 as :slug below for both "no such domain"
// and "not verified yet", so this can't be used to probe which subdomains
// are mid-activation.
router.get(
  "/by-host",
  asyncHandler(async (req, res) => {
    const { rows: siteRows } = await pool.query(
      `SELECT bw.*, b.business_name, b.logo_url, b.contact_email
       FROM business_websites bw
       JOIN businesses b ON b.id = bw.business_id
       WHERE bw.custom_domain = $1 AND bw.custom_domain_verified = true AND bw.enabled = true`,
      [req.hostname]
    );
    const site = siteRows[0];
    if (!site) throw new ApiError(404, "This page isn't available");
    res.json(await loadListingResponse(site));
  })
);

// No requireAdminAuth (see index.js) — this is the one read path in the app
// meant to be reachable by anyone on the internet with no login at all.
// Deliberately the same generic 404 whether the slug doesn't exist or just
// isn't published yet, so this can't be used to enumerate which businesses
// have (unpublished) sites.
router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const { rows: siteRows } = await pool.query(
      `SELECT bw.*, b.business_name, b.logo_url, b.contact_email
       FROM business_websites bw
       JOIN businesses b ON b.id = bw.business_id
       WHERE bw.slug = $1 AND bw.enabled = true`,
      [req.params.slug]
    );
    const site = siteRows[0];
    if (!site) throw new ApiError(404, "This page isn't available");
    res.json(await loadListingResponse(site));
  })
);

export default router;
