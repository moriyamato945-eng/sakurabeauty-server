# Sakura Beauty — Server Version (Node.js + Postgres)

A complete, deployable server version of the Sakura Beauty Japanese cosmetics
shop, matching the Muse-hosted full shop: storefront with search/filter/sort,
session cart, COD / bank-transfer checkout, vouchers, customer accounts,
a dedicated admin with a Management area, and email-code password reset.

- **Stack:** Node.js + Express, Postgres (via `pg`), `bcryptjs` password hashing.
- **Sessions:** server-side, stored in the Postgres `sessions` table — nothing
  is stored on the (ephemeral) local filesystem.
- **Data:** all tables are auto-created on first boot and the 17-product
  catalog is seeded automatically if the products table is empty.

## Features

- Storefront: product grid, search, filter by category/brand, sort (featured,
  best-selling, price ↑↓, name A–Z), sale-only view, product detail with a
  "Giới thiệu sản phẩm" section.
- Vouchers (same rules as the public shop): `SAKURA10` = 10% off, max
  200.000₫; `JAPAN50` = 50.000₫ off orders from 500.000₫. Free shipping for
  orders from 499.000₫ (after discount), otherwise 30.000₫.
- Customers: register with phone + email + password, log in by phone, profile
  with default address (auto-filled at checkout), "Đơn của tôi" order list;
  guests can look up orders by phone number.
- Admin (default `admin` / `admin123`): sees **only** Management — order list,
  order detail with status updates, printable invoice ("In đơn"), product
  add/edit/delete and quick price/stock editing. Customers are blocked from
  `/admin` server-side.
- Password reset: enter email → 6-digit code (10-minute validity, stored
  hashed) → set a new password. Without an email provider configured, codes
  are printed to the server console (see below).

## Run locally

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/sakurabeauty npm start
# open http://localhost:3000
```

## Deploy on Render (free web service) + Neon (free Postgres)

1. **Neon:** create a free project at neon.tech and copy its connection
   string (it looks like
   `postgres://user:pass@ep-xxxx.aws.neon.tech/dbname?sslmode=require`).
2. **Push this folder to a GitHub repository** (Render deploys from GitHub).
3. **Render:** New → Web Service → connect the repo (or "New → Blueprint" and
   Render will read `render.yaml`). Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free
4. **Environment variables** (Render dashboard → Environment):

   | Variable         | Required | Notes                                                        |
   |------------------|----------|--------------------------------------------------------------|
   | `DATABASE_URL`   | ✅       | The Neon connection string from step 1.                      |
   | `SESSION_SECRET` | ✅       | Any long random string (auto-generated if using render.yaml).|
   | `ADMIN_USER`     | optional | Admin username. Default: `admin`.                            |
   | `ADMIN_PASS`     | optional | Admin password. Default: `admin123` — **change this!**       |
   | `BANK_INFO`      | optional | Bank-transfer details shown to customers who pay by transfer.|
   | `EMAIL_API_URL`  | optional | Transactional email API endpoint for password-reset codes.   |
   | `EMAIL_API_KEY`  | optional | Bearer key for that API. Without these two, reset codes are   |
   | `EMAIL_FROM`     | optional | logged to the server console instead of emailed.             |

5. Deploy. On first boot the app creates the tables and seeds the catalog.
6. **Custom domain:** in Render → Settings → Custom Domains add
   `sakurabeauty.dpdns.org`, then point the domain's DNS at Render as the
   dashboard instructs (CNAME/A records at DigitalPlat).

Notes on the free tier: Render free web services sleep after ~15 minutes of
inactivity (first request afterwards takes up to ~1 minute to wake), and the
filesystem is ephemeral — this app keeps everything in Postgres, so sleeps
and redeploys lose nothing.

## ⚠️ Product images

The exported public shop inlines all product photos as base64 inside one
HTML file and contains **no remote image URLs**, so there were no original
URLs to reference. The seed therefore points each product at a small local
SVG placeholder (`public/img/product-<id>.svg`). To show the real photos,
either replace those files with real images (same filenames) or set each
product's image URL in **Admin → Products → Sửa** once hosted image URLs are
available.
