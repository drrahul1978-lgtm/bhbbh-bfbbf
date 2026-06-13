# 💻 CodeDeck — Code Any Language in the Browser

A free, zero-setup **online code editor & runner**. Write and execute
**Python, JavaScript, TypeScript, C++, C, C#, Java, Go, Rust, Ruby, PHP,
Kotlin, Swift and Bash** — straight from the web, no installs, no accounts.

**Live site:** https://drrahul1978-lgtm.github.io/bhbbh-bfbbf/

## How it works

1. Open the site and pick a language from the dropdown.
2. Write your code in the editor (powered by **Monaco**, the same editor
   that runs inside VS Code — full syntax highlighting and autocomplete).
3. Add anything your program reads from **stdin** in the input box (optional).
4. Hit **▶ Run** (or press **Ctrl/Cmd + Enter**) and see the output instantly.

- **JavaScript** runs natively, right in your browser.
- **Python** runs **fully in your browser** via [Pyodide](https://pyodide.org)
  (CPython compiled to WebAssembly). The runtime downloads once on your first
  Python run, then every run after that is **instant and unlimited** — no
  network round-trip and no rate limits. `input()` reads from the stdin box.
- **TypeScript** also runs **fully in your browser** — the TypeScript compiler
  (itself just JavaScript) loads once, transpiles your code to JS, and runs it
  locally with no limits.
- **HTML** renders as a **live preview** that updates as you type, in a
  sandboxed iframe — inline CSS and JavaScript work too. Fully local, instant,
  unlimited.
- **Ruby** and **PHP** also run **in your browser** via their official
  WebAssembly builds ([ruby.wasm](https://github.com/ruby/ruby.wasm) and
  [php-wasm](https://github.com/seanmorris/php-wasm)). They load once on first
  use. If a runtime can't load (or PHP needs stdin), CodeDeck **automatically
  falls back to the Piston server**, so these languages always work.
- To make Python feel instant, its runtime is **preloaded in the background**
  shortly after the page opens — so by the time you hit Run it's usually ready.
- **Every other language** is compiled and executed by the free public
  [Piston](https://github.com/engineer-man/piston) API — there is no backend
  and no API key. Your code is sent directly to the Piston endpoint when you
  press Run, and the latest available runtime version is selected for you.

## Features

- 🌍 14 languages out of the box, easily extendable (see `LANGUAGES` in `app.js`).
- 🎨 VS Code's Monaco editor with per-language syntax highlighting.
- ⌨️ `Ctrl/Cmd + Enter` to run.
- 📥 Standard input (stdin) support for interactive-style programs.
- 🔗 **Share** button copies a link that encodes your language + code so you
  can hand someone a working snippet.
- ↔️ Draggable divider to resize the editor vs. the output panel.
- 📱 Responsive layout that stacks on mobile.

## Adding a language

Each entry in the `LANGUAGES` array in `app.js` describes one language:

```js
{
  id: "go", label: "Go", monaco: "go",
  piston: ["go", "golang"],   // candidate Piston names (first match wins)
  file: "main.go",             // filename Piston compiles/runs
  sample: "package main\n..."  // starter snippet
}
```

Anything in [Piston's runtime list](https://emkc.org/api/v2/piston/runtimes)
can be wired up the same way.

## Notes & limits

- **Python, JavaScript, TypeScript, HTML, Ruby and PHP run locally with no rate
  limits** — run them as much as you like. The remaining languages (C, C++, C#,
  Java, Go, Rust, Kotlin, Swift, Bash) need a full compiler toolchain that has
  no lightweight in-browser version, so they run on the shared, **rate-limited**
  free Piston API — running many quickly may briefly show a "rate limited"
  message; just wait a few seconds.
- Programs run in Piston's sandbox with limited CPU time and memory, so it's
  meant for learning, snippets and small programs — not heavy workloads.
- JavaScript runs in your own browser tab, so be mindful that infinite loops
  will hang the page.

## Development

It's a plain static site (`index.html`, `style.css`, `app.js`) — no build step.
Open `index.html` in a browser, or serve it with `python3 -m http.server`.
Deployment to GitHub Pages happens automatically via the workflow in
`.github/workflows/deploy.yml`.
