"use strict";
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const views = require("../views");
const config = require("../config");
const mailer = require("../mailer");
const { cartCount, requireLogin } = require("../middleware");
const { getOrderWithItems } = require("../cart-lib");
const { normalizePhone, isValidPhone } = require("../util");

const router = express.Router();

function base(req, extra) {
  return Object.assign({ cartCount: cartCount(req), flash: req.takeFlash() }, extra);
}

function safeNext(next) {
  const n = String(next || "");
  // Customers never land in the admin area after login.
  if (n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/admin")) return n;
  return "/";
}

/* ---------- Register / login / logout ---------- */

router.get("/register", (req, res) => {
  if (req.isAdmin) return res.redirect("/admin");
  if (req.user) return res.redirect("/account");
  res.send(views.registerPage(req, base(req, { form: {} })));
});

router.post("/register", async (req, res, next) => {
  try {
    const form = {
      name: String(req.body.name || "").trim(),
      phone: normalizePhone(req.body.phone),
      email: String(req.body.email || "").trim(),
      password: String(req.body.password || ""),
      password2: String(req.body.password2 || ""),
    };
    const fail = (msg) => {
      req.flash("bad", msg);
      return res.status(400).send(views.registerPage(req, base(req, { form })));
    };
    if (!isValidPhone(form.phone)) return fail("Số điện thoại chưa hợp lệ.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return fail("Email chưa hợp lệ.");
    if (form.password.length < 6) return fail("Mật khẩu cần ít nhất 6 ký tự.");
    if (form.password !== form.password2) return fail("Hai mật khẩu nhập lại không khớp.");
    const existing = await db.query("SELECT id FROM users WHERE phone = $1", [form.phone]);
    if (existing.rows.length) return fail("Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.");
    const hash = await bcrypt.hash(form.password, 10);
    const ins = await db.query(
      "INSERT INTO users (name, phone, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
      [form.name, form.phone, form.email, hash]
    );
    req.session.userId = ins.rows[0].id;
    delete req.session.isAdmin;
    req.flash("ok", "Đăng ký thành công. Chào mừng bạn đến với Sakura Beauty!");
    res.redirect("/account");
  } catch (err) {
    next(err);
  }
});

router.get("/login", (req, res) => {
  if (req.isAdmin) return res.redirect("/admin");
  if (req.user) return res.redirect("/account");
  res.send(views.loginPage(req, base(req, { next: req.query.next || "" })));
});

router.post("/login", async (req, res, next) => {
  try {
    const identifier = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    // Dedicated admin account (env-configured). Admin lands in Management only.
    if (identifier === config.adminUser) {
      const ok =
        password.length === config.adminPass.length &&
        crypto.timingSafeEqual(Buffer.from(password), Buffer.from(config.adminPass));
      if (ok) {
        req.session.isAdmin = true;
        delete req.session.userId;
        req.flash("ok", "Đăng nhập admin thành công.");
        return res.redirect("/admin");
      }
      req.flash("bad", "Thông tin đăng nhập không đúng.");
      return res.redirect("/login");
    }
    const phone = normalizePhone(identifier);
    const { rows } = await db.query("SELECT * FROM users WHERE phone = $1", [phone]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      req.flash("bad", "Số điện thoại hoặc mật khẩu không đúng.");
      return res.redirect("/login");
    }
    req.session.userId = user.id;
    delete req.session.isAdmin;
    req.flash("ok", "Đăng nhập thành công.");
    res.redirect(safeNext(req.body.next));
  } catch (err) {
    next(err);
  }
});

router.get("/logout", (req, res) => {
  delete req.session.userId;
  delete req.session.isAdmin;
  req.destroySession();
  res.redirect("/");
});

/* ---------- Profile & my orders ---------- */

router.get("/account", requireLogin, (req, res) => {
  res.send(views.profilePage(req, base(req, { user: req.user })));
});

router.post("/account", requireLogin, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim();
    const address = String(req.body.address || "").trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      req.flash("bad", "Email chưa hợp lệ.");
      return res.redirect("/account");
    }
    await db.query("UPDATE users SET name = $1, email = $2, address = $3 WHERE id = $4", [
      name, email, address, req.user.id,
    ]);
    req.flash("ok", "Đã lưu thông tin tài khoản.");
    res.redirect("/account");
  } catch (err) {
    next(err);
  }
});

