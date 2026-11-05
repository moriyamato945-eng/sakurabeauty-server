"use strict";
const { vnd, escapeHtml: esc, FREE_SHIP } = require("./util");
const config = require("./config");

function flashHtml(flash) {
  if (!flash || !flash.length) return "";
  return flash
    .map((f) => `<div class="flash ${f.type === "bad" ? "flash-bad" : "flash-ok"}">${esc(f.msg)}</div>`)
    .join("");
}

function layout(req, title, content, opts = {}) {
  const user = req.user;
  const cartN = opts.cartCount || 0;
  const accountLinks = req.isAdmin
    ? `<a href="/admin">Quản lý</a><a href="/logout">Đăng xuất</a>`
    : user
      ? `<a href="/account">👤 ${esc(user.name || user.phone)}</a><a href="/account/orders">Đơn của tôi</a><a href="/logout">Đăng xuất</a>`
      : `<a href="/login">Đăng nhập</a><a href="/register">Đăng ký</a>`;
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(config.shopName)}</title>
<meta name="description" content="Sakura Beauty — mỹ phẩm Nhật chính hãng: Shiseido, SK-II, Anessa, Hada Labo... Giao hàng toàn quốc, freeship đơn từ 499.000₫.">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="topbar">
  <a class="logo" href="/">🌸 ${esc(config.shopName)}</a>
  <form class="search" method="get" action="/">
    <input type="search" name="q" placeholder="Tìm sản phẩm, thương hiệu..." value="${esc(opts.q || "")}">
    <button type="submit">Tìm</button>
  </form>
  <nav class="topnav">
    <a href="/cart">🛒 Giỏ hàng${cartN ? ` <span class="badge">${cartN}</span>` : ""}</a>
    ${accountLinks}
  </nav>
</header>
<main class="container">
${flashHtml(opts.flash)}
${content}
</main>
<footer class="footer">
  <p>🌸 <strong>${esc(config.shopName)}</strong> — Mỹ phẩm Nhật chính hãng.</p>
  <p>Mã giảm giá: <strong>SAKURA10</strong> giảm 10% (tối đa 200.000₫) • <strong>JAPAN50</strong> giảm 50.000₫ cho đơn từ 500.000₫ • Miễn phí vận chuyển cho đơn từ ${vnd(FREE_SHIP)}.</p>
  <p><a href="/orders/lookup">Tra cứu đơn hàng bằng số điện thoại</a></p>
</footer>
</body>
</html>`;
}

function adminLayout(req, title, content, opts = {}) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Quản lý ${esc(config.shopName)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="topbar adminbar">
  <a class="logo" href="/admin">🌸 ${esc(config.shopName)} — Quản lý</a>
  <nav class="topnav">
    <a href="/admin">Đơn hàng</a>
    <a href="/admin/products">Sản phẩm</a>
    <a href="/logout">Đăng xuất</a>
  </nav>
</header>
<main class="container">
${flashHtml(opts.flash)}
${content}
</main>
</body>
</html>`;
}

function salePct(p) {
  if (p.old_price && p.old_price > p.price) return Math.round((1 - p.price / p.old_price) * 100);
  return 0;
}

function productCard(p) {
  const pct = salePct(p);
  return `<article class="card">
    <a href="/product/${p.id}"><img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy"></a>
    <div class="card-body">
      <div class="card-brand">${esc(p.brand)}${p.bestseller ? ' <span class="tag">Bán chạy</span>' : ""}${pct ? ` <span class="tag tag-sale">-${pct}%</span>` : ""}</div>
      <a class="card-name" href="/product/${p.id}">${esc(p.name)}</a>
      <div class="card-size">${esc(p.size)} • Đã bán ${p.sold}</div>
      <div class="card-price">${vnd(p.price)}${p.old_price ? ` <s>${vnd(p.old_price)}</s>` : ""}</div>
      <div class="card-stock">${p.stock > 0 ? `Còn ${p.stock} sản phẩm` : '<span class="out">Hết hàng</span>'}</div>
      <form method="post" action="/cart/add" class="card-actions">
        <input type="hidden" name="productId" value="${p.id}">
        <a class="btn btn-ghost" href="/product/${p.id}">Chi tiết</a>
        <button class="btn" type="submit" ${p.stock <= 0 ? "disabled" : ""}>Thêm vào giỏ</button>
      </form>
    </div>
  </article>`;
}

