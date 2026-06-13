/* CodeDeck — a multi-language code editor & runner that lives entirely in the
 * browser. JavaScript runs natively; every other language is compiled/run via
 * the free public Piston API (https://github.com/engineer-man/piston). There is
 * no backend and no API key — your code is sent directly to the Piston endpoint
 * when you press Run.
 */

const PISTON = "https://emkc.org/api/v2/piston";

/* Each language maps to:
 *  - monaco:   the Monaco editor language id (for highlighting)
 *  - piston:   candidate Piston language names/aliases (first match wins)
 *  - file:     the filename Piston should compile/run
 *  - sample:   a "hello world" starter snippet
 * JavaScript is special-cased to run natively in the browser (piston: null).
 */
const LANGUAGES = [
  {
    id: "python", label: "Python", monaco: "python",
    piston: ["python", "python3"], file: "main.py",
    sample: `# Python\nname = input("What's your name? ") or "world"\nprint(f"Hello, {name}!")\n\nfor i in range(1, 6):\n    print(i, i ** 2)\n`
  },
  {
    id: "javascript", label: "JavaScript", monaco: "javascript",
    piston: null, file: "main.js",
    sample: `// JavaScript runs natively in your browser.\nconsole.log("Hello from JavaScript!");\n\nconst squares = [1, 2, 3, 4, 5].map(n => n * n);\nconsole.log("Squares:", squares);\n`
  },
  {
    id: "web", label: "Web (HTML + CSS + JS)", monaco: "html",
    piston: null, file: "web",
    sample: "",  // uses the separate webFiles buffers below
  },
  {
    id: "html", label: "HTML (live preview)", monaco: "html",
    piston: null, file: "index.html",
    sample: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <style>\n    body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; }\n    h1   { color: #6ea8fe; }\n    button { padding: .6rem 1.1rem; font-size: 1rem; border-radius: 8px;\n             border: none; background: #6ea8fe; color: #0b1020; cursor: pointer; }\n  </style>\n</head>\n<body>\n  <h1>Hello, HTML! \u{1F44B}</h1>\n  <p>Edit the code on the left and watch it update live.</p>\n  <button onclick="msg.textContent = 'You clicked! \u{1F389}'">Click me</button>\n  <p id="msg"></p>\n\n  <script>\n    console.log("Inline JavaScript runs in the preview too.");\n  <\/script>\n</body>\n</html>\n`
  },
  {
    id: "typescript", label: "TypeScript", monaco: "typescript",
    piston: ["typescript", "ts"], file: "main.ts",
    sample: `// TypeScript\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\nconsole.log(greet("TypeScript"));\n`
  },
  {
    id: "cpp", label: "C++", monaco: "cpp",
    piston: ["c++", "cpp"], file: "main.cpp",
    sample: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from C++!" << endl;\n    for (int i = 1; i <= 5; i++) cout << i * i << " ";\n    cout << endl;\n    return 0;\n}\n`
  },
  {
    id: "c", label: "C", monaco: "c",
    piston: ["c"], file: "main.c",
    sample: `#include <stdio.h>\n\nint main(void) {\n    printf("Hello from C!\\n");\n    for (int i = 1; i <= 5; i++) printf("%d ", i * i);\n    printf("\\n");\n    return 0;\n}\n`
  },
  {
    id: "csharp", label: "C#", monaco: "csharp",
    piston: ["csharp", "c#", "csharp.net", "mono"], file: "main.cs",
    sample: `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello from C#!");\n        for (int i = 1; i <= 5; i++) Console.Write($"{i * i} ");\n        Console.WriteLine();\n    }\n}\n`
  },
  {
    id: "java", label: "Java", monaco: "java",
    piston: ["java"], file: "Main.java",
    sample: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n        for (int i = 1; i <= 5; i++) System.out.print(i * i + " ");\n        System.out.println();\n    }\n}\n`
  },
  {
    id: "go", label: "Go", monaco: "go",
    piston: ["go", "golang"], file: "main.go",
    sample: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n    for i := 1; i <= 5; i++ {\n        fmt.Print(i*i, " ")\n    }\n    fmt.Println()\n}\n`
  },
  {
    id: "rust", label: "Rust", monaco: "rust",
    piston: ["rust"], file: "main.rs",
    sample: `fn main() {\n    println!("Hello from Rust!");\n    for i in 1..=5 {\n        print!("{} ", i * i);\n    }\n    println!();\n}\n`
  },
  {
    id: "ruby", label: "Ruby", monaco: "ruby",
    piston: ["ruby"], file: "main.rb",
    sample: `puts "Hello from Ruby!"\n(1..5).each { |i| print i * i, " " }\nputs\n`
  },
  {
    id: "php", label: "PHP", monaco: "php",
    piston: ["php"], file: "main.php",
    sample: `<?php\necho "Hello from PHP!\\n";\nfor ($i = 1; $i <= 5; $i++) echo $i * $i, " ";\necho "\\n";\n`
  },
  {
    id: "kotlin", label: "Kotlin", monaco: "kotlin",
    piston: ["kotlin"], file: "main.kt",
    sample: `fun main() {\n    println("Hello from Kotlin!")\n    for (i in 1..5) print("\${i * i} ")\n    println()\n}\n`
  },
  {
    id: "swift", label: "Swift", monaco: "swift",
    piston: ["swift"], file: "main.swift",
    sample: `print("Hello from Swift!")\nfor i in 1...5 { print(i * i, terminator: " ") }\nprint()\n`
  },
  {
    id: "bash", label: "Bash", monaco: "shell",
    piston: ["bash", "sh"], file: "main.sh",
    sample: `#!/usr/bin/env bash\necho "Hello from Bash!"\nfor i in 1 2 3 4 5; do\n  echo -n "$((i * i)) "\ndone\necho\n`
  },
];

