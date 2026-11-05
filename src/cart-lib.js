"use strict";
const db = require("./db");
const { computeTotals } = require("./util");

// Cart lives in the session as { productId: qty }. Lines are re-read from
// the products table on every request so price/stock are always current.
async function getCartLines(req) {
  const cart = (req.session && req.session.cart) || {};
  const ids = Object.keys(cart).map((k) => parseInt(k, 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT * FROM products WHERE id IN (${ids.map((_, i) => "$" + (i + 1)).join(",")})`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) continue;
    let qty = Math.max(1, parseInt(cart[id], 10) || 1);
    if (p.stock > 0) qty = Math.min(qty, p.stock);
    lines.push({ ...p, qty });
  }
  return lines;
}

async function getCartTotals(req) {
  const lines = await getCartLines(req);
  const totals = computeTotals(lines, req.session.voucher || null);
  return { lines, totals };
}

async function getOrderWithItems(whereSql, param) {
  const { rows } = await db.query(`SELECT * FROM orders WHERE ${whereSql} LIMIT 1`, [param]);
  if (!rows.length) return null;
  const order = rows[0];
  const items = await db.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [order.id]);
  order.items = items.rows;
  return order;
}

const BASE_CATEGORIES = ["Chăm sóc da", "Chống nắng", "Làm sạch", "Chăm sóc tóc", "Trang điểm", "Chăm sóc cơ thể"];

async function listCategories() {
  const { rows } = await db.query("SELECT DISTINCT category FROM products WHERE category <> '' ORDER BY category");
  const cats = [...BASE_CATEGORIES];
  for (const r of rows) if (!cats.includes(r.category)) cats.push(r.category);
  return cats;
}

module.exports = { getCartLines, getCartTotals, getOrderWithItems, listCategories, BASE_CATEGORIES };