router.get("/account/orders", requireLogin, async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [req.user.id]);
    const orders = [];
    for (const r of rows) orders.push(await getOrderWithItems("id = $1", r.id));
    res.send(views.myOrdersPage(req, base(req, { orders })));
  } catch (err) {
    next(err);
  }
});

/* ---------- Password reset: 3 steps ----------
   1. Enter registered email -> 6-digit code (hashed in DB, 10-min validity)
      is generated and emailed.
   2. Enter the code -> only when the server verifies it does step 3 open.
   3. Set a new password. */

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

router.get("/forgot", (req, res) => {
  res.send(views.forgotStep1Page(req, base(req, { email: (req.session.resetEmail || "") })));
});

router.post("/forgot", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim();
    req.session.resetEmail = email;
    delete req.session.resetVerified;
    const { rows } = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    if (rows.length) {
      const userId = rows[0].id;
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      await db.query("DELETE FROM reset_codes WHERE user_id = $1 AND used_at IS NULL", [userId]);
      await db.query(
        "INSERT INTO reset_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')",
        [userId, hashCode(code)]
      );
      await mailer.sendResetCode(email, code);
    }
    req.flash("ok", "Nếu email đã được đăng ký, shop đã gửi mã xác nhận 6 số. Mã có hiệu lực 10 phút.");
    res.redirect("/forgot/verify");
  } catch (err) {
    next(err);
  }
});

router.get("/forgot/verify", (req, res) => {
  if (!req.session.resetEmail) return res.redirect("/forgot");
  res.send(views.forgotStep2Page(req, base(req, {})));
});

router.post("/forgot/verify", async (req, res, next) => {
  try {
    const email = req.session.resetEmail;
    if (!email) return res.redirect("/forgot");
    const code = String(req.body.code || "").trim();
    req.session.resetAttempts = (req.session.resetAttempts || 0) + 1;
    if (req.session.resetAttempts > 5) {
      delete req.session.resetEmail;
      delete req.session.resetAttempts;
      req.flash("bad", "Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.");
      return res.redirect("/forgot");
    }
    const { rows: users } = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    let verifiedUserId = null;
    if (users.length && /^\d{6}$/.test(code)) {
      const { rows: codes } = await db.query(
        `SELECT id, code_hash FROM reset_codes
          WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1`,
        [users[0].id]
      );
      if (codes.length) {
        const expected = Buffer.from(codes[0].code_hash, "hex");
        const given = Buffer.from(hashCode(code), "hex");
        if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
          await db.query("UPDATE reset_codes SET used_at = now() WHERE id = $1", [codes[0].id]);
          verifiedUserId = users[0].id;
        }
      }
    }
    if (!verifiedUserId) {
      req.flash("bad", "Mã xác nhận không đúng hoặc đã hết hạn. Vui lòng kiểm tra lại.");
      return res.redirect("/forgot/verify");
    }
    req.session.resetVerified = { userId: verifiedUserId, at: Date.now() };
    delete req.session.resetAttempts;
    res.redirect("/forgot/reset");
  } catch (err) {
    next(err);
  }
});

function resetVerifiedFresh(req) {
  const v = req.session.resetVerified;
  return v && v.userId && Date.now() - v.at < 10 * 60 * 1000;
}

router.get("/forgot/reset", (req, res) => {
  if (!resetVerifiedFresh(req)) {
    req.flash("bad", "Phiên đặt lại mật khẩu đã hết hạn. Vui lòng bắt đầu lại.");
    return res.redirect("/forgot");
  }
  res.send(views.forgotStep3Page(req, base(req, {})));
});

router.post("/forgot/reset", async (req, res, next) => {
  try {
    if (!resetVerifiedFresh(req)) {
      req.flash("bad", "Phiên đặt lại mật khẩu đã hết hạn. Vui lòng bắt đầu lại.");
      return res.redirect("/forgot");
    }
    const password = String(req.body.password || "");
    const password2 = String(req.body.password2 || "");
    if (password.length < 6) {
      req.flash("bad", "Mật khẩu cần ít nhất 6 ký tự.");
      return res.redirect("/forgot/reset");
    }
    if (password !== password2) {
      req.flash("bad", "Hai mật khẩu nhập lại không khớp.");
      return res.redirect("/forgot/reset");
    }
    const hash = await bcrypt.hash(password, 10);
    await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.session.resetVerified.userId]);
    delete req.session.resetVerified;
    delete req.session.resetEmail;
    req.flash("ok", "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.");
    res.redirect("/login");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
