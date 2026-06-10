# ⚡ Kodexa — Learn JavaScript the Duolingo way

A free, game-like website for learning the **basics of JavaScript**: bite-size
lessons, hearts, XP, day streaks, confetti and a winding lesson path — just
like Duolingo, but for code.

**Live site:** https://drrahul1978-lgtm.github.io/bhbbh-bfbbf/js-basics/

## What you'll learn

8 units, 16 lessons, ~100 exercises covering the fundamentals:

1. **First Steps** — `console.log`, comments & syntax
2. **Variables** — `let`, `const`, assignment, naming
3. **Data Types** — numbers, strings, booleans, `typeof`
4. **Operators** — math, comparisons (`===`), logic (`&&`, `||`, `!`)
5. **Conditionals** — `if`, `else`, `else if`
6. **Loops** — `for`, `while`, `do...while`
7. **Functions** — declaring, calling, parameters, `return`
8. **Arrays** — indexes, `length`, `push`/`pop`, `includes`

## How it plays

- 🗺️ **Lesson path** — lessons unlock one at a time; finish a unit to earn its crown 👑
- ❤️ **Hearts** — 5 per lesson; a wrong answer costs one, and the question
  comes back later in the lesson until you get it right
- ⚡ **XP** — earn XP for every correct answer, finished lesson and perfect run
- 🔥 **Streak** — practice on consecutive days to grow it
- 🎮 **4 exercise types** — multiple choice, fill-in-the-blank,
  type-the-output, and build-the-code token puzzles

No account, no backend — progress is saved in your browser's localStorage.

## Development

It's a plain static site (`index.html`, `style.css`, `app.js`) — no build step.
Open `index.html` in a browser, or serve it with `python3 -m http.server`.

Pushes to this branch deploy automatically to the `js-basics/` folder of the
`gh-pages` branch via `.github/workflows/deploy.yml` (the root of the Pages
site is used by another project in this repo).