function homePage(req, data) {
  const { products, featured, categories, brands, filters } = data;
  const catOpts = categories
    .map((c) => `<option value="${esc(c)}" ${filters.category === c ? "selected" : ""}>${esc(c)}</option>`)
    .join("");
  const brandOpts = ["Tất cả", ...brands]
    .map((b) => `<option value="${esc(b)}" ${filters.brand === b ? "selected" : ""}>${b === "Tất cả" ? "Tất cả thương hiệu" : esc(b)}</option>`)
    .join("");
  const sortOpts = [
    ["featured", "Nổi bật"],
    ["sold", "Bán chạy nhất"],
    ["price-asc", "Giá: thấp đến cao"],
    ["price-desc", "Giá: cao xuống thấp"],
    ["name-asc", "Tên: A → Z"],
    ["name-desc", "Tên: Z → A"],
  ]
    .map(([v, l]) => `<option value="${v}" ${filters.sort === v ? "selected" : ""}>${l}</option>`)
    .join("");
  const featuredHtml =
    featured && featured.length && !filters.q && filters.category === "Tất cả" && !filters.sale && filters.sort === "featured" && filters.brand === "Tất cả"
      ? `<section><h2>⭐ Sản phẩm nổi bật</h2><div class="grid">${featured.map(productCard).join("")}</div></section>`
      : "";
  const content = `
<section class="hero">
  <h1>Mỹ phẩm Nhật chính hãng 🇯🇵</h1>
  <p>Shiseido • SK-II • Anessa • Hada Labo • Melano CC... Miễn phí vận chuyển cho đơn từ ${vnd(FREE_SHIP)}.</p>
</section>
${featuredHtml}
<section>
  <h2>Tất cả sản phẩm</h2>
  <form class="filters" method="get" action="/">
    <input type="search" name="q" placeholder="Tìm kiếm..." value="${esc(filters.q || "")}">
    <select name="category">${catOpts}</select>
    <select name="brand">${brandOpts}</select>
    <select name="sort">${sortOpts}</select>
    <label class="check"><input type="checkbox" name="sale" value="1" ${filters.sale ? "checked" : ""}> Chỉ hàng giảm giá</label>
    <button class="btn" type="submit">Lọc</button>
  </form>
  ${products.length ? `<div class="grid">${products.map(productCard).join("")}</div>` : '<p class="empty">Không tìm thấy sản phẩm phù hợp.</p>'}
</section>`;
  return layout(req, "Trang chủ", content, { q: filters.q, cartCount: data.cartCount, flash: data.flash });
}

function productPage(req, data) {
  const p = data.product;
  const pct = salePct(p);
  const benefits = String(p.benefits || "")
    .split("•")
    .map((b) => b.trim())
    .filter(Boolean);
  const intro =
    `${p.name} là sản phẩm ${String(p.category).toLowerCase()} chính hãng từ ${p.brand} — ` +
    `thương hiệu mỹ phẩm nội địa Nhật Bản. ${p.description}`;
  const content = `
<p class="crumbs"><a href="/">Trang chủ</a> › <a href="/?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a> › ${esc(p.name)}</p>
<div class="detail">
  <div class="detail-img"><img src="${esc(p.image_url)}" alt="${esc(p.name)}"></div>
  <div class="detail-info">
    <div class="card-brand">${esc(p.brand)}${pct ? ` <span class="tag tag-sale">Giảm ${pct}%</span>` : ""}</div>
    <h1>${esc(p.name)}</h1>
    <p class="detail-meta">Dung tích: ${esc(p.size)} • Đã bán: ${p.sold} • ${p.stock > 0 ? `Còn hàng: ${p.stock}` : "Hết hàng"}</p>
    <p class="detail-price">${vnd(p.price)}${p.old_price ? ` <s>${vnd(p.old_price)}</s>` : ""}</p>
    <p>${esc(p.description)}</p>
    <form method="post" action="/cart/add" class="buy-row">
      <input type="hidden" name="productId" value="${p.id}">
      <label>Số lượng <input type="number" name="qty" value="1" min="1" max="${Math.max(p.stock, 1)}"></label>
      <button class="btn btn-big" type="submit" ${p.stock <= 0 ? "disabled" : ""}>${p.stock > 0 ? "Thêm vào giỏ hàng" : "Hết hàng"}</button>
    </form>
  </div>
</div>
<section class="intro">
  <h3>Giới thiệu sản phẩm</h3>
  <p>${esc(intro)}</p>
  ${benefits.length ? `<p class="bold">Điểm nổi bật</p><ul class="benefit-list">${benefits.map((b) => `<li>✔ ${esc(b)}</li>`).join("")}</ul>` : ""}
</section>
${data.related && data.related.length ? `<section><h2>Sản phẩm cùng danh mục</h2><div class="grid">${data.related.map(productCard).join("")}</div></section>` : ""}`;
  return layout(req, p.name, content, { cartCount: data.cartCount, flash: data.flash });
}

