"use strict";
const express = require("express");
const db = require("../db");
const views = require("../views");
const { cartCount } = require("../middleware");
const { getCartLines, getCartTotals, getOrderWithItems } = require("../cart-lib");
const { applyVoucher, genOrderCode, normalizePhone, isValidPhone } = require("../util");

const router = express.Router();

function base(req, extra) {
  return Object.assign({ cartCount: cartCount(req), flash: req.takeFlash() }, extra);
}

function backToCart(req, res) {
  res.redirect("/cart");
}

router.post("/cart/add", async (req, res, next) => {
  try {
    const productId = parseInt(req.body.productId, 10);
    const qty = Math.max(1, parseInt(req.body.qty, 10) || 1);
    const { rows } = await db.query("SELECT id, name, stock FROM products WHERE id = $1", [productId]);
    if (!rows.length) {
      req.flash("bad", "Sản phẩm không tồn tại.");
      return backToCart(req, res);
    }
    const p = rows[0];
    if (p.stock <= 0) {
      req.flash("bad", "Sản phẩm đã hết hàng.");
      return res.redirect("/product/" + p.id);
    }
    if (!req.session.cart) req.session.cart = {};
    const current = parseInt(req.session.cart[productId], 10) || 0;
    req.session.cart[productId] = Math.min(current + qty, p.stock);
    req.flash("ok", "Đã thêm " + p.name + " vào giỏ hàng.");
    res.redirect("/cart");
  } catch (err) {
    next(err);
  }
});

router.post("/cart/update", (req, res) => {
  const productId = String(parseInt(req.body.productId, 10));
  const qty = parseInt(req.body.qty, 10) || 0;
  if (!req.session.cart) req.session.cart = {};
  if (qty <= 0) delete req.session.cart[productId];
  else req.session.cart[productId] = qty;
  res.redirect("/cart");
});

router.post("/cart/remove", (req, res) => {
  const productId = String(parseInt(req.body.productId, 10));
  if (req.session.cart) delete req.session.cart[productId];
  res.redirect("/cart");
});

router.get("/cart", async (req, res, next) => {
  try {
    const { lines, totals } = await getCartTotals(req);
    res.send(views.cartPage(req, base(req, { lines, totals, voucher: totals.voucher || req.session.voucher || "" })));
  } catch (err) {
    next(err);
  }
});

router.post("/cart/voucher", async (req, res, next) => {
  try {
    const lines = await getCartLines(req);
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const r = applyVoucher(subtotal, req.body.code);
    if (r.ok) {
      req.session.voucher = r.code;
      req.flash("ok", "Đã áp dụng mã " + r.code + ".");
    } else {
      delete req.session.voucher;
      req.flash("bad", r.error || "Mã giảm giá không hợp lệ.");
    }
    res.redirect(req.body.from === "checkout" ? "/checkout" : "/cart");
  } catch (err) {
    next(err);
  }
});

router.post("/cart/voucher/remove", (req, res) => {
  delete req.session.voucher;
  res.redirect("/cart");
});

router.get("/checkout", async (req, res, next) => {
  try {
    const { lines, totals } = await getCartTotals(req);
    if (!lines.length) {
      req.flash("bad", "Giỏ hàng đang trống.");
      return res.redirect("/cart");
    }
    const saved = req.session.checkoutForm || {};
    const form = {
      name: saved.name || (req.user ? req.user.name : "") || "",
      phone: saved.phone || (req.user ? req.user.phone : "") || "",
      address: saved.address || (req.user ? req.user.address : "") || "",
      note: saved.note || "",
      payment: saved.payment || "COD",
    };
    res.send(
      views.checkoutPage(req, base(req, { lines, totals, voucher: req.session.voucher || "", form, errors: [] }))
    );
  } catch (err) {
    next(err);
  }
});

