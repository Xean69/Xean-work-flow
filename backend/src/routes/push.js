import { Router } from "express";

const router = Router();

// Unauthenticated — a VAPID public key is meant to be public (it's what
// PushManager.subscribe's applicationServerKey needs client-side, before
// any of the three portals' own login has necessarily happened yet).
router.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

export default router;
