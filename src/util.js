"use strict";
// Pricing / voucher rules — kept byte-for-byte compatible with the exported
// public shop (~/workspace/github-pages/index.html):
//   var FREE_SHIP = 499000, SHIP_FEE = 30000;
//   VOUCHERS = {
//     SAKURA10: { percent: 10, maxDiscount: 200000, minSubtotal: 0 },
//     JAPAN50:  { fixed: 50000, minSubtotal: 500000 }
//   }
//   discount: percent -> min(round(subtotal * pct / 100), maxDiscount);
//             fixed   -> fixed;  discount never exceeds subtotal.
//   shipping: 0 when cart is empty or (subtotal - discount) >= FREE_SHIP,
//             otherwise SHIP_FEE. total = max(0, subtotal - discount + ship).

const FREE_SHIP = 499000;
const SHIP_FEE = 30000;

const VOUCHERS = {
  SAKURA10: { percent: 10, maxDiscount: 200000, minSubtotal: 0, label: "giảm 10% (tối đa 200.000₫)" },
  JAPAN50: { fixed: 50000, minSubtotal: 500000, label: "giảm 50.000₫ cho đơn từ 500.000₫" },
};

function vnd(n) {
  const v = Math.round(Number(n) || 0);
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "₫";
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Returns { ok, code, discount, error } for a voucher against a subtotal.
function applyVoucher(subtotal, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, code: "", discount: 0, error: "" };
  const v = VOUCHERS[code];
  if (!v) return { ok: false, code, discount: 0, error: "Mã giảm giá không hợp lệ." };
  if (subtotal < (v.minSubtotal || 0)) {
    return {
      ok: false,
      code,
      discount: 0,
      error: "Đơn hàng chưa đạt tối thiểu " + vnd(v.minSubtotal) + " để dùng mã " + code + ".",
    };
  }
  let discount = 0;
  if (v.percent) discount = Math.min(Math.round((subtotal * v.percent) / 100), v.maxDiscount || Infinity);
  else if (v.fixed) discount = v.fixed;
  discount = Math.min(discount, subtotal);
  return { ok: true, code, discount, error: "" };
}

// lines: [{ price, qty }] — mirrors totals() in the exported shop.
function computeTotals(lines, voucherCode) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  let discount = 0;
  let voucher = null;
  let voucherError = "";
  if (voucherCode) {
    const r = applyVoucher(subtotal, voucherCode);
    if (r.ok) {
      discount = r.discount;
      voucher = r.code;
    } else {
      voucherError = r.error;
    }
  }
  const shipping = lines.length === 0 || subtotal - discount >= FREE_SHIP ? 0 : SHIP_FEE;
  const total = Math.max(0, subtotal - discount + shipping);
  return { subtotal, discount, shipping, total, voucher, voucherError };
}

// Same shape as the public shop: "SB" + base36 timestamp tail.
const crypto = require("crypto");
function genOrderCode() {
  const tail = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 2);
  return "SB" + tail + rand;
}

function normalizePhone(raw) {
  return String(raw || "").replace(/[\s.\-()]/g, "");
}

function isValidPhone(raw) {
  return /^\+?\d{9,15}$/.test(normalizePhone(raw));
}

const ORDER_STATUSES = ["Mới", "Đã xác nhận", "Đang giao", "Hoàn thành", "Đã hủy"];

module.exports = {
  FREE_SHIP,
  SHIP_FEE,
  VOUCHERS,
  vnd,
  escapeHtml,
  applyVoucher,
  computeTotals,
  genOrderCode,
  normalizePhone,
  isValidPhone,
  ORDER_STATUSES,
};
