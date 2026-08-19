import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/errors.js";
import { gatherPortfolioData, generatePortfolioInsights } from "../services/insights.js";

const router = Router();

async function loadInsightsState(businessId) {
  const [{ rows: insights }, { rows: generations }] = await Promise.all([
    pool.query(
      "SELECT * FROM insights WHERE business_id = $1 AND dismissed = false ORDER BY generated_at DESC, id DESC",
      [businessId]
    ),
    pool.query(
      "SELECT generated_at, insufficient_data, note FROM insight_generations WHERE business_id = $1 ORDER BY generated_at DESC LIMIT 1",
      [businessId]
    ),
  ]);
  return { insights, last_generation: generations[0] || null };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await loadInsightsState(req.businessId));
  })
);

// Deliberately not run automatically on GET — each click is a real
// Anthropic API call, so regeneration is a manual, cost-aware action, same
// as Documents' re-extract. A fresh batch replaces whatever was showing
// before (including anything not yet dismissed), since a new analysis
// reflects the portfolio's current state and stale findings shouldn't
// linger alongside it.
router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const portfolioData = await gatherPortfolioData(req.businessId);
    const result = await generatePortfolioInsights(portfolioData);

    if (result.status === "failed") {
      throw new ApiError(502, "Insight generation failed, please try again");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM insights WHERE business_id = $1", [req.businessId]);
      const { rows: genRows } = await client.query(
        "INSERT INTO insight_generations (business_id, insufficient_data, note) VALUES ($1, $2, $3) RETURNING generated_at, insufficient_data, note",
        [req.businessId, result.insufficient_data, result.note]
      );
      for (const insight of result.insights) {
        await client.query(
          `INSERT INTO insights (business_id, icon, title, description, reasoning, figures)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.businessId, insight.icon, insight.title, insight.description, insight.reasoning, JSON.stringify(insight.figures)]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json(await loadInsightsState(req.businessId));
  })
);

router.put(
  "/:id/dismiss",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "UPDATE insights SET dismissed = true WHERE id = $1 AND business_id = $2 RETURNING id",
      [req.params.id, req.businessId]
    );
    if (!rows[0]) throw new ApiError(404, "Insight not found");
    res.status(204).end();
  })
);

export default router;
