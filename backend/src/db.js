import pg from "pg";

const { Pool } = pg;

// Reads the database connection string from the DATABASE_URL environment
// variable (set in backend/.env). Nothing connects until a query is run.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;
