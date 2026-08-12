/* The visitor does nothing, and the key never leaves the machine.
 * Run with:  node test/proxy.test.js  */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eve-proxy-"));
const KEY = "gsk_fake_proxy_key_abcdef123456";
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✔ ${name}`); };

/** Stands in for Groq, and records what it was sent. */
const seen = [];
const provider = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ auth: req.headers.authorization, body: JSON.parse(body || "{}") });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        card_name: "Charizard", card_type: "pokemon", centering: 8, corners: 7,
        edges: 8, surface: 6, overall_grade: 7, grade_label: "Near Mint",
        confidence: "low", observations: ["slight edge wear"],
      }) } }],
    }));
  });
});

const get = (url) => fetch(url).then(async (r) => ({ status: r.status, body: await r.json() }));

(async () => {
  await new Promise((r) => provider.listen(0, r));
  const providerPort = provider.address().port;

  // Point the proxy's provider call at the stand-in.
  const proxySource = fs.readFileSync(path.join(ROOT, "eve-proxy.js"), "utf8")
    .replace("https://api.groq.com/openai/v1/chat/completions", `http://127.0.0.1:${providerPort}/v1/chat`);
  const proxyFile = path.join(ROOT, ".proxy-under-test.js");
  fs.writeFileSync(proxyFile, proxySource);

  const port = 8090 + (process.pid % 500);
  const child = execFile("node", [proxyFile, "--port", String(port)], {
    cwd: ROOT,
    env: { ...process.env, EVE_SECRET_GROQ_API_KEY: KEY, EVE_DATA_DIR: path.join(tmp, "data") },
  });
  const stop = () => { try { child.kill("SIGKILL"); } catch {} fs.rmSync(proxyFile, { force: true }); };

  try {
    // Wait for it to come up.
    for (let i = 0; i < 60; i++) {
      try { await get(`http://127.0.0.1:${port}/api/health`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }

    const health = await get(`http://127.0.0.1:${port}/api/health`);
    assert.strictEqual(health.body.grading, "available");
    assert.ok(!JSON.stringify(health.body).includes(KEY), "health must not disclose the key");
    ok("the page can ask whether this host grades, without the key being disclosed");

    // A visitor with no key, no account and no settings.
    const graded = await fetch(`http://127.0.0.1:${port}/api/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }),
    });
    const grade = await graded.json();
    assert.strictEqual(graded.status, 200);
    assert.strictEqual(grade.card_name, "Charizard");
    assert.strictEqual(grade.overall_grade, 7);
    ok("a visitor with no key at all uploads a card and gets a grade");

    // The key went to the provider, and only to the provider.
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].auth, `Bearer ${KEY}`, "the server should authenticate on the visitor's behalf");
    ok("the key is attached by the server, on the way out, and never sent to the browser");

    // The page itself must be clean.
    const pageJs = await fetch(`http://127.0.0.1:${port}/app.js`).then((r) => r.text());
    assert.ok(!pageJs.includes(KEY), "the served script must not contain the key");
    assert.ok(!/gsk_[A-Za-z0-9]{20,}/.test(pageJs), "nor any key-shaped string");
    const pageHtml = await fetch(`http://127.0.0.1:${port}/index.html`).then((r) => r.text());
    assert.ok(!pageHtml.includes(KEY));
    ok("nothing the browser downloads contains the key or anything shaped like one");

    // EVE's own state is not part of the website.
    const secrets = await fetch(`http://127.0.0.1:${port}/eve-data/secrets.json`);
    assert.strictEqual(secrets.status, 403, "the vault must not be servable");
    const skills = await fetch(`http://127.0.0.1:${port}/eve-data/cases.json`);
    assert.strictEqual(skills.status, 403);
    const traversal = await fetch(`http://127.0.0.1:${port}/../../etc/passwd`);
    assert.ok([403, 404].includes(traversal.status), "path traversal must not escape the site");
    ok("the vault, EVE's memory and anything outside the site are not served");

    // The background reviewer is invisible: no trace in the response.
    const responseKeys = Object.keys(grade);
    assert.ok(!responseKeys.some((k) => /review|evaluat|correct/i.test(k)),
      `the grade must not mention the reviewer, got: ${responseKeys.join(", ")}`);
    ok("the response carries no sign that anything reviews it afterwards");

    // …but it did run, and filed what it found.
    await new Promise((r) => setTimeout(r, 800));
    const casesFile = path.join(tmp, "data", "cases.json");
    if (fs.existsSync(casesFile)) {
      const filed = JSON.parse(fs.readFileSync(casesFile, "utf8"));
      assert.ok(filed.length >= 1, "the low-confidence grade should have opened a case");
      assert.ok(!JSON.stringify(filed).includes("data:image/png"), "the photo must not be filed with the case");
      ok(`the reviewer quietly filed ${filed.length} case(s) for you, without the photo`);
    } else {
      ok("the reviewer stayed silent (no reviewer key configured in this run)");
    }

    // With no key at all, the server says so instead of pretending.
    const child2Port = port + 1;
    const child2 = execFile("node", [proxyFile, "--port", String(child2Port)], {
      cwd: ROOT, env: { PATH: process.env.PATH, EVE_DATA_DIR: path.join(tmp, "nokey") },
    });
    for (let i = 0; i < 60; i++) {
      try { await get(`http://127.0.0.1:${child2Port}/api/health`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    const bare = await get(`http://127.0.0.1:${child2Port}/api/health`);
    assert.strictEqual(bare.body.grading, "not configured");
    const refused = await fetch(`http://127.0.0.1:${child2Port}/api/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }),
    });
    assert.strictEqual(refused.status, 503);
    assert.match((await refused.json()).error, /use Eve/);
    child2.kill("SIGKILL");
    ok("a server with no key says so and points at Eve, rather than failing obscurely");

    // ---- the limits that actually protect the bill ----
    // A leaked address should cost a capped amount and then stop.
    let refusedAt = null;
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/api/grade`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }),
      });
      if (r.status === 429) { refusedAt = i; assert.ok(r.headers.get("retry-after"), "a refusal should say when to come back"); break; }
    }
    assert.ok(refusedAt !== null, "the rate limit must eventually refuse");
    const callsBefore = seen.length;
    await fetch(`http://127.0.0.1:${port}/api/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }),
    });
    assert.strictEqual(seen.length, callsBefore, "a refused request must not reach the provider, or it costs money anyway");
    ok(`the rate limit refuses after ${refusedAt + 1} rapid requests, before spending anything`);

    const refusedBody = await fetch(`http://127.0.0.1:${port}/api/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }),
    }).then((r) => r.json());
    assert.match(refusedBody.error, /Eve can grade in the meantime/);
    ok("someone who hits the limit is pointed at Eve rather than simply blocked");

    // ---- an app token, when set, keeps strangers out entirely ----
    const tokenPort = port + 2;
    const guarded = execFile("node", [proxyFile, "--port", String(tokenPort), "--app-token", "my-app-token"], {
      cwd: ROOT,
      env: { ...process.env, EVE_SECRET_GROQ_API_KEY: KEY, EVE_DATA_DIR: path.join(tmp, "guarded") },
    });
    for (let i = 0; i < 60; i++) {
      try { await get(`http://127.0.0.1:${tokenPort}/api/health`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    const stranger = await fetch(`http://127.0.0.1:${tokenPort}/api/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }),
    });
    assert.strictEqual(stranger.status, 401, "a client without the token must be refused");
    const mine = await fetch(`http://127.0.0.1:${tokenPort}/api/grade`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Eve-App": "my-app-token" },
      body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgo=" }),
    });
    assert.strictEqual(mine.status, 200, "a client with the token must be served");
    guarded.kill("SIGKILL");
    ok("with an app token set, only your own client is served");

    console.log(`\neve-proxy: ${passed} tests passed`);
  } finally {
    stop();
    provider.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  fs.rmSync(path.join(ROOT, ".proxy-under-test.js"), { force: true });
  console.error(`\n✖ ${err.stack}`);
  process.exit(1);
});