function totalsBox(t, voucherCode) {
  return `<dl class="sum-box">
    <div class="row"><dt>Tạm tính</dt><dd>${vnd(t.subtotal)}</dd></div>
    ${t.discount > 0 ? `<div class="row"><dt>Giảm giá (${esc(voucherCode || "")})</dt><dd class="disc">-${vnd(t.discount)}</dd></div>` : ""}
    <div class="row"><dt>Phí vận chuyển</dt><dd>${t.shipping === 0 ? "Miễn phí" : vnd(t.shipping)}</dd></div>
    ${t.shipping > 0 ? `<p class="hint">Mua thêm ${vnd(FREE_SHIP - (t.subtotal - t.discount))} để được miễn phí vận chuyển.</p>` : ""}
    <div class="row total"><dt>Tổng cộng</dt><dd>${vnd(t.total)}</dd></div>
  </dl>`;
}

function cartPage(req, data) {
  const { lines, totals, voucher } = data;
  if (!lines.length) {
    return layout(req, "Giỏ hàng", `<h1>Giỏ hàng</h1><p class="empty">Giỏ hàng đang trống. <a href="/">Tiếp tục mua sắm</a></p>`, { cartCount: 0, flash: data.flash });
  }
  const rows = lines
    .map(
      (l) => `<tr>
      <td><img class="thumb" src="${esc(l.image_url)}" alt=""> <a href="/product/${l.id}">${esc(l.name)}</a></td>
      <td>${vnd(l.price)}</td>
      <td><form method="post" action="/cart/update" class="inline">
        <input type="hidden" name="productId" value="${l.id}">
        <input type="number" name="qty" value="${l.qty}" min="0" max="${l.stock}">
        <button class="btn btn-ghost" type="submit">Cập nhật</button></form></td>
      <td>${vnd(l.price * l.qty)}</td>
      <td><form method="post" action="/cart/remove" class="inline">
        <input type="hidden" name="productId" value="${l.id}">
        <button class="btn btn-ghost danger" type="submit">Xóa</button></form></td>
    </tr>`
    )
    .join("");
  const voucherHtml = voucher
    ? `<p>Mã giảm giá <strong>${esc(voucher)}</strong> đã áp dụng. <form method="post" action="/cart/voucher/remove" class="inline"><button class="btn btn-ghost" type="submit">Bỏ mã</button></form></p>`
    : `<form method="post" action="/cart/voucher" class="voucher-row">
        <input type="text" name="code" placeholder="SAKURA10 hoặc JAPAN50">
        <button class="btn" type="submit">Áp dụng</button>
      </form>
      <p class="hint">SAKURA10: giảm 10% (tối đa 200.000₫). JAPAN50: giảm 50.000₫ cho đơn từ 500.000₫.</p>`;
  const content = `<h1>Giỏ hàng (${lines.reduce((a, l) => a + l.qty, 0)} sản phẩm)</h1>
  <table class="table"><thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  ${voucherHtml}
  ${totalsBox(totals, voucher)}
  <p><a class="btn btn-big" href="/checkout">Tiến hành thanh toán</a> <a class="btn btn-ghost" href="/">Tiếp tục mua sắm</a></p>`;
  return layout(req, "Giỏ hàng", content, { cartCount: data.cartCount, flash: data.flash });
}

