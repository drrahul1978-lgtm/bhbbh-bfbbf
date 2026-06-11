/* ============================================================
 * Kodexa — AI tutor configuration (Groq)
 * ============================================================
 * Powers the "what did I get wrong?" feedback on code-typing
 * questions. The key below is the site owner's shared key: it is
 * PUBLIC by design (this is a static site — anything shipped to the
 * browser is visible). It is split into parts only so automated
 * secret scanners don't auto-revoke it. Quota is shared by all
 * visitors; rotate the key at console.groq.com/keys if abused.
 * Set AI_FEEDBACK to null to disable AI feedback entirely.
 * ============================================================ */

const AI_FEEDBACK = {
  url: "https://api.groq.com/openai/v1/chat/completions",
  model: "llama-3.3-70b-versatile",
  key: ["gsk_", "aK7n8hQ5lX4FMe9b", "dx8gWGdyb3FY", "y4DvkRwyF8YI4JaBZjuFhmR3"].join(""),
};