// ----- DOM refs -----
const $ = (id) => document.getElementById(id);
const languageSelect = $("languageSelect");
const runBtn = $("runBtn");
const stdinEl = $("stdin");
const outputEl = $("output");
const statusBar = $("statusBar");
const runtimeBadge = $("runtimeBadge");
const fileNameEl = $("fileName");

let editor = null;          // Monaco editor instance
let runtimes = [];          // resolved Piston runtimes
let currentLang = LANGUAGES[0];
const codeCache = {};        // remember per-language edits during the session

// "Web" mode keeps three separate buffers combined into one live preview.
let currentWebPart = "html";
const webFiles = {
  html: `<h1>Hello, Web! \u{1F44B}</h1>\n<p>Edit the HTML, CSS and JS tabs above — the preview updates live.</p>\n<button id="go">Click me</button>\n<p id="out"></p>\n`,
  css: `body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; color: #222; }\nh1 { color: #6ea8fe; }\nbutton {\n  padding: .6rem 1.1rem; font-size: 1rem; cursor: pointer;\n  border: none; border-radius: 8px; background: #6ea8fe; color: #0b1020;\n}\n`,
  js: `document.getElementById("go").addEventListener("click", () => {\n  document.getElementById("out").textContent = "You clicked! \u{1F389}";\n});\n`,
};
const DEFAULT_WEB = { ...webFiles };  // pristine copies for the Reset button

let pyodideReady = null;     // lazy-loaded Pyodide (in-browser Python) promise
let pyodideLoaded = false;   // true once Pyodide has finished downloading
let rubyReady = null, rubyLoaded = false;   // ruby.wasm
let phpReady = null, phpLoaded = false;     // php-wasm

// ----- Output helpers -----
function clearOutput() {
  outputEl.innerHTML = '<span class="output-placeholder">Output cleared. Hit Run ▶</span>';
}
function writeOutput(parts) {
  outputEl.innerHTML = "";
  for (const [cls, text] of parts) {
    if (text == null || text === "") continue;
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    outputEl.appendChild(span);
  }
  outputEl.scrollTop = 0;
}
function setStatus(msg) { statusBar.textContent = msg; }

// HTML: render the code as a live preview inside a sandboxed iframe.
function renderHtml(code) {
  const iframe = $("preview");
  iframe.srcdoc = code;
  setStatus("Live preview updated.");
}