function checkoutPage(req, data) {
  const { lines, totals, voucher, form, errors } = data;
  const errHtml = errors && errors.length ? `<div class="flash flash-bad">${errors.map(esc).join("<br>")}</div>` : "";
  const content = `<h1>Thanh toán</h1>
  ${errHtml}
  <form method="post" action="/checkout" class="form">
    <div class="field"><label>Họ và tên *</label><input type="text" name="name" required value="${esc(form.name || "")}"></div>
    <div class="field"><label>Số điện thoại *</label><input type="tel" name="phone" required value="${esc(form.phone || "")}"></div>
    <div class="field"><label>Địa chỉ nhận hàng *</label><textarea name="address" rows="2" required>${esc(form.address || "")}</textarea></div>
    <div class="field"><label>Ghi chú (không bắt buộc)</label><input type="text" name="note" value="${esc(form.note || "")}"></div>
    <fieldset class="field"><legend>Phương thức thanh toán</legend>
      <label class="pay-opt"><input type="radio" name="payment" value="COD" ${form.payment !== "BANK" ? "checked" : ""}> Thanh toán khi nhận hàng (COD)</label>
      <label class="pay-opt"><input type="radio" name="payment" value="BANK" ${form.payment === "BANK" ? "checked" : ""}> Chuyển khoản ngân hàng ${config.bankInfo ? "" : "(shop sẽ liên hệ gửi thông tin)"}</label>
    </fieldset>
    <div class="field"><label>Mã giảm giá</label><input type="text" name="voucher" value="${esc(voucher || "")}" placeholder="SAKURA10 hoặc JAPAN50">
    ${totals.voucherError ? `<p class="voucher-msg bad">${esc(totals.voucherError)}</p>` : ""}</div>
    ${totalsBox(totals, totals.voucher)}
    <button class="btn btn-big" type="submit">Đặt hàng</button>
  </form>
  <h3>Sản phẩm trong đơn</h3>
  <ul>${lines.map((l) => `<li>${esc(l.name)} × ${l.qty} — ${vnd(l.price * l.qty)}</li>`).join("")}</ul>`;
  return layout(req, "Thanh toán", content, { cartCount: data.cartCount, flash: data.flash });
}

function orderSlipText(o) {
  const lines = [];
  lines.push("ĐƠN HÀNG SAKURA BEAUTY — " + o.code);
  lines.push("Khách hàng: " + o.customer_name);
  lines.push("Số điện thoại: " + o.phone);
  lines.push("Địa chỉ: " + o.address);
  if (o.note) lines.push("Ghi chú: " + o.note);
  lines.push("Thanh toán: " + (o.payment === "BANK" ? "Chuyển khoản ngân hàng" : "Thanh toán khi nhận hàng (COD)"));
  lines.push("---");
  for (const it of o.items) lines.push(`${it.product_name} × ${it.qty} — ${vnd(it.price * it.qty)}`);
  lines.push("---");
  lines.push("Tạm tính: " + vnd(o.subtotal));
  if (o.discount > 0) lines.push("Giảm giá" + (o.voucher ? " (" + o.voucher + ")" : "") + ": -" + vnd(o.discount));
  lines.push("Phí vận chuyển: " + (o.shipping === 0 ? "Miễn phí" : vnd(o.shipping)));
  lines.push("Tổng cộng: " + vnd(o.total));
  return lines.join("\n");
}

