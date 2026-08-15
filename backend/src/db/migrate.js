import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pool from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf8");

try {
  await pool.query(schema);
  console.log("Migration complete: all tables are up to date.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