// Web mode: combine the three buffers into one document and preview it.
function renderWeb() {
  if (editor) webFiles[currentWebPart] = editor.getValue();
  const doc =
`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
${webFiles.css}
</style>
</head>
<body>
${webFiles.html}
<script>
${webFiles.js}
<\/script>
</body>
</html>`;
  $("preview").srcdoc = doc;
  setStatus("Live preview updated.");
}

function setActiveWebTab() {
  document.querySelectorAll(".web-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.part === currentWebPart));
}

// Switch between the HTML / CSS / JS tabs without leaving Web mode.
function switchWebPart(part) {
  if (!editor || part === currentWebPart) return;
  webFiles[currentWebPart] = editor.getValue();
  currentWebPart = part;
  setActiveWebTab();
  const lang = part === "js" ? "javascript" : part; // html | css | javascript
  monaco.editor.setModelLanguage(editor.getModel(), lang);
  editor.setValue(webFiles[part]);
  renderWeb();
}

// Swap the IO pane between text output and the live preview (HTML / Web modes).
function updateIoMode() {
  const isPreview = currentLang.id === "html" || currentLang.id === "web";
  $("preview").classList.toggle("hidden", !isPreview);
  $("output").classList.toggle("hidden", isPreview);
  $("stdinBlock").classList.toggle("hidden", isPreview);
  $("webTabs").classList.toggle("hidden", currentLang.id !== "web");
  $("fileName").classList.toggle("hidden", currentLang.id === "web");
  $("outputLabel").textContent = isPreview ? "Preview" : "Output";
  if (currentLang.id === "html" && editor) renderHtml(editor.getValue());
  if (currentLang.id === "web" && editor) renderWeb();
}

// ----- Language selection & editor wiring -----
function buildLanguageOptions() {
  languageSelect.innerHTML = "";
  for (const lang of LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = lang.id;
    opt.textContent = lang.label;
    languageSelect.appendChild(opt);
  }
}

function pistonRuntimeFor(lang) {
  if (!lang.piston) return null;
  for (const alias of lang.piston) {
    const rt = runtimes.find(
      (r) => r.language === alias || (r.aliases || []).includes(alias)
    );
    if (rt) return rt;
  }
  return null;
}

function updateRuntimeBadge() {
  if (currentLang.id === "html") {
    runtimeBadge.textContent = "HTML · live preview";
    return;
  }
  if (currentLang.id === "web") {
    runtimeBadge.textContent = "Web · live preview";
    return;
  }
  if (currentLang.id === "javascript") {
    runtimeBadge.textContent = "browser engine";
    return;
  }
  if (currentLang.id === "python") {
    runtimeBadge.textContent = pyodideLoaded ? "Python · in-browser" : "Python · in-browser (loads on first run)";
    return;
  }
  if (currentLang.id === "typescript") {
    runtimeBadge.textContent = tsReady ? "TypeScript · in-browser" : "TypeScript · in-browser (loads on first run)";
    return;
  }
  if (currentLang.id === "ruby") {
    runtimeBadge.textContent = rubyLoaded ? "Ruby · in-browser" : "Ruby · in-browser (loads on first run)";
    return;
  }
  if (currentLang.id === "php") {
    runtimeBadge.textContent = phpLoaded ? "PHP · in-browser" : "PHP · in-browser (loads on first run)";
    return;
  }
  if (!runtimes.length) {
    runtimeBadge.textContent = "loading runtimes…";
    return;
  }
  const rt = pistonRuntimeFor(currentLang);
  runtimeBadge.textContent = rt ? `${rt.language} ${rt.version}` : "runtime unavailable";
}

function selectLanguage(id, { useSampleIfEmpty = true } = {}) {
  // stash the code we're leaving
  if (editor && currentLang) {
    if (currentLang.id === "web") webFiles[currentWebPart] = editor.getValue();
    else codeCache[currentLang.id] = editor.getValue();
  }

  currentLang = LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
  languageSelect.value = currentLang.id;
  fileNameEl.textContent = currentLang.file;

  if (editor) {
    if (currentLang.id === "web") {
      currentWebPart = "html";
      setActiveWebTab();
      monaco.editor.setModelLanguage(editor.getModel(), "html");
      editor.setValue(webFiles.html);
    } else {
      const cached = codeCache[currentLang.id];
      const value = cached != null ? cached : (useSampleIfEmpty ? currentLang.sample : "");
      monaco.editor.setModelLanguage(editor.getModel(), currentLang.monaco);
      editor.setValue(value);
    }
  }
  updateRuntimeBadge();
  updateIoMode();
}

// ----- Running code -----
async function runCode() {
  const code = editor ? editor.getValue() : "";
  const stdin = stdinEl.value;

  // Preview modes are instant and may have empty buffers — handle up front.
  if (currentLang.id === "web") { renderWeb(); return; }
  if (currentLang.id === "html") { renderHtml(code); return; }

  if (!code.trim()) {
    writeOutput([["out-meta", "Nothing to run — the editor is empty."]]);
    return;
  }

  runBtn.disabled = true;
  const t0 = performance.now();

  try {
    if (currentLang.id === "javascript") {
      runJavaScript(code);
    } else if (currentLang.id === "typescript") {
      await runTypeScript(code);
    } else if (currentLang.id === "python") {
      await runPython(code, stdin, t0);
    } else if (currentLang.id === "ruby") {
      await runRuby(code, stdin, t0);
    } else if (currentLang.id === "php") {
      await runPhp(code, stdin, t0);
    } else {
      await runViaPiston(code, stdin, t0);
    }
  } catch (err) {
    writeOutput([["out-stderr", "Error: " + (err && err.message ? err.message : String(err))]]);
    setStatus("Run failed.");
  } finally {
    runBtn.disabled = false;
  }
}

// JavaScript: capture console output and run in the page (sandboxed-ish via Function).
function runJavaScript(code, label = "JavaScript") {
  setStatus(`Running ${label} in your browser…`);
  const logs = [];
  const fmt = (args) => args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
  }).join(" ");

  const sandboxConsole = {
    log: (...a) => logs.push(["out-stdout", fmt(a) + "\n"]),
    info: (...a) => logs.push(["out-info", fmt(a) + "\n"]),
    warn: (...a) => logs.push(["out-meta", fmt(a) + "\n"]),
    error: (...a) => logs.push(["out-stderr", fmt(a) + "\n"]),
  };

  const t0 = performance.now();
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("console", `"use strict";\n${code}`);
    const result = fn(sandboxConsole);
    if (result !== undefined) logs.push(["out-meta", "⇒ " + fmt([result]) + "\n"]);
  } catch (err) {
    logs.push(["out-stderr", (err && err.stack ? err.stack : String(err)) + "\n"]);
  }
  const ms = Math.round(performance.now() - t0);
  if (!logs.length) logs.push(["out-meta", "(no output)\n"]);
  logs.push(["out-ok", `\n✓ finished in ${ms} ms (${label} · browser, no limits)`]);
  writeOutput(logs);
  setStatus("Done.");
}