function orderDetailHtml(o, { showStatus = true } = {}) {
  const rows = o.items
    .map((it) => `<tr><td>${esc(it.product_name)}</td><td>${vnd(it.price)}</td><td>${it.qty}</td><td>${vnd(it.price * it.qty)}</td></tr>`)
    .join("");
  return `<p>Mã đơn: <strong>${esc(o.code)}</strong> • Ngày đặt: ${new Date(o.created_at).toLocaleString("vi-VN")}${showStatus ? ` • Trạng thái: <strong>${esc(o.status)}</strong>` : ""}</p>
  <p>Khách hàng: ${esc(o.customer_name)} — ${esc(o.phone)}<br>Địa chỉ: ${esc(o.address)}${o.note ? `<br>Ghi chú: ${esc(o.note)}` : ""}<br>Thanh toán: ${o.payment === "BANK" ? "Chuyển khoản ngân hàng" : "Thanh toán khi nhận hàng (COD)"}</p>
  <table class="table"><thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>
  <dl class="sum-box">
    <div class="row"><dt>Tạm tính</dt><dd>${vnd(o.subtotal)}</dd></div>
    ${o.discount > 0 ? `<div class="row"><dt>Giảm giá${o.voucher ? " (" + esc(o.voucher) + ")" : ""}</dt><dd class="disc">-${vnd(o.discount)}</dd></div>` : ""}
    <div class="row"><dt>Phí vận chuyển</dt><dd>${o.shipping === 0 ? "Miễn phí" : vnd(o.shipping)}</dd></div>
    <div class="row total"><dt>Tổng cộng</dt><dd>${vnd(o.total)}</dd></div>
  </dl>`;
}

function orderSuccessPage(req, data) {
  const o = data.order;
  const content = `<h1>🎉 Đặt hàng thành công!</h1>
  ${orderDetailHtml(o)}
  ${o.payment === "BANK" ? `<div class="flash flash-ok">${config.bankInfo ? "Thông tin chuyển khoản: " + esc(config.bankInfo) : "Bạn đã chọn chuyển khoản — shop sẽ liên hệ gửi thông tin chuyển khoản để bạn thanh toán."}</div>` : ""}
  <h3>Phiếu đơn hàng</h3>
  <pre class="slip" id="slipText">${esc(orderSlipText(o))}</pre>
  <p><button class="btn" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('slipText').innerText)">📋 Sao chép phiếu đơn</button>
  <button class="btn btn-ghost" type="button" onclick="window.print()">🖨 In đơn</button>
  <a class="btn btn-ghost" href="/">Tiếp tục mua sắm</a></p>`;
  return layout(req, "Đặt hàng thành công", content, { cartCount: 0, flash: data.flash });
}

function lookupPage(req, data) {
  const results = (data.orders || [])
    .map((o) => `<div class="order-block">${orderDetailHtml(o)}</div>`)
    .join("");
  const content = `<h1>Tra cứu đơn hàng</h1>
  <form method="get" action="/orders/lookup" class="form">
    <div class="field"><label>Số điện thoại đã đặt hàng</label><input type="tel" name="phone" required value="${esc(data.phone || "")}"></div>
    <button class="btn" type="submit">Tra cứu</button>
  </form>
  ${data.phone ? (data.orders && data.orders.length ? results : '<p class="empty">Không tìm thấy đơn hàng nào với số điện thoại này.</p>') : ""}`;
  return layout(req, "Tra cứu đơn hàng", content, { cartCount: data.cartCount, flash: data.flash });
}

function loginPage(req, data) {
  const content = `<h1>Đăng nhập</h1>
  <form method="post" action="/login" class="form">
    <input type="hidden" name="next" value="${esc(data.next || "")}">
    <div class="field"><label>Số điện thoại</label><input type="tel" name="phone" required autocomplete="username"></div>
    <div class="field"><label>Mật khẩu</label><input type="password" name="password" required autocomplete="current-password"></div>
    <button class="btn btn-big" type="submit">Đăng nhập</button>
  </form>
  <p><a href="/forgot">Quên mật khẩu?</a> • Chưa có tài khoản? <a href="/register">Đăng ký</a></p>`;
  return layout(req, "Đăng nhập", content, { cartCount: data.cartCount, flash: data.flash });
}

function registerPage(req, data) {
  const f = data.form || {};
  const content = `<h1>Đăng ký tài khoản</h1>
  <form method="post" action="/register" class="form">
    <div class="field"><label>Họ và tên</label><input type="text" name="name" value="${esc(f.name || "")}"></div>
    <div class="field"><label>Số điện thoại *</label><input type="tel" name="phone" required value="${esc(f.phone || "")}"></div>
    <div class="field"><label>Email *</label><input type="email" name="email" required value="${esc(f.email || "")}"></div>
    <div class="field"><label>Mật khẩu *</label><input type="password" name="password" required minlength="6" autocomplete="new-password"></div>
    <div class="field"><label>Nhập lại mật khẩu *</label><input type="password" name="password2" required autocomplete="new-password"></div>
    <button class="btn btn-big" type="submit">Đăng ký</button>
  </form>
  <p>Đã có tài khoản? <a href="/login">Đăng nhập</a></p>`;
  return layout(req, "Đăng ký", content, { cartCount: data.cartCount, flash: data.flash });
}

