const https = require("https");
const config = require("../config");

// Sends an OTP through Melipayamak's shared-line pattern API.
// Outside production with no API key configured, the code is logged instead (dev only).
function sendOtpSms(mobile, code) {
  if (!config.sms.apiKey) {
    if (config.isProd) return Promise.reject(new Error("SMS provider is not configured"));
    console.log(`[sms:dev] OTP for ${mobile}: ${code}`);
    return Promise.resolve();
  }

  const data = JSON.stringify({ bodyId: config.sms.bodyId, to: mobile, args: [code] });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "console.melipayamak.com",
        port: 443,
        path: `/api/send/shared/${encodeURIComponent(config.sms.apiKey)}`,
        method: "POST",
        timeout: 10_000,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode === 200) return resolve();
          reject(new Error(`SMS provider responded ${res.statusCode}: ${body.slice(0, 200)}`));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("SMS provider timeout")));
    req.on("error", reject);
    req.write(data, "utf8");
    req.end();
  });
}

module.exports = { sendOtpSms };
