import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import {
  parseLeaseCreateBody,
  parseLeaseContentBody,
  parseLeaseSendBody,
  parseLeaseVoidBody,
} from "../utils/validate.js";
import { upload, uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";
import { generateLeaseContent, fillLeaseTemplate } from "../services/leaseGeneration.js";

const router = Router();

async function loadTenantFacts(tenantId, businessId) {
  const { rows } = await pool.query(
    `SELECT
       t.id, t.full_name, t.rent_amount, t.deposit_amount, t.lease_start, t.lease_end, t.unit_id,
       u.unit_number, p.address, p.city, p.province, p.postal_code,
       COALESCE(
         (SELECT json_agg(json_build_object('full_name', o.full_name, 'relationship', o.relationship))
          FROM tenant_occupants o WHERE o.tenant_id = t.id),
         '[]'
       ) AS occupants
     FROM tenants t
     JOIN units u ON u.id = t.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE t.id = $1 AND t.business_id = $2`,
    [tenantId, businessId]
  );
  return rows[0] || null;
}

function factsFromSnapshot(lease, tenant) {
  return {
    tenantName: lease.tenant_name_snapshot,
    occupants: lease.occupants_snapshot || [],
    propertyAddress: `${tenant.address}, ${tenant.city}, ${tenant.province} ${tenant.postal_code}`,
    unitNumber: tenant.unit_number,
    rentAmount: lease.rent_amount_snapshot,
    depositAmount: lease.deposit_amount_snapshot,
    leaseStart: lease.lease_start_snapshot,
    leaseEnd: lease.lease_end_snapshot,
    province: tenant.province,
    customTerms: lease.custom_terms,
  };
}

// Custom clauses are the manager's own words, appended verbatim after
// whatever AI produced — never passed through the model, never flagged as
// containing a placeholder.
function appendCustomClauses(sections, customClauses) {
  return [...sections, ...customClauses.map((c) => ({ heading: c.heading, body: c.body, contains_placeholder: false }))];
}

const LEASE_LIST_QUERY = `
  SELECT
    l.id, l.tenant_id, l.unit_id, l.generation_mode, l.status, l.ai_generated,
    l.manager_reviewed_at, l.sent_at, l.signed_at, l.signed_name, l.document_id,
    l.voided_at, l.void_reason, l.created_at, l.updated_at,
    l.tenant_name_snapshot, l.rent_amount_snapshot, l.deposit_amount_snapshot,
    l.lease_start_snapshot, l.lease_end_snapshot,
    p.name AS property_name, u.unit_number
  FROM leases l
  JOIN units u ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE l.business_id = $1
`;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${LEASE_LIST_QUERY} ORDER BY l.created_at DESC`, [req.businessId]);
    res.json(rows);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT l.*, p.name AS property_name, u.unit_number
       FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE l.id = $1 AND l.business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Lease not found");
    res.json(rows[0]);
  })
);

router.post(
  "/",
  upload.single("template_file"),
  asyncHandler(async (req, res) => {
    // Multipart bodies arrive as strings — custom_clauses is sent as a
    // JSON-stringified field so the manager's clause list survives the
    // trip alongside the (optional) template file.
    const rawBody = {
      ...req.body,
      custom_clauses: req.body.custom_clauses ? JSON.parse(req.body.custom_clauses) : undefined,
    };
    const data = parseLeaseCreateBody(rawBody);

    const tenant = await loadTenantFacts(data.tenant_id, req.businessId);
    if (!tenant) throw new ApiError(400, "tenant_id does not belong to your business");

    if (data.generation_mode === "template" && !req.file) {
      throw new ApiError(400, "A template file is required for template mode");
    }
    if (data.generation_mode === "generate") {
      const { rows: bizRows } = await pool.query(
        "SELECT ai_lease_generation_enabled FROM businesses WHERE id = $1",
        [req.businessId]
      );
      if (!bizRows[0]?.ai_lease_generation_enabled) {
        throw new ApiError(403, "AI lease drafting isn't enabled for your business yet — ask the owner to enable it");
      }
    }

    const facts = {
      tenantName: tenant.full_name,
      occupants: tenant.occupants,
      propertyAddress: `${tenant.address}, ${tenant.city}, ${tenant.province} ${tenant.postal_code}`,
      unitNumber: tenant.unit_number,
      rentAmount: tenant.rent_amount,
      depositAmount: tenant.deposit_amount,
      leaseStart: tenant.lease_start,
      leaseEnd: tenant.lease_end,
      province: tenant.province,
      customTerms: data.custom_terms,
    };

    let sections, rawOutput, template = null;
    if (data.generation_mode === "template") {
      try {
        template = await uploadToCloudinary(req.file.buffer, "xean/lease-templates");
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        throw new ApiError(502, "Failed to upload template, please try again");
      }
      try {
        const result = await fillLeaseTemplate({ fileBuffer: req.file.buffer, mediaType: req.file.mimetype, facts });
        sections = result.sections;
        rawOutput = result.rawOutput;
      } catch (err) {
        console.error("Lease template fill failed:", err);
        throw new ApiError(502, "Failed to fill in your template, please try again");
      }
    } else {
      try {
        const result = await generateLeaseContent(facts);
        sections = result.sections;
        rawOutput = result.rawOutput;
      } catch (err) {
        console.error("Lease generation failed:", err);
        throw new ApiError(502, "Failed to draft the lease, please try again");
      }
    }
    sections = appendCustomClauses(sections, data.custom_clauses);

    const { rows } = await pool.query(
      `INSERT INTO leases (
         business_id, tenant_id, unit_id, created_by_admin_id,
         generation_mode, template_file_url, template_cloudinary_public_id, template_cloudinary_resource_type, template_mime_type,
         custom_terms, custom_clauses,
         tenant_name_snapshot, rent_amount_snapshot, deposit_amount_snapshot, lease_start_snapshot, lease_end_snapshot,
         occupants_snapshot, content, ai_raw_output, ai_generated
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true)
       RETURNING *`,
      [
        req.businessId,
        tenant.id,
        tenant.unit_id,
        req.adminId,
        data.generation_mode,
        template?.url || null,
        template?.publicId || null,
        template?.resourceType || null,
        data.generation_mode === "template" ? req.file.mimetype : null,
        data.custom_terms,
        JSON.stringify(data.custom_clauses),
        tenant.full_name,
        tenant.rent_amount,
        tenant.deposit_amount,
        tenant.lease_start,
        tenant.lease_end,
        JSON.stringify(tenant.occupants),
        JSON.stringify({ sections }),
        JSON.stringify(rawOutput),
      ]
    );
    res.status(201).json(rows[0]);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseLeaseContentBody(req.body);
    const { rows } = await pool.query(
      `UPDATE leases SET content = $1, updated_at = now()
       WHERE id = $2 AND business_id = $3 AND status = 'draft'
       RETURNING *`,
      [JSON.stringify(data.content), req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(400, "This lease can't be edited right now");
    res.json(rows[0]);
  })
);

// Re-runs generation from the same snapshotted facts (and, for template
// mode, the same uploaded file, re-fetched from Cloudinary) — discards
// whatever a manager may have hand-edited in content, same "regenerate
// wholesale" behavior as documents.js's /:id/extract.
router.post(
  "/:id/regenerate",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM leases WHERE id = $1 AND business_id = $2 AND status = 'draft'", [
      req.params.id,
      req.businessId,
    ]);
    const lease = rows[0];
    if (!lease) throw new ApiError(400, "This lease can't be regenerated right now");

    const tenant = await loadTenantFacts(lease.tenant_id, req.businessId);
    if (!tenant) throw new ApiError(404, "Tenant not found");
    const facts = factsFromSnapshot(lease, tenant);

    let sections, rawOutput;
    try {
      if (lease.generation_mode === "template") {
        if (!lease.template_file_url) throw new ApiError(400, "The original template file is no longer available");
        const response = await fetch(lease.template_file_url);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        const result = await fillLeaseTemplate({ fileBuffer, mediaType: lease.template_mime_type, facts });
        sections = result.sections;
        rawOutput = result.rawOutput;
      } else {
        const result = await generateLeaseContent(facts);
        sections = result.sections;
        rawOutput = result.rawOutput;
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error("Lease regeneration failed:", err);
      throw new ApiError(502, "Failed to regenerate the lease, please try again");
    }
    sections = appendCustomClauses(sections, lease.custom_clauses || []);

    const { rows: updated } = await pool.query(
      `UPDATE leases SET content = $1, ai_raw_output = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [JSON.stringify({ sections }), JSON.stringify(rawOutput), lease.id]
    );
    res.json(updated[0]);
  })
);