// TypeScript: load the TS compiler once, transpile to JS, then run it locally.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

let tsReady = null;
function getTypeScript() {
  if (!tsReady) {
    setStatus("Loading the TypeScript compiler once… future runs are instant.");
    writeOutput([["out-meta", "⏳ First TypeScript run: downloading the compiler once…"]]);
    runtimeBadge.textContent = "TypeScript · loading…";
    tsReady = loadScript("https://cdn.jsdelivr.net/npm/typescript@5.4.5/lib/typescript.js")
      .then(() => { runtimeBadge.textContent = "TypeScript · in-browser"; return window.ts; })
      .catch((err) => { tsReady = null; throw err; });
  }
  return tsReady;
}

async function runTypeScript(code) {
  const ts = await getTypeScript();
  let js;
  try {
    js = ts.transpile(code, {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
    });
  } catch (err) {
    writeOutput([["out-stderr", "TypeScript compile error: " + (err && err.message ? err.message : String(err))]]);
    setStatus("Compile failed.");
    return;
  }
  runJavaScript(js, "TypeScript");
}

// Python runs locally in the browser via Pyodide (WebAssembly CPython).
// The runtime is downloaded once on the first run, then every run is instant
// and unlimited — no network round-trip and no rate limits.
function getPyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" })
      .then((py) => { pyodideLoaded = true; if (currentLang.id === "python") updateRuntimeBadge(); return py; })
      .catch((err) => { pyodideReady = null; throw err; });
  }
  return pyodideReady;
}

