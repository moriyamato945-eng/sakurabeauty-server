"use strict";
const db = require("./db");

// Loads the logged-in customer (if any) onto req.user and the admin flag
// onto req.isAdmin. The admin is a dedicated account defined by env vars
// (ADMIN_USER / ADMIN_PASS), not a row in the users table.
async function loadUser(req, res, next) {
  try {
    req.user = null;
    req.isAdmin = !!(req.session && req.session.isAdmin);
    if (req.session && req.session.userId) {
      const { rows } = await db.query(
        "SELECT id, name, phone, email, address FROM users WHERE id = $1",
        [req.session.userId]
      );
      if (rows.length) req.user = rows[0];
      else delete req.session.userId;
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (!req.user) {
    req.flash("bad", "Vui lòng đăng nhập để tiếp tục.");
    return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    // Server-side block: customers (and guests) never reach Management,
    // even by typing the URL directly.
    if (req.user) {
      return res.status(403).send("Khu vực Quản lý chỉ dành cho tài khoản admin.");
    }
    req.flash("bad", "Vui lòng đăng nhập bằng tài khoản admin.");
    return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  }
  next();
}

function cartCount(req) {
  const cart = (req.session && req.session.cart) || {};
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

module.exports = { loadUser, requireLogin, requireAdmin, cartCount };
