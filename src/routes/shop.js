"use strict";
const express = require("express");
const db = require("../db");
const views = require("../views");
const { cartCount } = require("../middleware");
const { listCategories } = require("../cart-lib");

const router = express.Router();

function base(req, extra) {
  return Object.assign({ cartCount: cartCount(req), flash: req.takeFlash() }, extra);
}

router.get("/", async (req, res, next) => {
  try {
    if (req.isAdmin) return res.redirect("/admin");
    const filters = {
      q: String(req.query.q || "").trim(),
      category: String(req.query.category || "Tất cả"),
      brand: String(req.query.brand || "Tất cả"),
      sort: String(req.query.sort || "featured"),
      sale: req.query.sale === "1",
    };
    const { rows: all } = await db.query("SELECT * FROM products ORDER BY id");
    const brands = [...new Set(all.map((p) => p.brand))].sort();
    const categories = ["Tất cả", ...(await listCategories())];
    const q = filters.q.toLowerCase();
    let list = all.filter((p) => {
      if (filters.category !== "Tất cả" && p.category !== filters.category) return false;
      if (filters.brand !== "Tất cả" && p.brand !== filters.brand) return false;
      if (filters.sale && !(p.old_price && p.old_price > p.price)) return false;
      if (q && (p.name + " " + p.brand + " " + p.category).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    switch (filters.sort) {
      case "sold":
        list.sort((a, b) => b.sold - a.sold);
        break;
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
        break;
      case "name-desc":
        list.sort((a, b) => b.name.localeCompare(a.name, "vi"));
        break;
      default:
        list.sort((a, b) => (b.featured - a.featured) || (b.bestseller - a.bestseller) || (b.sold - a.sold));
    }
    const featured = all.filter((p) => p.featured).slice(0, 6);
    res.send(views.homePage(req, base(req, { products: list, featured, categories, brands, filters })));
  } catch (err) {
    next(err);
  }
});

router.get("/product/:id", async (req, res, next) => {
  try {
    if (req.isAdmin) return res.redirect("/admin");
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query("SELECT * FROM products WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).send("Không tìm thấy sản phẩm.");
    const product = rows[0];
    const rel = await db.query(
      "SELECT * FROM products WHERE category = $1 AND id <> $2 ORDER BY sold DESC LIMIT 4",
      [product.category, product.id]
    );
    res.send(views.productPage(req, base(req, { product, related: rel.rows })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
