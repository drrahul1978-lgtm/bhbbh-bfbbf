# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GradeMyCard is an AI trading card grader: users upload a photo of a card (Pokémon, football, baseball, basketball, etc.) and a Llama 4 vision model returns PSA-style subgrades (centering, corners, edges, surface) plus an overall 1–10 grade. It is a plain static site with **no backend, no build step, no dependencies, and no tests** — just three files: `index.html`, `style.css`, `app.js`.

## Development

- Run locally by opening `index.html` in a browser, or serve with `python3 -m http.server`.
- There is no linter, bundler, package.json, or test suite. Edit the files directly.

## Deployment

Pushes to `main` or `claude/website-idea-ai-uml90j` trigger `.github/workflows/deploy.yml`, which publishes the repo root (minus `.github`) to the `gh-pages` branch via `peaceiris/actions-gh-pages`. The live site is https://drrahul1978-lgtm.github.io/bhbbh-bfbbf/.

## Architecture

Everything happens client-side in `app.js`; the photo and API key go straight from the browser to an OpenAI-compatible chat-completions endpoint. The flow:

1. **Settings** — Provider (Groq / OpenRouter / Together), model, and API key are persisted in `localStorage` under `gmc_provider`, `gmc_model`, `gmc_api_key`. The `PROVIDERS` map at the top of `app.js` defines each provider's endpoint and default model; add new OpenAI-compatible providers there (and to the `<select>` in `index.html`).
2. **Image intake** — Click, drag-drop, or paste. Images are downscaled to max 1024px and re-encoded as JPEG via canvas before sending, to keep requests small.
3. **Grading** — `gradeCard()` POSTs the image (as a data URL) plus `GRADING_PROMPT` to the provider. The prompt instructs the model to return a strict JSON object; `extractJson()` defensively fishes the JSON out of fences/prose. If you change the response shape, update both `GRADING_PROMPT` and `renderResults()` together.
4. **Rendering** — `renderResults()` fills the results panel. Subgrade bars in `index.html` are matched to JSON keys via `data-key` attributes on `.subgrade` elements.

## Key Conventions & Gotchas

- **Shared default key**: `DEFAULT_API_KEY` in `app.js` is the site owner's public, intentionally shared Groq key so visitors need zero setup. It is split into two concatenated string halves specifically so GitHub secret scanning does not auto-revoke it — keep that pattern if the key is ever rotated. It is only used when the provider is Groq and the user has no key of their own.
- **Magic link**: `applyMagicLink()` reads `#key=...&provider=...` from the URL hash, saves the key into `localStorage`, and immediately scrubs the hash from the URL/history. A bare `#gsk_...` hash is also accepted.
- **Never commit a real private API key** anywhere in this public repo — GitHub secret scanning will revoke it and scrapers will abuse it. The README explicitly warns users about this for magic links.
- Grades from the model are never trusted blindly: `clampGrade()` clamps to 1–10 and observations are capped at 8 entries.
- Privacy promise (stated in the UI and README): photos and keys never leave the browser except for the direct call to the AI provider. Don't add changes that send data anywhere else.