// The mandatory human-review gate: parseLeaseSendBody throws unless
// reviewed_confirmation is exactly `true`, sent only once a manager has
// actually checked the confirmation box client-side. document_id must
// already exist (the client uploads the rendered PDF via the ordinary
// /api/documents endpoint first — that upload is what actually notifies
// the tenant, via the same notifyTenantOfNewDocument every other
// tenant-linked document already triggers) and belong to this tenant.
router.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    const data = parseLeaseSendBody(req.body);
    const { rows: leaseRows } = await pool.query(
      "SELECT * FROM leases WHERE id = $1 AND business_id = $2 AND status = 'draft'",
      [req.params.id, req.businessId]
    );
    const lease = leaseRows[0];
    if (!lease) throw new ApiError(400, "This lease can't be sent right now");

    const { rows: docRows } = await pool.query(
      "SELECT id FROM documents WHERE id = $1 AND business_id = $2 AND tenant_id = $3",
      [data.document_id, req.businessId, lease.tenant_id]
    );
    if (!docRows[0]) throw new ApiError(400, "document_id must be an uploaded document belonging to this tenant");

    const { rows } = await pool.query(
      `UPDATE leases
       SET status = 'sent', document_id = $1, manager_reviewed_at = now(), sent_at = now(), updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [data.document_id, lease.id]
    );

    // Visible in the tenant's in-app Messages thread, same dual-write the
    // bulk-announcement flow uses — the portal has no notification
    // center/badge, so email (fired automatically when the PDF was
    // uploaded via /api/documents, above) plus this thread are the two
    // places a tenant will actually see "ready to sign."
    await pool.query(
      `INSERT INTO messages (business_id, tenant_id, sender, subject, body)
       VALUES ($1, $2, 'manager', 'Your lease is ready to sign', 'Your lease is ready to review and sign — check the Lease tab in your portal.')`,
      [req.businessId, lease.tenant_id]
    );

    res.json(rows[0]);
  })
);

router.post(
  "/:id/void",
  asyncHandler(async (req, res) => {
    const data = parseLeaseVoidBody(req.body);
    const { rows } = await pool.query(
      `UPDATE leases SET status = 'void', voided_at = now(), void_reason = $1, updated_at = now()
       WHERE id = $2 AND business_id = $3 AND status = 'sent'
       RETURNING *`,
      [data.void_reason, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(400, "Only a sent, unsigned lease can be voided");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "DELETE FROM leases WHERE id = $1 AND business_id = $2 AND status = 'draft' RETURNING template_cloudinary_public_id, template_cloudinary_resource_type",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(400, "Only a draft lease can be deleted");
    deleteFromCloudinary(rows[0].template_cloudinary_public_id, rows[0].template_cloudinary_resource_type);
    res.status(204).end();
  })
);

export default router;
