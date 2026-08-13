/* The server holds no credential, decides nothing, and still lets a visitor
 * arrive and get an answer. What it does hold is the disagreements Eve could
 * not settle, filed for you.
 * Run with:  node test/proxy.test.js  */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-proxy-"));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

const port = 8300 + (process.pid % 400);
const dataDir = path.join(tmp, "data");
const child = execFile("node", [path.join(ROOT, "eve-proxy.js"), "--port", String(port)], {
  cwd: ROOT, env: { ...process.env, EVE_DATA_DIR: dataDir },
});
const at = (p) => `http://127.0.0.1:${port}${p}`;

(async () => {
  try {
    for (let i = 0; i < 60; i++) {
      try { await fetch(at("/api/health")); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }

    // --- nothing here wants a credential ---
    const health = await fetch(at("/api/health")).then((r) => r.json());
    assert.strictEqual(health.running, "local", "everything she does runs in the visitor's browser");
    assert.match(health.reviewer, /filed/);
    ok("the server reports that she runs locally and misread requests are filed");

    const source = fs.readFileSync(path.join(ROOT, "eve-proxy.js"), "utf8");
    assert.ok(!/api\.groq\.com|GROQ_API_KEY|Authorization: `Bearer/.test(source),
      "the server must not reach for a provider or carry a credential");
    assert.ok(!fs.existsSync(path.join(ROOT, "eve", "review", "groq.js")), "the transport should be gone");
    ok("no key, no provider call and no credential anywhere in the server");

    // --- a visitor still gets everything they need, with no setup ---
    for (const asset of ["/index.html", "/app.js", "/learn.js", "/intent.js", "/eve-intent.json"]) {
      const res = await fetch(at(asset));
      assert.strictEqual(res.status, 200, `${asset} should be served`);
    }
    ok("EVE and her mind are served, so a visitor arrives ready to talk to her");

    const pageJs = await fetch(at("/app.js")).then((r) => r.text());
    assert.ok(!/gsk_[A-Za-z0-9]{20,}/.test(pageJs), "nothing key-shaped should reach the browser");
    ok("nothing the browser downloads looks remotely like a credential");

    // --- what Eve could not settle is filed here, without the photo ---
    const filed = await fetch(at("/api/disagreement"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: JSON.stringify({ intent: "turn_on", confidence: 0.31 }),
        why: "she was not confident this meant turn on",
        confidence: 0.3,
        transcript: "corner roughness measured 2.4, which is borderline",
      }),
    });
    assert.strictEqual(filed.status, 200);
    const { filed: caseId } = await filed.json();
    assert.ok(caseId, "it should come back with a case reference");

    const casesFile = path.join(dataDir, "cases.json");
    assert.ok(fs.existsSync(casesFile), "the case should be on disk for you");
    const stored = JSON.parse(fs.readFileSync(casesFile, "utf8"));
    assert.strictEqual(stored.length, 1);
    assert.match(stored[0].why, /not confident this meant turn on/);
    assert.ok(!JSON.stringify(stored).includes("data:image"), "no image is ever filed");
    ok("a request EVE misread is filed for you to settle");

    // --- the endpoint is still defended, because it writes to the card ---
    let refused = false;
    for (let i = 0; i < 12; i++) {
      const r = await fetch(at("/api/disagreement"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: "x", why: "flood" }),
      });
      if (r.status === 429) { refused = true; break; }
    }
    assert.ok(refused, "an open endpoint that writes to an SD card must have a limit");
    ok("the filing endpoint is rate limited — nothing costs money, but it does cost writes");

    // --- EVE's own state is not part of the website ---
    for (const secret of ["/eve-data/secrets.json", "/eve-data/cases.json", "/eve-skills/anything.js"]) {
      assert.strictEqual((await fetch(at(secret))).status, 403, `${secret} must not be served`);
    }
    ok("the vault, the filed cases and her skills are refused, whether they exist or not");

    // --- HTTPS, which is what makes the camera work from another machine ---
    const securePort = port + 3;
    const secureDir = path.join(tmp, "secure");
    const secure = execFile("node", [path.join(ROOT, "eve-proxy.js"), "--https", "--port", String(securePort)], {
      cwd: ROOT, env: { ...process.env, EVE_DATA_DIR: secureDir },
    });
    try {
      // A self-signed certificate is the whole point, so do not verify it here.
      const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      let health = null;
      for (let i = 0; i < 80; i++) {
        try { health = await fetch(`https://127.0.0.1:${securePort}/api/health`).then((r) => r.json()); break; }
        catch { await new Promise((r) => setTimeout(r, 100)); }
      }
      assert.ok(health, "the secure server should answer over TLS");
      assert.strictEqual(health.running, "local");
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous ?? "1";

      assert.ok(fs.existsSync(path.join(secureDir, "eve-cert.pem")), "it should have made a certificate");
      const keyFile = path.join(secureDir, "eve-key.pem");
      if (process.platform === "win32") {
        /* Windows has no POSIX permission bits. chmod there only toggles the
         * read-only flag and the mode always reads back as 0o666, so asserting
         * 0o600 tests nothing and fails everywhere. Access is governed by ACLs
         * inherited from the user's profile instead, which is not something
         * this test can inspect — so it checks only that the key was written. */
        assert.ok(fs.existsSync(keyFile), "it should have written the private key");
        ok("--https serves over TLS with a self-signed certificate (key access is Windows' ACLs to enforce)");
      } else {
        const mode = fs.statSync(keyFile).mode & 0o777;
        assert.strictEqual(mode, 0o600, "the private key must not be readable by other users");
        ok("--https serves over TLS with a self-signed certificate, key kept private");
      }
    } finally {
      secure.kill("SIGKILL");
    }

    console.log(`\neve-proxy: ${passed} tests passed`);
  } finally {
    child.kill("SIGKILL");
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  child.kill("SIGKILL");
  console.error(`\n✖ ${err.stack}`);
  process.exit(1);
});
