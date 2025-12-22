import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const run = async () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration completed.');
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