function profilePage(req, data) {
  const u = data.user;
  const content = `<h1>Tài khoản của tôi</h1>
  <form method="post" action="/account" class="form">
    <div class="field"><label>Họ và tên</label><input type="text" name="name" value="${esc(u.name || "")}"></div>
    <div class="field"><label>Số điện thoại</label><input type="tel" value="${esc(u.phone)}" disabled></div>
    <div class="field"><label>Email</label><input type="email" name="email" value="${esc(u.email || "")}"></div>
    <div class="field"><label>Địa chỉ mặc định (tự điền khi thanh toán)</label><textarea name="address" rows="2">${esc(u.address || "")}</textarea></div>
    <button class="btn" type="submit">Lưu thay đổi</button>
  </form>
  <p><a class="btn btn-ghost" href="/account/orders">Xem đơn của tôi</a></p>`;
  return layout(req, "Tài khoản", content, { cartCount: data.cartCount, flash: data.flash });
}

function myOrdersPage(req, data) {
  const list = (data.orders || [])
    .map((o) => `<div class="order-block">${orderDetailHtml(o)}</div>`)
    .join("");
  const content = `<h1>Đơn của tôi</h1>${data.orders && data.orders.length ? list : '<p class="empty">Bạn chưa có đơn hàng nào.</p>'}`;
  return layout(req, "Đơn của tôi", content, { cartCount: data.cartCount, flash: data.flash });
}

function forgotStep1Page(req, data) {
  const content = `<h1>Quên mật khẩu</h1>
  <p>Nhập email đã đăng ký — shop sẽ gửi mã xác nhận 6 số để đặt lại mật khẩu.</p>
  <form method="post" action="/forgot" class="form">
    <div class="field"><label>Email đã đăng ký</label><input type="email" name="email" required value="${esc(data.email || "")}"></div>
    <button class="btn btn-big" type="submit">Gửi mã xác nhận</button>
  </form>`;
  return layout(req, "Quên mật khẩu", content, { cartCount: data.cartCount, flash: data.flash });
}

function forgotStep2Page(req, data) {
  const content = `<h1>Nhập mã xác nhận</h1>
  <p>Shop đã gửi mã 6 số tới email của bạn (mã có hiệu lực 10 phút). Nhập mã để tiếp tục.</p>
  <form method="post" action="/forgot/verify" class="form">
    <div class="field"><label>Mã xác nhận</label><input type="text" name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <button class="btn btn-big" type="submit">Xác nhận mã</button>
  </form>
  <p><a href="/forgot">Gửi lại mã</a></p>`;
  return layout(req, "Nhập mã xác nhận", content, { cartCount: data.cartCount, flash: data.flash });
}

function forgotStep3Page(req, data) {
  const content = `<h1>Đặt mật khẩu mới</h1>
  <form method="post" action="/forgot/reset" class="form">
    <div class="field"><label>Mật khẩu mới</label><input type="password" name="password" required minlength="6" autocomplete="new-password"></div>
    <div class="field"><label>Nhập lại mật khẩu mới</label><input type="password" name="password2" required autocomplete="new-password"></div>
    <button class="btn btn-big" type="submit">Đặt lại mật khẩu</button>
  </form>`;
  return layout(req, "Đặt mật khẩu mới", content, { cartCount: data.cartCount, flash: data.flash });
}

/* ---------------- Admin ---------------- */

