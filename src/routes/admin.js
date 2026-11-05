"use strict";
const express = require("express");
const db = require("../db");
const views = require("../views");
const { requireAdmin } = require("../middleware");
const { getOrderWithItems, listCategories } = require("../cart-lib");
const { ORDER_STATUSES } = require("../util");

const router = express.Router();

// Every route in this file is behind requireAdmin: logged-in customers are
// blocked server-side (403) and guests are sent to the login page.
router.use(requireAdmin);

function base(req, extra) {
  return Object.assign({ flash: req.takeFlash() }, extra);
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200");
    const counts = await db.query(
      "SELECT order_id, COALESCE(SUM(qty), 0)::int AS item_count FROM order_items GROUP BY order_id"
    );
    const byOrder = new Map(counts.rows.map((r) => [r.order_id, r.item_count]));
    for (const o of rows) o.item_count = byOrder.get(o.id) || 0;
    res.send(views.adminOrdersPage(req, base(req, { orders: rows })));
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:id", async (req, res, next) => {
  try {
    const order = await getOrderWithItems("id = $1", parseInt(req.params.id, 10) || 0);
    if (!order) return res.status(404).send("Không tìm thấy đơn hàng.");
    res.send(views.adminOrderDetailPage(req, base(req, { order, statuses: ORDER_STATUSES })));
  } catch (err) {
    next(err);
  }
});

router.post("/orders/:id/status", async (req, res, next) => {
  try {
    const status = String(req.body.status || "");
    if (!ORDER_STATUSES.includes(status)) {
      req.flash("bad", "Trạng thái không hợp lệ.");
      return res.redirect("/admin/orders/" + req.params.id);
    }
    await db.query("UPDATE orders SET status = $1 WHERE id = $2", [status, parseInt(req.params.id, 10) || 0]);
    req.flash("ok", "Đã cập nhật trạng thái đơn hàng.");
    res.redirect("/admin/orders/" + req.params.id);
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:id/print", async (req, res, next) => {
  try {
    const order = await getOrderWithItems("id = $1", parseInt(req.params.id, 10) || 0);
    if (!order) return res.status(404).send("Không tìm thấy đơn hàng.");
    res.send(views.invoicePage(req, { order }));
  } catch (err) {
    next(err);
  }
});

router.get("/products", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM products ORDER BY id");
    res.send(views.adminProductsPage(req, base(req, { products: rows })));
  } catch (err) {
    next(err);
  }
});

function parseProductForm(body) {
  const intOr = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
  };
  return {
    name: String(body.name || "").trim(),
    brand: String(body.brand || "").trim(),
    category: String(body.category || "").trim(),
    price: Math.max(0, intOr(body.price, 0)),
    old_price: body.old_price === "" || body.old_price == null ? null : Math.max(0, intOr(body.old_price, 0)),
    size: String(body.size || "").trim(),
    stock: Math.max(0, intOr(body.stock, 0)),
    sold: Math.max(0, intOr(body.sold, 0)),
    image_url: String(body.image_url || "").trim(),
    description: String(body.description || "").trim(),
    benefits: String(body.benefits || "").trim(),
    featured: body.featured === "1",
    bestseller: body.bestseller === "1",
  };
}

router.get("/products/new", async (req, res, next) => {
  try {
    res.send(views.adminProductFormPage(req, base(req, { product: {}, categories: await listCategories() })));
  } catch (err) {
    next(err);
  }
});

router.post("/products", async (req, res, next) => {
  try {
    const p = parseProductForm(req.body);
    if (!p.name) {
      req.flash("bad", "Tên sản phẩm là bắt buộc.");
      return res.redirect("/admin/products/new");
    }
    await db.query(
      `INSERT INTO products (name, brand, category, price, old_price, size, stock, sold,
                             featured, bestseller, description, benefits, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [p.name, p.brand, p.category, p.price, p.old_price, p.size, p.stock, p.sold,
       p.featured, p.bestseller, p.description, p.benefits, p.image_url]
    );
    req.flash("ok", "Đã thêm sản phẩm " + p.name + ".");
    res.redirect("/admin/products");
  } catch (err) {
    next(err);
  }
});

router.get("/products/:id/edit", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM products WHERE id = $1", [parseInt(req.params.id, 10) || 0]);
    if (!rows.length) return res.status(404).send("Không tìm thấy sản phẩm.");
    res.send(views.adminProductFormPage(req, base(req, { product: rows[0], categories: await listCategories() })));
  } catch (err) {
    next(err);
  }
});

router.post("/products/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    const p = parseProductForm(req.body);
    if (!p.name) {
      req.flash("bad", "Tên sản phẩm là bắt buộc.");
      return res.redirect("/admin/products/" + id + "/edit");
    }
    await db.query(
      `UPDATE products SET name=$1, brand=$2, category=$3, price=$4, old_price=$5, size=$6,
              stock=$7, sold=$8, featured=$9, bestseller=$10, description=$11, benefits=$12, image_url=$13
        WHERE id=$14`,
      [p.name, p.brand, p.category, p.price, p.old_price, p.size, p.stock, p.sold,
       p.featured, p.bestseller, p.description, p.benefits, p.image_url, id]
    );
    req.flash("ok", "Đã lưu sản phẩm.");
    res.redirect("/admin/products");
  } catch (err) {
    next(err);
  }
});

// Quick price + stock edit straight from the product list.
router.post("/products/:id/quick", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    const price = Math.max(0, parseInt(req.body.price, 10) || 0);
    const stock = Math.max(0, parseInt(req.body.stock, 10) || 0);
    await db.query("UPDATE products SET price = $1, stock = $2 WHERE id = $3", [price, stock, id]);
    req.flash("ok", "Đã cập nhật giá / tồn kho.");
    res.redirect("/admin/products");
  } catch (err) {
    next(err);
  }
});

router.post("/products/:id/delete", async (req, res, next) => {
  try {
    await db.query("DELETE FROM products WHERE id = $1", [parseInt(req.params.id, 10) || 0]);
    req.flash("ok", "Đã xóa sản phẩm.");
    res.redirect("/admin/products");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
