"use strict";
// Postgres access (Neon on Render in production). All persistent state lives
// here — the local filesystem on Render's free tier is ephemeral and is never
// used for data or uploads.
const { Pool } = require("pg");
const config = require("./config");
const catalog = require("./catalog-data");

let pool = null;

function createPool() {
  const url = config.databaseUrl;
  const needsSsl =
    !/localhost|127\.0\.0\.1/.test(url) && !/sslmode=disable/.test(url);
  return new Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
}

function getPool() {
  if (!pool) pool = createPool();
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

async function waitForDb(attempts = 15, delayMs = 2000) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      await query("SELECT 1");
      return;
    } catch (err) {
      lastErr = err;
      console.log(`[db] connection attempt ${i}/${attempts} failed (${err.code || err.message}); retrying...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  old_price INTEGER,
  size TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  bestseller BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  payment TEXT NOT NULL DEFAULT 'COD',
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  shipping INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  voucher TEXT,
  status TEXT NOT NULL DEFAULT 'Mới',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`;

async function seedProductsIfEmpty() {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM products");
  if (rows[0].n > 0) return;
  console.log(`[db] seeding ${catalog.length} products...`);
  // Seeding only runs on an empty table, so serial ids are assigned in
  // catalog order and match the source shop's product ids (1..17).
  for (const p of catalog) {
    await query(
      `INSERT INTO products (name, brand, category, price, old_price, size, stock, sold,
                             featured, bestseller, description, benefits, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        p.name, p.brand, p.category, p.price, p.oldPrice, p.size, p.stock,
        p.sold, p.featured, p.bestseller, p.description, p.benefits, p.imageUrl,
      ]
    );
  }
}

async function init() {
  await waitForDb();
  await query(SCHEMA);
  await seedProductsIfEmpty();
  console.log("[db] schema ready");
}

module.exports = { getPool, query, init };
