import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { parseAddonBody } from "../utils/validate.js";

const router = Router();

// GET /api/addons - every addon across the business, with its property_id
// so the Tenants page can filter to whichever property a tenant's unit
// belongs to. One list call up front, same pattern as how vacant units are
// already loaded for the tenant form.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM property_addons WHERE business_id = $1 ORDER BY property_id, name",
      [req.businessId]
    );
    res.json(rows);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = parseAddonBody(req.body);
    const { rows } = await pool.query(
      `UPDATE property_addons
       SET name = $1, monthly_price = $2
       WHERE id = $3 AND business_id = $4
       RETURNING *`,
      [data.name, data.monthly_price, req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Addon not found");
    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        "DELETE FROM property_addons WHERE id = $1 AND business_id = $2",
        [req.params.id, req.businessId]
      );
      if (!rowCount) throw new ApiError(404, "Addon not found");
      res.status(204).end();
    } catch (err) {
      // FK violation from tenant_addons.addon_id's ON DELETE RESTRICT — the
      // addon is still applied to at least one tenant's lease.
      if (err.code === "23503") {
        throw new ApiError(409, "This addon is still applied to one or more tenants — remove it from their leases first.");
      }
      throw err;
    }
  })
);

export default router;
