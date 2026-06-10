# 🃏 GradeMyCard — AI Trading Card Grader

Upload a photo of a **Pokémon, football, baseball or basketball card** and get an
instant, PSA-style AI condition estimate — centering, corners, edges & surface
subgrades plus an overall 1–10 grade — powered by **Meta's Llama 4 vision model**.

**Live site:** https://drrahul1978-lgtm.github.io/bhbbh-bfbbf/

## How it works

1. Open the site and click **⚙️ API Settings**.
2. Pick a provider — **Groq** is recommended (free tier, no credit card):
   create a key at [console.groq.com/keys](https://console.groq.com/keys).
3. Paste your API key and save. The key is stored **only in your browser's
   localStorage** and is sent directly to the AI provider — there is no backend.
4. Upload (or drag-drop / paste) a photo of your card and hit **Grade my card**.

The Llama 4 Scout vision model inspects the photo and returns subgrades for
centering, corners, edges and surface, an overall grade with a PSA-style label
(Gem Mint → Poor), and grader's notes about specific flaws it spotted.

### Supported providers

| Provider   | Default model                              | Get a key |
|------------|--------------------------------------------|-----------|
| Groq       | `meta-llama/llama-4-scout-17b-16e-instruct`| [console.groq.com/keys](https://console.groq.com/keys) |
| OpenRouter | `meta-llama/llama-4-scout`                 | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Together   | `meta-llama/Llama-4-Scout-17B-16E-Instruct`| [api.together.ai](https://api.together.ai/settings/api-keys) |

Any OpenAI-compatible vision model name can be typed into the model field.

## Tips for better grades

- Use bright, even lighting (no glare on the card surface).
- Shoot straight-on so all four borders are visible.
- Fill the frame with the card and keep it in sharp focus.

## Disclaimer

This is an AI **estimate** from a single photo — for fun and rough triage only.
It is not a professional grade. For official grading use PSA, BGS, SGC or CGC.

## Development

It's a plain static site (`index.html`, `style.css`, `app.js`) — no build step.
Open `index.html` in a browser, or serve it with `python3 -m http.server`.
Deployment to GitHub Pages happens automatically via the workflow in
`.github/workflows/deploy.yml`.