async function runPython(code, stdin, t0) {
  const py = await getPyodide();
  const startedAt = performance.now();
  const out = [];

  py.setStdout({ batched: (s) => out.push(["out-stdout", s + "\n"]) });
  py.setStderr({ batched: (s) => out.push(["out-stderr", s + "\n"]) });

  // Feed the whole stdin box on first read, then signal EOF.
  let stdinSent = false;
  py.setStdin({
    stdin: () => { if (stdinSent) return null; stdinSent = true; return stdin || ""; },
  });

  writeOutput([["out-meta", "⏳ Running Python in your browser…"]]);
  try {
    await py.runPythonAsync(code);
    const ms = Math.round(performance.now() - startedAt);
    if (!out.length) out.push(["out-meta", "(no output)\n"]);
    out.push(["out-ok", `\n✓ finished in ${ms} ms (in-browser Python, no limits)`]);
    writeOutput(out);
    setStatus("Done.");
  } catch (err) {
    out.push(["out-stderr", "\n" + (err && err.message ? err.message : String(err))]);
    writeOutput(out);
    setStatus("Python raised an error.");
  }
}

// Ruby runs locally via ruby.wasm (official CRuby compiled to WebAssembly).
function getRuby() {
  if (!rubyReady) {
    rubyReady = (async () => {
      const { DefaultRubyVM } = await import("https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.6.2/dist/browser/+esm");
      const resp = await fetch("https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@2.6.2/dist/ruby+stdlib.wasm");
      const mod = await WebAssembly.compile(await resp.arrayBuffer());
      const { vm } = await DefaultRubyVM(mod);
      rubyLoaded = true;
      if (currentLang.id === "ruby") updateRuntimeBadge();
      return vm;
    })().catch((err) => { rubyReady = null; throw err; });
  }
  return rubyReady;
}