function adminOrdersPage(req, data) {
  const rows = (data.orders || [])
    .map(
      (o) => `<tr>
      <td><a href="/admin/orders/${o.id}">${esc(o.code)}</a></td>
      <td>${new Date(o.created_at).toLocaleString("vi-VN")}</td>
      <td>${esc(o.customer_name)}</td><td>${esc(o.phone)}</td>
      <td>${o.item_count}</td><td>${vnd(o.total)}</td>
      <td>${o.payment === "BANK" ? "Chuyển khoản" : "COD"}</td>
      <td>${esc(o.status)}</td>
      <td><a class="btn btn-ghost" href="/admin/orders/${o.id}/print">In đơn</a></td>
    </tr>`
    )
    .join("");
  const content = `<h1>Quản lý đơn hàng (${(data.orders || []).length})</h1>
  ${rows ? `<table class="table"><thead><tr><th>Mã đơn</th><th>Ngày</th><th>Khách hàng</th><th>Điện thoại</th><th>SL món</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">Chưa có đơn hàng nào.</p>'}`;
  return adminLayout(req, "Đơn hàng", content, { flash: data.flash });
}

function adminOrderDetailPage(req, data) {
  const o = data.order;
  const statusOpts = data.statuses
    .map((s) => `<option value="${esc(s)}" ${o.status === s ? "selected" : ""}>${esc(s)}</option>`)
    .join("");
  const content = `<p class="crumbs"><a href="/admin">‹ Tất cả đơn hàng</a></p>
  <h1>Đơn hàng ${esc(o.code)}</h1>
  ${orderDetailHtml(o, { showStatus: false })}
  <form method="post" action="/admin/orders/${o.id}/status" class="inline">
    <label>Trạng thái <select name="status">${statusOpts}</select></label>
    <button class="btn" type="submit">Cập nhật</button>
  </form>
  <p><a class="btn" href="/admin/orders/${o.id}/print">🖨 In đơn</a></p>`;
  return adminLayout(req, "Đơn " + o.code, content, { flash: data.flash });
}

