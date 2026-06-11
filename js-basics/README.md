# ⚡ Kodexa — a game-like academy for learning to code

Learn **21 programming languages** through bite-size lessons, hearts, XP,
streaks and an endless swipe-style practice feed.

**Live site:** https://drrahul1978-lgtm.github.io/bhbbh-bfbbf/js-basics/

## The 21 courses

JavaScript (flagship, hand-written) · Python · HTML · CSS · SQL · TypeScript ·
Java · C# · C++ · C · Go · Rust · PHP · Ruby · Swift · Kotlin · Dart · Bash ·
Lua · R · Perl

Every language course has **10 units** (First Steps, Variables, Types & Text,
Math & Operators, Conditionals, Loops, Functions, Collections, Review and a
Mastery exam) — about **1,750 exercises** in total, each written in that
language's real syntax.

## Features

- 🔐 **Welcome screen** — continue with Apple / Google / email or as a guest.
  By default sign-in is simulated (profile + progress stay in localStorage).
  **Real sign-in is supported:** create a free Firebase project, enable the
  Google and Email providers, and paste the config into `firebase-config.js`
  (full step-by-step instructions are in that file). The site then uses the
  real Google login popup, real email+password accounts, and syncs progress
  to Firestore so it follows you across devices. Apple sign-in works too but
  additionally requires an Apple Developer account.
- 📚 **Learn tab** — course catalog with per-course progress, unit lists,
  linear lesson unlocking and treasure chests that pay out gems 💎.
- ♾️ **Practice tab** — an endless, full-screen scrolling feed of questions
  (like the Duolingo quick-quiz reel): answer inline, build a combo, swipe
  down for the next card. Filter by language or mix all 21.
- ❤️ **Hearts** — 5 per lesson; wrong answers cost one and the question
  returns later in the lesson until you get it right.
- ⚡ **XP, 🔥 day streaks, 🎯 accuracy** and a confetti celebration with
  Kodee, the mascot.
- 🎮 **4 exercise types** — multiple choice, fill-in-the-blank chips,
  type-the-output, and build-the-code token puzzles.

## Development

Plain static site — no build step, no backend:

- `index.html` — app shell (auth, catalog, course, lesson, practice screens)
- `style.css` — dark "code academy" theme
- `courses.js` — the full course catalog; 17 languages are generated from
  per-language syntax specs, JS/HTML/CSS/SQL are hand-written
- `app.js` — game engine, practice feed, profile & progress

Open `index.html` in a browser, or serve with `python3 -m http.server`.
Pushes to this branch auto-deploy to the `js-basics/` folder of the
`gh-pages` branch via `.github/workflows/deploy.yml` (the root of the Pages
site is used by another project in this repo).
