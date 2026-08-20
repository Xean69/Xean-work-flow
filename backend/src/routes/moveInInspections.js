import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { requireString } from "../utils/validate.js";
import { upload, uploadToCloudinary, deleteFromCloudinary } from "../utils/upload.js";

const router = Router();

const CONDITIONS = ["good", "fair", "poor", "damaged"];

// Seeded once when a manager creates a new inspection — a starting point,
// not a fixed enum. Every row it creates is a normal room/item row the
// manager can rename, remove, or add siblings to afterward.
const DEFAULT_TEMPLATE = [
  { name: "Living Room", items: ["Walls", "Floors", "Windows", "Ceiling", "Light Fixtures"] },
  { name: "Kitchen", items: ["Walls", "Floors", "Countertops", "Cabinets", "Appliances", "Sink & Plumbing"] },
  { name: "Bathroom", items: ["Walls", "Floors", "Fixtures", "Ventilation"] },
  { name: "Bedroom", items: ["Walls", "Floors", "Windows", "Closet"] },
  { name: "General", items: ["Smoke Detectors", "Door Locks", "Thermostat/HVAC"] },
];

async function assertTenantInBusiness(tenantId, businessId) {
  const { rows } = await pool.query("SELECT id FROM tenants WHERE id = $1 AND business_id = $2", [
    tenantId,
    businessId,
  ]);
  if (!rows[0]) throw new ApiError(400, "tenant_id does not belong to your business");
}

// Loads the full nested shape (rooms -> items -> photos) for one
// inspection, already confirmed to belong to the business/tenant by the
// caller. Exported so the portal router can reuse it for the tenant's own
// read-only view instead of duplicating this query.
export async function loadInspection(inspectionId) {
  const { rows: inspectionRows } = await pool.query("SELECT * FROM move_in_inspections WHERE id = $1", [
    inspectionId,
  ]);
  const inspection = inspectionRows[0];
  if (!inspection) return null;

  const { rows: rooms } = await pool.query(
    "SELECT * FROM move_in_inspection_rooms WHERE inspection_id = $1 ORDER BY sort_order, id",
    [inspectionId]
  );
  const { rows: items } = await pool.query(
    `SELECT i.* FROM move_in_inspection_items i
     JOIN move_in_inspection_rooms r ON r.id = i.room_id
     WHERE r.inspection_id = $1
     ORDER BY i.sort_order, i.id`,
    [inspectionId]
  );
  const { rows: photos } = await pool.query(
    `SELECT p.* FROM move_in_inspection_photos p
     JOIN move_in_inspection_items i ON i.id = p.item_id
     JOIN move_in_inspection_rooms r ON r.id = i.room_id
     WHERE r.inspection_id = $1
     ORDER BY p.uploaded_at`,
    [inspectionId]
  );

  const photosByItem = new Map();
  for (const p of photos) {
    if (!photosByItem.has(p.item_id)) photosByItem.set(p.item_id, []);
    photosByItem.get(p.item_id).push(p);
  }
  const itemsByRoom = new Map();
  for (const i of items) {
    if (!itemsByRoom.has(i.room_id)) itemsByRoom.set(i.room_id, []);
    itemsByRoom.get(i.room_id).push({ ...i, photos: photosByItem.get(i.id) || [] });
  }

  return {
    ...inspection,
    rooms: rooms.map((r) => ({ ...r, items: itemsByRoom.get(r.id) || [] })),
  };
}

// Every mutation route below calls this first — a finalized inspection is
// locked, so a manager can't quietly alter a report the tenant has already
// reviewed or signed.
async function assertInspectionEditable(inspectionId, businessId) {
  const { rows } = await pool.query(
    "SELECT status FROM move_in_inspections WHERE id = $1 AND business_id = $2",
    [inspectionId, businessId]
  );
  if (!rows[0]) throw new ApiError(404, "Inspection not found");
  if (rows[0].status === "finalized") {
    throw new ApiError(400, "This inspection is finalized and can't be edited");
  }
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.body.tenant_id;
    if (!Number.isInteger(tenantId) && !Number.isInteger(Number(tenantId))) {
      throw new ApiError(400, "tenant_id is required");
    }
    await assertTenantInBusiness(tenantId, req.businessId);

    const { rows: existing } = await pool.query("SELECT id FROM move_in_inspections WHERE tenant_id = $1", [
      tenantId,
    ]);
    if (existing[0]) throw new ApiError(409, "This tenant already has an inspection");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: inspectionRows } = await client.query(
        "INSERT INTO move_in_inspections (business_id, tenant_id) VALUES ($1, $2) RETURNING id",
        [req.businessId, tenantId]
      );
      const inspectionId = inspectionRows[0].id;

      for (let r = 0; r < DEFAULT_TEMPLATE.length; r++) {
        const room = DEFAULT_TEMPLATE[r];
        const { rows: roomRows } = await client.query(
          "INSERT INTO move_in_inspection_rooms (inspection_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id",
          [inspectionId, room.name, r]
        );
        for (let it = 0; it < room.items.length; it++) {
          await client.query(
            "INSERT INTO move_in_inspection_items (room_id, label, sort_order) VALUES ($1, $2, $3)",
            [roomRows[0].id, room.items[it], it]
          );
        }
      }
      await client.query("COMMIT");
      res.status(201).json(await loadInspection(inspectionId));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  "/by-tenant/:tenantId",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id FROM move_in_inspections WHERE tenant_id = $1 AND business_id = $2",
      [req.params.tenantId, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "No inspection for this tenant yet");
    res.json(await loadInspection(rows[0].id));
  })
);

