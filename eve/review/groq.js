/* groq.js — the ONLY file in EVE that knows Groq exists.
 *
 * This is a deliberate quarantine. Groq reviews work that has already been
 * done; it never participates in doing it. Nothing outside eve/review/ may
 * import this file, and test/review.test.js fails the build if anything does.
 *
 * Why that matters: everything else EVE does runs on your own hardware with no
 * cloud involved. Letting a remote model into the answering path would quietly
 * change what she is. Keeping it to the correction system means the worst case
 * is "the reviewer is unavailable", never "the answer came from somewhere else".
 *
 * The key is read from the vault at call time and never stored, logged,
 * embedded in a prompt template, or written into a skill file.
 */
"use strict";

const DEFAULTS = {
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  model: "llama-3.3-70b-versatile",
  secretName: "groq_api_key",
  timeoutMs: 30000,
};

/**
 * Build the transport the evaluator calls. Returns null when no key is
 * configured — which is not an error: EVE simply reports that no external
 * review was available and carries on.
 */
function makeGroqTransport({ vault, config = {}, fetchImpl } = {}) {
  const settings = { ...DEFAULTS, ...config };
  if (!vault || !vault.has(settings.secretName)) return null;

  const doFetch = fetchImpl || globalThis.fetch;

  return {
    provider: "groq",
    model: settings.model,

    async complete(systemPrompt, userPrompt) {
      // Read the key here, at the moment of use, so it never sits in a closure
      // or a config object that might be logged or serialised.
      const key = vault.get(settings.secretName);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
      try {
        const res = await doFetch(settings.endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: settings.model,
            temperature: 0,          // a reviewer should be repeatable
            max_tokens: 800,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Never echo the request back — it carried the key.
          throw new Error(`Groq replied ${res.status}${res.status === 401 ? " (the key was rejected)" : ""}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? "";
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

module.exports = { makeGroqTransport, DEFAULTS };
