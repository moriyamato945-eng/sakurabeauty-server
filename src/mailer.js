"use strict";
// Outbound email. No hard dependency on any provider:
//  - If EMAIL_API_URL + EMAIL_API_KEY are set, messages are POSTed there as
//    JSON { from, to, subject, text } with a Bearer key (compatible with most
//    transactional-email relay APIs).
//  - Otherwise the message — including password-reset codes — is written to
//    the server console so the flow still works in development.
const config = require("./config");

async function sendMail({ to, subject, text }) {
  const apiUrl = process.env.EMAIL_API_URL;
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM || "no-reply@sakurabeauty.dpdns.org";
  if (apiUrl && apiKey) {
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!res.ok) throw new Error("email API responded " + res.status);
      console.log(`[mail] sent "${subject}" to ${to} via EMAIL_API_URL`);
      return true;
    } catch (err) {
      console.error("[mail] provider send failed, falling back to console log:", err.message);
    }
  }
  console.log("--------------------------------------------------");
  console.log(`[mail] (no email provider configured — console fallback)`);
  console.log(`[mail] To: ${to}`);
  console.log(`[mail] Subject: ${subject}`);
  console.log(text);
  console.log("--------------------------------------------------");
  return true;
}

function sendResetCode(to, code) {
  return sendMail({
    to,
    subject: "Mã đặt lại mật khẩu - " + config.shopName,
    text:
      "Xin chào,\n\n" +
      "Mã đặt lại mật khẩu Sakura Beauty của bạn là: " + code + "\n" +
      "Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.\n\n" +
      "— Sakura Beauty",
  });
}

module.exports = { sendMail, sendResetCode };