router.post(
  "/:id/rooms",
  asyncHandler(async (req, res) => {
    await assertInspectionEditable(req.params.id, req.businessId);
    const name = requireString(req.body.name, "name");
    const { rows: maxRows } = await pool.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM move_in_inspection_rooms WHERE inspection_id = $1",
      [req.params.id]
    );
    const { rows } = await pool.query(
      "INSERT INTO move_in_inspection_rooms (inspection_id, name, sort_order) VALUES ($1, $2, $3) RETURNING *",
      [req.params.id, name, maxRows[0].next_order]
    );
    res.status(201).json({ ...rows[0], items: [] });
  })
);

router.delete(
  "/:id/rooms/:roomId",
  asyncHandler(async (req, res) => {
    await assertInspectionEditable(req.params.id, req.businessId);
    const { rowCount } = await pool.query(
      "DELETE FROM move_in_inspection_rooms WHERE id = $1 AND inspection_id = $2",
      [req.params.roomId, req.params.id]
    );
    if (!rowCount) throw new ApiError(404, "Room not found");
    res.status(204).end();
  })
);

router.post(
  "/:id/rooms/:roomId/items",
  asyncHandler(async (req, res) => {
    await assertInspectionEditable(req.params.id, req.businessId);
    const { rows: roomRows } = await pool.query(
      "SELECT id FROM move_in_inspection_rooms WHERE id = $1 AND inspection_id = $2",
      [req.params.roomId, req.params.id]
    );
    if (!roomRows[0]) throw new ApiError(404, "Room not found");

    const label = requireString(req.body.label, "label");
    const { rows: maxRows } = await pool.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM move_in_inspection_items WHERE room_id = $1",
      [req.params.roomId]
    );
    const { rows } = await pool.query(
      "INSERT INTO move_in_inspection_items (room_id, label, sort_order) VALUES ($1, $2, $3) RETURNING *",
      [req.params.roomId, label, maxRows[0].next_order]
    );
    res.status(201).json({ ...rows[0], photos: [] });
  })
);

router.put(
  "/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    await assertInspectionEditable(req.params.id, req.businessId);
    const condition = req.body.condition === undefined ? null : req.body.condition;
    if (condition !== null && !CONDITIONS.includes(condition)) {
      throw new ApiError(400, `condition must be one of: ${CONDITIONS.join(", ")}`);
    }
    const notes = req.body.notes === undefined ? null : String(req.body.notes).trim() || null;

    const { rows } = await pool.query(
      `UPDATE move_in_inspection_items i
       SET condition = $1, notes = $2
       FROM move_in_inspection_rooms r
       WHERE i.room_id = r.id AND i.id = $3 AND r.inspection_id = $4
       RETURNING i.*`,
      [condition, notes, req.params.itemId, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Item not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    await assertInspectionEditable(req.params.id, req.businessId);
    const { rowCount } = await pool.query(
      `DELETE FROM move_in_inspection_items i
       USING move_in_inspection_rooms r
       WHERE i.room_id = r.id AND i.id = $1 AND r.inspection_id = $2`,
      [req.params.itemId, req.params.id]
    );
    if (!rowCount) throw new ApiError(404, "Item not found");
    res.status(204).end();
  })
);

router.post(
  "/:id/items/:itemId/photos",
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    await assertInspectionEditable(req.params.id, req.businessId);
    if (!req.file) throw new ApiError(400, "photo is required");

    const { rows: itemRows } = await pool.query(
      `SELECT i.id FROM move_in_inspection_items i
       JOIN move_in_inspection_rooms r ON r.id = i.room_id
       WHERE i.id = $1 AND r.inspection_id = $2`,
      [req.params.itemId, req.params.id]
    );
    if (!itemRows[0]) throw new ApiError(404, "Item not found");

    let uploaded;
    try {
      uploaded = await uploadToCloudinary(req.file.buffer, "xean/inspections");
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      throw new ApiError(502, "Failed to upload photo, please try again");
    }

    const { rows } = await pool.query(
      `INSERT INTO move_in_inspection_photos (item_id, photo_url, cloudinary_public_id, cloudinary_resource_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.itemId, uploaded.url, uploaded.publicId, uploaded.resourceType]
    );
    res.status(201).json(rows[0]);
  })
);

router.delete(
  "/:id/photos/:photoId",
  asyncHandler(async (req, res) => {
    await assertInspectionEditable(req.params.id, req.businessId);
    const { rows } = await pool.query(
      `DELETE FROM move_in_inspection_photos p
       USING move_in_inspection_items i, move_in_inspection_rooms r
       WHERE p.item_id = i.id AND i.room_id = r.id AND p.id = $1 AND r.inspection_id = $2
       RETURNING p.cloudinary_public_id, p.cloudinary_resource_type`,
      [req.params.photoId, req.params.id]
    );
    if (!rows[0]) throw new ApiError(404, "Photo not found");
    deleteFromCloudinary(rows[0].cloudinary_public_id, rows[0].cloudinary_resource_type);
    res.status(204).end();
  })
);

router.put(
  "/:id/finalize",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE move_in_inspections
       SET status = 'finalized', finalized_at = now(), updated_at = now()
       WHERE id = $1 AND business_id = $2 AND status = 'draft'
       RETURNING *`,
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Inspection not found or already finalized");
    res.json(await loadInspection(rows[0].id));
  })
);

export default router;
