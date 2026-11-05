"use strict";
// Minimal server-side sessions stored in Postgres (sessions table).
// The cookie only carries a 256-bit random id plus an HMAC signature;
// all session data (cart, login state, flash messages) lives in the DB,
// so nothing depends on the ephemeral local filesystem.
const crypto = require("crypto");
const db = require("./db");
const config = require("./config");

const COOKIE = "sbsid";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, rolling

function sign(sid) {
  return crypto.createHmac("sha256", config.sessionSecret).update(sid).digest("hex").slice(0, 32);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function newSid() {
  return crypto.randomBytes(32).toString("hex");
}

function sessionMiddleware(req, res, next) {
  (async () => {
    let sid = null;
    let data = {};
    let isNew = false;
    const cookies = parseCookies(req);
    const raw = cookies[COOKIE];
    if (raw && raw.includes(".")) {
      const [candidate, sig] = raw.split(".");
      if (
        sig &&
        sig.length === sign(candidate).length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(candidate)))
      ) {
        const { rows } = await db.query("SELECT data FROM sessions WHERE sid = $1 AND expires_at > now()", [candidate]);
        if (rows.length) {
          sid = candidate;
          data = rows[0].data || {};
        }
      }
    }
    if (!sid) {
      sid = newSid();
      data = {};
      isNew = true;
    }
    req.sessionId = sid;
    req.session = data;
    const snapshot = JSON.stringify(data);
    let destroyed = false;
    req.destroySession = () => {
      destroyed = true;
    };

    let savePromise = null;
    const save = () => {
      if (!savePromise) {
        savePromise = (async () => {
          try {
            if (destroyed) {
              await db.query("DELETE FROM sessions WHERE sid = $1", [sid]);
              res.setHeader(
                "Set-Cookie",
                COOKIE + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
              );
              return;
            }
            const current = JSON.stringify(req.session || {});
            if (isNew || current !== snapshot) {
              await db.query(
                `INSERT INTO sessions (sid, data, expires_at) VALUES ($1, $2::jsonb, $3)
                 ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
                [sid, current, new Date(Date.now() + TTL_MS)]
              );
              res.setHeader(
                "Set-Cookie",
                COOKIE + "=" + encodeURIComponent(sid + "." + sign(sid)) +
                  "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + Math.floor(TTL_MS / 1000) +
                  (process.env.NODE_ENV === "production" ? "; Secure" : "")
              );
            }
          } catch (err) {
            console.error("[session] save failed:", err.message);
          }
        })();
      }
      return savePromise;
    };
    // Persist BEFORE the response is flushed: the client may send its next
    // request with the new cookie the moment it sees this response, and the
    // session row must already exist by then.
    const origEnd = res.end;
    let ending = false;
    res.end = function (...args) {
      if (ending) return origEnd.apply(this, args);
      ending = true;
      save().then(
        () => origEnd.apply(this, args),
        () => origEnd.apply(this, args)
      );
    };
    next();
  })().catch(next);
}

// Flash messages: req.flash("ok", "...") then read once in views.
function flashMiddleware(req, res, next) {
  req.flash = (type, msg) => {
    if (!req.session.flash) req.session.flash = [];
    req.session.flash.push({ type, msg });
  };
  req.takeFlash = () => {
    const f = req.session.flash || [];
    delete req.session.flash;
    return f;
  };
  next();
}

module.exports = { sessionMiddleware, flashMiddleware };