router.post("/checkout", async (req, res, next) => {
  const client = await db.getPool().connect();
  try {
    const form = {
      name: String(req.body.name || "").trim(),
      phone: normalizePhone(req.body.phone),
      address: String(req.body.address || "").trim(),
      note: String(req.body.note || "").trim(),
      payment: req.body.payment === "BANK" ? "BANK" : "COD",
    };
    req.session.checkoutForm = form;
    const voucherInput = String(req.body.voucher || "").trim();
    if (voucherInput) req.session.voucher = voucherInput.toUpperCase();
    else delete req.session.voucher;

    const { lines, totals } = await getCartTotals(req);
    const errors = [];
    if (!lines.length) errors.push("Giỏ hàng đang trống.");
    if (!form.name) errors.push("Vui lòng nhập họ và tên.");
    if (!isValidPhone(form.phone)) errors.push("Số điện thoại chưa hợp lệ.");
    if (!form.address) errors.push("Vui lòng nhập địa chỉ nhận hàng.");
    if (voucherInput && totals.voucherError) errors.push(totals.voucherError);
    if (errors.length) {
      return res.status(400).send(
        views.checkoutPage(req, base(req, { lines, totals, voucher: req.session.voucher || "", form, errors }))
      );
    }

    await client.query("BEGIN");
    // Re-check stock under lock so two buyers cannot oversell the last item.
    const locked = new Map();
    for (const line of lines) {
      const st = await client.query("SELECT stock, sold, name FROM products WHERE id = $1 FOR UPDATE", [line.id]);
      const row = st.rows[0];
      const stock = row ? row.stock : 0;
      if (!row || stock < line.qty) {
        await client.query("ROLLBACK");
        req.flash("bad", `Sản phẩm "${line.name}" chỉ còn ${stock} trong kho — vui lòng giảm số lượng.`);
        return res.redirect("/cart");
      }
      locked.set(line.id, row);
    }
    let order = null;
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      const code = genOrderCode();
      try {
        const ins = await client.query(
          `INSERT INTO orders (code, user_id, customer_name, phone, address, note, payment,
                               subtotal, discount, shipping, total, voucher)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            code, req.user ? req.user.id : null, form.name, form.phone, form.address,
            form.note, form.payment, totals.subtotal, totals.discount, totals.shipping,
            totals.total, totals.voucher,
          ]
        );
        order = ins.rows[0];
      } catch (e) {
        if (e.code !== "23505" || attempt === 4) throw e; // unique violation on code -> retry
      }
    }
    for (const line of lines) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, product_name, price, qty) VALUES ($1,$2,$3,$4,$5)",
        [order.id, line.id, line.name, line.price, line.qty]
      );
      const row = locked.get(line.id);
      await client.query("UPDATE products SET stock = $1, sold = $2 WHERE id = $3", [
        row.stock - line.qty,
        row.sold + line.qty,
        line.id,
      ]);
    }
    await client.query("COMMIT");

    delete req.session.cart;
    delete req.session.voucher;
    delete req.session.checkoutForm;
    res.redirect("/order/success/" + order.code);
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    next(err);
  } finally {
    client.release();
  }
});

router.get("/order/success/:code", async (req, res, next) => {
  try {
    const order = await getOrderWithItems("code = $1", String(req.params.code));
    if (!order) return res.status(404).send("Không tìm thấy đơn hàng.");
    res.send(views.orderSuccessPage(req, base(req, { order })));
  } catch (err) {
    next(err);
  }
});

router.get("/orders/lookup", async (req, res, next) => {
  try {
    const phone = normalizePhone(req.query.phone || "");
    let orders = [];
    if (phone) {
      const { rows } = await db.query("SELECT id FROM orders WHERE phone = $1 ORDER BY created_at DESC LIMIT 20", [phone]);
      for (const r of rows) orders.push(await getOrderWithItems("id = $1", r.id));
    }
    res.send(views.lookupPage(req, base(req, { phone, orders })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
