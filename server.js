"use strict";
const path = require("path");
const express = require("express");
const config = require("./src/config");
const db = require("./src/db");
const { sessionMiddleware, flashMiddleware } = require("./src/session");
const { loadUser } = require("./src/middleware");

async function main() {
  if (!config.databaseUrl) {
    console.error("");
    console.error("==============================================================");
    console.error("  Sakura Beauty server cannot start: DATABASE_URL is not set.");
    console.error("==============================================================");
    console.error("  This app stores everything (products, accounts, orders,");
    console.error("  sessions) in Postgres. Set DATABASE_URL to your database");
    console.error("  connection string, e.g.:");
    console.error("");
    console.error("    DATABASE_URL=postgres://user:pass@host:5432/dbname npm start");
    console.error("");
    console.error("  On Render: add the Neon connection string as the");
    console.error("  DATABASE_URL environment variable (see README.md).");
    console.error("==============================================================");
    process.exit(1);
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));
  app.use(sessionMiddleware);
  app.use(flashMiddleware);
  app.use(loadUser);

  app.use("/", require("./src/routes/shop"));
  app.use("/", require("./src/routes/cart"));
  app.use("/", require("./src/routes/account"));
  app.use("/admin", require("./src/routes/admin"));

  app.use((req, res) => res.status(404).send("Không tìm thấy trang."));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error("[error]", err);
    if (!res.headersSent) res.status(500).send("Đã xảy ra lỗi. Vui lòng thử lại sau.");
  });

  console.log("[boot] connecting to database...");
  await db.init();
  app.listen(config.port, () => {
    console.log(`[boot] Sakura Beauty server listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error("[boot] failed to start:", err.message);
  process.exit(1);
});
