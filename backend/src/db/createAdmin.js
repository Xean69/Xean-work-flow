import "dotenv/config";
import readline from "node:readline";
import pool from "../db.js";
import { hashPassword } from "../utils/auth.js";

const MIN_PASSWORD_LENGTH = 12;

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Masks the password as it's typed (asterisks in place of characters) so it
// never appears in plain text on screen or in shell/terminal scrollback.
function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (chunk) => {
      if (rl.stdoutMuted) originalWrite(chunk.replace(/[^\n]/g, "*"));
      else originalWrite(chunk);
    };
    rl.question(query, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

// Picks which business the new/reset admin login belongs to. This tool is a
// local/emergency fallback now that the normal way to create a business +
// its first admin is the /signup page — so it only needs to handle "there's
// exactly one business" (the common case) or let you pick when there's more
// than one. It never touches other businesses' admins.
async function chooseBusiness() {
  const { rows: businesses } = await pool.query(
    "SELECT id, business_name, contact_email FROM businesses ORDER BY id"
  );

  if (businesses.length === 0) {
    console.log("No business exists yet — creating one.\n");
    const businessName = await ask("Business name: ");
    if (!businessName) throw new Error("Business name is required.");
    const contactEmail = await ask("Business contact email: ");
    if (!contactEmail) throw new Error("Contact email is required.");
    const { rows } = await pool.query(
      "INSERT INTO businesses (business_name, contact_email) VALUES ($1, $2) RETURNING id, business_name",
      [businessName, contactEmail]
    );
    return rows[0];
  }

  if (businesses.length === 1) {
    console.log(`Using the only existing business: ${businesses[0].business_name}\n`);
    return businesses[0];
  }

  console.log("Multiple businesses exist. Choose one:\n");
  businesses.forEach((b) => console.log(`  ${b.id}. ${b.business_name} (${b.contact_email})`));
  const idInput = await ask("\nBusiness id: ");
  const business = businesses.find((b) => String(b.id) === idInput.trim());
  if (!business) throw new Error("That's not one of the listed business ids.");
  return business;
}

try {
  console.log("Set up a property manager dashboard login.\n");

  const business = await chooseBusiness();

  const email = await ask("Admin email: ");
  if (!email) throw new Error("Email is required.");

  const password = await askHidden("Password (min 12 characters): ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const confirmPassword = await askHidden("Confirm password: ");
  if (password !== confirmPassword) {
    throw new Error("Passwords did not match.");
  }

  const passwordHash = await hashPassword(password);

  // Replaces any existing admin(s) for THIS business only — other
  // businesses' logins are untouched.
  await pool.query("DELETE FROM admins WHERE business_id = $1", [business.id]);
  await pool.query("INSERT INTO admins (email, password_hash, business_id) VALUES ($1, $2, $3)", [
    email,
    passwordHash,
    business.id,
  ]);

  console.log(`\nDashboard login created for ${email} (${business.business_name}). Sign in at /login.`);
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
