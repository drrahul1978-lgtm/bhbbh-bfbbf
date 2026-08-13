/* Build the language model Eve ships with.
 *
 *   node tools/train-intent.js
 *
 * Trains only on the three quarters of her phrase templates that are not held
 * back, and writes eve-intent.json. Training on all of them would produce a
 * model that scores 100% on its own exam, which tells you nothing and leaves
 * nothing to improve — see the note at the top of learn.js.
 */
const fs = require("fs");
const path = require("path");
const Intent = require("../intent.js");
const Learn = require("../learn.js");

const out = path.join(__dirname, "..", "eve-intent.json");

const { net, rows, accuracy } = Learn.trainBaseline();
const familiar = Learn.accuracy(net, rows);

fs.writeFileSync(out, JSON.stringify(Intent.toJSON(net)));

const size = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`
  Wrote eve-intent.json — ${size}KB, ${Intent.INTENT_NAMES.length} intents

    trained on          ${rows.length} sentences from ${Intent.INTENT_NAMES.length} intents
    held back entirely  ${Learn.heldOutShapes()} sentence shapes (${Learn.heldOutRows().length} test sentences)

    on phrasings she was trained on   ${(familiar * 100).toFixed(1)}%
    on shapes she has never seen      ${(accuracy * 100).toFixed(1)}%

  The second number is the honest one, and the one she improves.
`);