function adminProductsPage(req, data) {
  const rows = (data.products || [])
    .map(
      (p) => `<tr>
      <td><img class="thumb" src="${esc(p.image_url)}" alt=""></td>
      <td><a href="/admin/products/${p.id}/edit">${esc(p.name)}</a><br><small>${esc(p.brand)} • ${esc(p.category)}</small></td>
      <td><form method="post" action="/admin/products/${p.id}/quick" class="quick">
        <input type="number" name="price" value="${p.price}" min="0" title="Giá bán">
        <input type="number" name="stock" value="${p.stock}" min="0" title="Tồn kho">
        <button class="btn btn-ghost" type="submit">Lưu</button></form></td>
      <td>${p.old_price ? vnd(p.old_price) : "—"}</td>
      <td>${p.sold}</td>
      <td><a class="btn btn-ghost" href="/admin/products/${p.id}/edit">Sửa</a>
        <form method="post" action="/admin/products/${p.id}/delete" class="inline" onsubmit="return confirm('Xóa sản phẩm này?')">
          <button class="btn btn-ghost danger" type="submit">Xóa</button></form></td>
    </tr>`
    )
    .join("");
  const content = `<h1>Quản lý sản phẩm (${(data.products || []).length})</h1>
  <p><a class="btn" href="/admin/products/new">+ Thêm sản phẩm</a></p>
  <table class="table"><thead><tr><th></th><th>Sản phẩm</th><th>Giá / Tồn kho (sửa nhanh)</th><th>Giá gốc</th><th>Đã bán</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return adminLayout(req, "Sản phẩm", content, { flash: data.flash });
}

function adminProductFormPage(req, data) {
  const p = data.product || {};
  const isNew = !p.id;
  const catOpts = data.categories
    .map((c) => `<option value="${esc(c)}" ${p.category === c ? "selected" : ""}>${esc(c)}</option>`)
    .join("");
  const content = `<h1>${isNew ? "Thêm sản phẩm" : "Sửa sản phẩm"}</h1>
  <form method="post" action="${isNew ? "/admin/products" : "/admin/products/" + p.id}" class="form">
    <div class="field"><label>Tên sản phẩm *</label><input type="text" name="name" required value="${esc(p.name || "")}"></div>
    <div class="field"><label>Thương hiệu</label><input type="text" name="brand" value="${esc(p.brand || "")}"></div>
    <div class="field"><label>Danh mục</label><select name="category">${catOpts}</select></div>
    <div class="field"><label>Giá bán (₫) *</label><input type="number" name="price" required min="0" value="${p.price ?? ""}"></div>
    <div class="field"><label>Giá gốc trước giảm (₫, để trống nếu không giảm)</label><input type="number" name="old_price" min="0" value="${p.old_price ?? ""}"></div>
    <div class="field"><label>Dung tích / quy cách</label><input type="text" name="size" value="${esc(p.size || "")}"></div>
    <div class="field"><label>Tồn kho</label><input type="number" name="stock" min="0" value="${p.stock ?? 0}"></div>
    <div class="field"><label>Đã bán</label><input type="number" name="sold" min="0" value="${p.sold ?? 0}"></div>
    <div class="field"><label>Đường dẫn ảnh (URL hoặc /img/...)</label><input type="text" name="image_url" value="${esc(p.image_url || "")}"></div>
    <div class="field"><label>Mô tả</label><textarea name="description" rows="3">${esc(p.description || "")}</textarea></div>
    <div class="field"><label>Điểm nổi bật (cách nhau bằng dấu •)</label><input type="text" name="benefits" value="${esc(p.benefits || "")}"></div>
    <label class="check"><input type="checkbox" name="featured" value="1" ${p.featured ? "checked" : ""}> Sản phẩm nổi bật</label>
    <label class="check"><input type="checkbox" name="bestseller" value="1" ${p.bestseller ? "checked" : ""}> Bán chạy</label>
    <p><button class="btn btn-big" type="submit">${isNew ? "Thêm sản phẩm" : "Lưu thay đổi"}</button>
    <a class="btn btn-ghost" href="/admin/products">Hủy</a></p>
  </form>`;
  return adminLayout(req, isNew ? "Thêm sản phẩm" : "Sửa sản phẩm", content, { flash: data.flash });
}

function invoicePage(req, data) {
  const o = data.order;
  const rows = o.items
    .map(
      (it, i) =>
        `<tr><td>${i + 1}</td><td>${esc(it.product_name)}</td><td>${vnd(it.price)}</td><td>${it.qty}</td><td style="text-align:right">${vnd(it.price * it.qty)}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<title>Hóa đơn ${esc(o.code)} — ${esc(config.shopName)}</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#222}
h1{font-size:20px;margin:0} table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px;text-align:left}
.totals{margin-top:12px;text-align:right;font-size:14px}
@media print{.noprint{display:none}}
</style></head>
<body>
<p class="noprint"><button onclick="window.print()">🖨 In đơn</button> <a href="/admin/orders/${o.id}">‹ Quay lại đơn hàng</a></p>
<h1>🌸 ${esc(config.shopName)} — HÓA ĐƠN BÁN HÀNG</h1>
<p>Mã đơn: <strong>${esc(o.code)}</strong> • Ngày: ${new Date(o.created_at).toLocaleString("vi-VN")}</p>
<p>Khách hàng: ${esc(o.customer_name)}<br>Điện thoại: ${esc(o.phone)}<br>Địa chỉ: ${esc(o.address)}${o.note ? `<br>Ghi chú: ${esc(o.note)}` : ""}<br>Thanh toán: ${o.payment === "BANK" ? "Chuyển khoản ngân hàng" : "Thanh toán khi nhận hàng (COD)"}</p>
<table><thead><tr><th>#</th><th>Sản phẩm</th><th>Đơn giá</th><th>SL</th><th style="text-align:right">Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
<p>Tạm tính: ${vnd(o.subtotal)}</p>
${o.discount > 0 ? `<p>Giảm giá${o.voucher ? " (" + esc(o.voucher) + ")" : ""}: -${vnd(o.discount)}</p>` : ""}
<p>Phí vận chuyển: ${o.shipping === 0 ? "Miễn phí" : vnd(o.shipping)}</p>
<p><strong>Tổng cộng: ${vnd(o.total)}</strong></p>
</div>
<p>Cảm ơn bạn đã mua sắm tại ${esc(config.shopName)}!</p>
</body></html>`;
}

module.exports = {
  layout,
  adminLayout,
  homePage,
  productPage,
  cartPage,
  checkoutPage,
  orderSuccessPage,
  lookupPage,
  loginPage,
  registerPage,
  profilePage,
  myOrdersPage,
  forgotStep1Page,
  forgotStep2Page,
  forgotStep3Page,
  adminOrdersPage,
  adminOrderDetailPage,
  adminProductsPage,
  adminProductFormPage,
  invoicePage,
};
