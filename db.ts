import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Supabase pooler + Render: bez CA, wymuś SSL i nie waliduj CA
    rejectUnauthorized: false,
  },
  max: 1,
});

export const db = drizzle(pool, { schema });
