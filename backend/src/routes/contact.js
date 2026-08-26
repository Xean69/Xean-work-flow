import { Router } from "express";
import pool from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { rateLimit } from "../utils/publicRateLimit.js";
import { getClientIp } from "../utils/clientIp.js";
import {
  parseContactInquiryBody,
  parseContactChatBody,
  parseContactDemoBody,
  isHoneypotTripped,
} from "../utils/validate.js";
import { notifyHrOfContactInquiry, notifyHrOfChatMessage, notifyHrOfDemoRequest } from "../services/email.js";

const router = Router();

// The only unauthenticated write path in the app — see schema.sql's
// contact_submissions note and index.js's mount comment. Every route below
// shares one rate-limit bucket per IP (not one per route) so a bot can't
// dodge the limit by spreading requests across the three forms instead of
// hammering one.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }));

// A tripped honeypot returns the exact same success shape a real
// submission gets — never signal to a bot that it was caught — but skips
// both the email and the database insert, so contact_submissions stays a
// record of real inquiries rather than bot noise.
router.post(
  "/inquiry",
  asyncHandler(async (req, res) => {
    if (isHoneypotTripped(req.body)) return res.json({ ok: true });

    const data = parseContactInquiryBody(req.body);
    const sent = await notifyHrOfContactInquiry(data);
    await pool.query(
      `INSERT INTO contact_submissions (type, name, email, phone, message, email_sent, ip)
       VALUES ('inquiry', $1, $2, $3, $4, $5, $6)`,
      [data.name, data.email, data.phone, data.message, sent, getClientIp(req)]
    );
    res.json({ ok: true });
  })
);

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    if (isHoneypotTripped(req.body)) return res.json({ ok: true });

    const data = parseContactChatBody(req.body);
    const sent = await notifyHrOfChatMessage(data);
    await pool.query(
      `INSERT INTO contact_submissions (type, name, email, message, email_sent, ip)
       VALUES ('chat', $1, $2, $3, $4, $5)`,
      [data.name, data.email, data.message, sent, getClientIp(req)]
    );
    res.json({ ok: true });
  })
);

router.post(
  "/demo",
  asyncHandler(async (req, res) => {
    if (isHoneypotTripped(req.body)) return res.json({ ok: true });

    const data = parseContactDemoBody(req.body);
    const sent = await notifyHrOfDemoRequest({
      name: data.name,
      email: data.email,
      phone: data.phone,
      preferredTime: data.preferred_time,
    });
    await pool.query(
      `INSERT INTO contact_submissions (type, name, email, phone, preferred_time, email_sent, ip)
       VALUES ('demo', $1, $2, $3, $4, $5, $6)`,
      [data.name, data.email, data.phone, data.preferred_time, sent, getClientIp(req)]
    );
    res.json({ ok: true });
  })
);

export default router;