// Build a single-quoted Ruby string literal (no interpolation, safe for stdin).
function rubyStr(s) {
  return "'" + String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

async function runRuby(code, stdin, t0) {
  let vm;
  try { vm = await getRuby(); }
  catch { return fallbackToPiston(code, stdin, t0, "Ruby"); }

  const started = performance.now();
  // Redirect Ruby's $stdout/$stderr into a buffer and feed stdin from a StringIO,
  // so we capture output as a return value instead of via WASI plumbing.
  const wrapped =
`require 'stringio'
$stdin = StringIO.new(${rubyStr(stdin)})
__buf = StringIO.new
$stdout = __buf
$stderr = __buf
__err = nil
begin
${code}
rescue Exception => e
  __err = "#{e.class}: #{e.message}"
end
$stdout = STDOUT
$stderr = STDERR
__buf.string + (__err ? (__buf.string.empty? ? '' : "\\n") + __err : '')`;

  let text;
  try { text = vm.eval(wrapped).toString(); }
  catch { return fallbackToPiston(code, stdin, t0, "Ruby"); }

  const ms = Math.round(performance.now() - started);
  const parts = [];
  if (text) parts.push(["out-stdout", text.endsWith("\n") ? text : text + "\n"]);
  else parts.push(["out-meta", "(no output)\n"]);
  parts.push(["out-ok", `\n✓ finished in ${ms} ms (in-browser Ruby, no limits)`]);
  writeOutput(parts);
  setStatus("Done.");
}

// PHP runs locally via php-wasm.
function getPhp() {
  if (!phpReady) {
    phpReady = (async () => {
      const { PhpWeb } = await import("https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs");
      const php = new PhpWeb();
      await php.binary;            // resolves once the wasm runtime is ready
      phpLoaded = true;
      if (currentLang.id === "php") updateRuntimeBadge();
      return php;
    })().catch((err) => { phpReady = null; throw err; });
  }
  return phpReady;
}

async function runPhp(code, stdin, t0) {
  // Local php-wasm stdin support is unreliable; route those runs to Piston.
  if (stdin && stdin.trim()) return fallbackToPiston(code, stdin, t0, "PHP");
  let php;
  try { php = await getPhp(); }
  catch { return fallbackToPiston(code, stdin, t0, "PHP"); }

  const started = performance.now();
  let out = "";
  const collect = (ev) => { const d = ev.detail; out += Array.isArray(d) ? d.join("") : (d ?? ""); };
  php.addEventListener("output", collect);
  php.addEventListener("error", collect);

  let exit = 0;
  try {
    exit = await php.run(/<\?/.test(code) ? code : "<?php\n" + code);
  } catch {
    php.removeEventListener("output", collect);
    php.removeEventListener("error", collect);
    return fallbackToPiston(code, stdin, t0, "PHP");
  }
  php.removeEventListener("output", collect);
  php.removeEventListener("error", collect);

  const ms = Math.round(performance.now() - started);
  const parts = [];
  if (out) parts.push(["out-stdout", out.endsWith("\n") ? out : out + "\n"]);
  else parts.push(["out-meta", "(no output)\n"]);
  parts.push(["out-ok", `\n✓ exit code ${exit} · in-browser PHP, no limits · ${ms} ms`]);
  writeOutput(parts);
  setStatus("Done.");
}

// Shared graceful fallback: if a local WASM runtime can't load/run, use Piston.
async function fallbackToPiston(code, stdin, t0, label) {
  writeOutput([["out-meta", `${label}: in-browser runtime unavailable — running on the Piston server instead…`]]);
  await runViaPiston(code, stdin, t0);
}

async function runViaPiston(code, stdin, t0) {
  const rt = pistonRuntimeFor(currentLang);
  if (!rt) {
    writeOutput([["out-stderr",
      `No runtime available for ${currentLang.label}. The Piston service may not support it right now.`]]);
    setStatus("Runtime unavailable.");
    return;
  }

  setStatus("Running…");
  writeOutput([["out-meta", "Running…"]]);

  const res = await fetch(`${PISTON}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: rt.language,
      version: rt.version,
      files: [{ name: currentLang.file, content: code }],
      stdin: stdin || "",
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.message) detail += ` — ${j.message}`; } catch {}
    if (res.status === 429) detail = "Rate limited by the free Piston API — wait a few seconds and try again.";
    writeOutput([["out-stderr", "Execution service error: " + detail]]);
    setStatus("Run failed.");
    return;
  }

  const data = await res.json();
  const ms = Math.round(performance.now() - t0);
  const parts = [];

  // Compile step (for compiled languages) may carry errors.
  if (data.compile && (data.compile.stderr || data.compile.code !== 0)) {
    if (data.compile.stdout) parts.push(["out-stdout", data.compile.stdout]);
    if (data.compile.stderr) parts.push(["out-stderr", data.compile.stderr]);
  }

  const run = data.run || {};
  if (run.stdout) parts.push(["out-stdout", run.stdout]);
  if (run.stderr) parts.push(["out-stderr", run.stderr]);

  if (!parts.length) parts.push(["out-meta", "(no output)\n"]);

  const exit = run.code;
  const ok = (data.compile ? data.compile.code === 0 : true) && exit === 0;
  parts.push([ok ? "out-ok" : "out-meta",
    `\n${ok ? "✓" : "•"} exit code ${exit ?? "?"} · ${rt.language} ${rt.version} · ${ms} ms`]);

  writeOutput(parts);
  setStatus("Done.");
}

// ----- Share / reset -----
function shareCode() {
  let code;
  if (currentLang.id === "web") {
    if (editor) webFiles[currentWebPart] = editor.getValue();
    code = JSON.stringify(webFiles);
  } else {
    code = editor ? editor.getValue() : "";
  }
  const payload = encodeURIComponent(btoa(unescape(encodeURIComponent(code))));
  const url = `${location.origin}${location.pathname}#lang=${currentLang.id}&code=${payload}`;
  navigator.clipboard.writeText(url).then(
    () => setStatus("Shareable link copied to clipboard ✓"),
    () => setStatus("Couldn't copy — here's the link: " + url)
  );
}

function loadFromHash() {
  if (!location.hash) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  const lang = params.get("lang");
  const code = params.get("code");
  if (!lang || !LANGUAGES.find((l) => l.id === lang)) return null;
  let decoded = null;
  if (code) {
    try { decoded = decodeURIComponent(escape(atob(decodeURIComponent(code)))); } catch { decoded = null; }
  }
  return { lang, code: decoded };
}

function resetCode() {
  if (currentLang.id === "web") {
    webFiles[currentWebPart] = DEFAULT_WEB[currentWebPart];
    if (editor) editor.setValue(webFiles[currentWebPart]);
    renderWeb();
    setStatus(`Reset the ${currentWebPart.toUpperCase()} tab to its starter snippet.`);
    return;
  }
  delete codeCache[currentLang.id];
  if (editor) editor.setValue(currentLang.sample);
  setStatus(`Reset ${currentLang.label} to the starter snippet.`);
}

// ----- Resizable divider -----
function setupDivider() {
  const divider = $("divider");
  const workspace = document.querySelector(".workspace");
  const editorPane = document.querySelector(".editor-pane");
  if (!divider) return;
  let dragging = false;
  divider.addEventListener("mousedown", () => { dragging = true; document.body.style.cursor = "col-resize"; });
  window.addEventListener("mouseup", () => { dragging = false; document.body.style.cursor = ""; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    if (pct > 20 && pct < 85) {
      editorPane.style.flex = `1 1 ${pct}%`;
      if (editor) editor.layout();
    }
  });
}

// ----- Boot -----
function initEditor(value, lang) {
  require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
  require(["vs/editor/editor.main"], () => {
    editor = monaco.editor.create($("editor"), {
      value: value,
      language: lang,
      theme: "vs-dark",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 4,
      padding: { top: 12 },
    });
    // Ctrl/Cmd+Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
    // Live preview as you type for HTML and Web modes (debounced).
    let previewTimer = null;
    editor.onDidChangeModelContent(() => {
      if (currentLang.id !== "html" && currentLang.id !== "web") return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(
        () => (currentLang.id === "web" ? renderWeb() : renderHtml(editor.getValue())),
        250
      );
    });
    updateRuntimeBadge();
    updateIoMode();
    setStatus("Editor ready.");
  });
}

async function loadRuntimes() {
  try {
    const res = await fetch(`${PISTON}/runtimes`);
    runtimes = await res.json();
    updateRuntimeBadge();
  } catch {
    // Piston unreachable — local languages still run.
  }
}

function boot() {
  buildLanguageOptions();

  const fromHash = loadFromHash();
  if (fromHash) {
    currentLang = LANGUAGES.find((l) => l.id === fromHash.lang) || LANGUAGES[0];
  }
  languageSelect.value = currentLang.id;
  fileNameEl.textContent = currentLang.file;
  $("webTabs").classList.toggle("hidden", currentLang.id !== "web");

  let initialValue, initialLang;
  if (currentLang.id === "web") {
    if (fromHash && fromHash.code) {
      try { Object.assign(webFiles, JSON.parse(fromHash.code)); } catch {}
    }
    currentWebPart = "html";
    setActiveWebTab();
    initialValue = webFiles.html;
    initialLang = "html";
  } else {
    initialValue = fromHash && fromHash.code != null ? fromHash.code : currentLang.sample;
    initialLang = currentLang.monaco;
  }

  initEditor(initialValue, initialLang);
  loadRuntimes();
  setupDivider();

  // Warm up Python in the background so its first run feels instant.
  setTimeout(() => { getPyodide().catch(() => {}); }, 1200);

  languageSelect.addEventListener("change", (e) => selectLanguage(e.target.value));
  runBtn.addEventListener("click", runCode);
  document.querySelectorAll(".web-tab").forEach((btn) =>
    btn.addEventListener("click", () => switchWebPart(btn.dataset.part)));

  // global Ctrl/Cmd+Enter even when focus is in stdin
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); }
  });
}

boot();
