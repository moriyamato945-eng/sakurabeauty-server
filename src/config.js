"use strict";
// Central configuration, all from environment variables.
const crypto = require("crypto");

const sessionSecret = process.env.SESSION_SECRET || null;
if (!sessionSecret) {
  // Not fatal: sessions live server-side in Postgres and the cookie value is
  // a 256-bit random id; the HMAC key just becomes per-boot (all cookies are
  // invalidated on restart). Set SESSION_SECRET in production.
  console.warn(
    "[config] SESSION_SECRET is not set — using an ephemeral random secret. " +
      "Existing login cookies will be invalidated on every restart."
  );
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL || null,
  sessionSecret: sessionSecret || crypto.randomBytes(32).toString("hex"),
  adminUser: process.env.ADMIN_USER || "admin",
  adminPass: process.env.ADMIN_PASS || "admin123",
  // Optional: shown to customers who pick bank transfer (e.g.
  // "Vietcombank 0123456789 — NGUYEN CAO THIEN"). When empty, the shop's
  // original wording is used ("shop sẽ liên hệ gửi thông tin chuyển khoản").
  bankInfo: process.env.BANK_INFO || "",
  shopName: "Sakura Beauty",
};
