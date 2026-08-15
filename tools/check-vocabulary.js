/* Find phrasings that look more like another intent than their own.
 *
 *   node tools/check-vocabulary.js
 *
 * Run this after adding phrasings to intent.js. Adding more ways of saying a
 * thing is not automatically more signal — it can be more confusion, and the
 * confusion is invisible by eye.
 *
 * This was learned the expensive way. A first attempt at a wider vocabulary
 * put "set the {thing} on" in turn_on, where it sits right beside set_level's
 * "set the {thing} to {number}", and "power up the {thing}" in turn_on, which
 * reads as turn_off. It measured six points WORSE than the vocabulary it
 * replaced. Rebuilt with every candidate filtered by this check, the same idea
 * was worth twenty-one points.
 *
 * Two things are fatal, and both are reported:
 *
 *   COLLISION — the phrasing is closer to a different intent than to its own
 *   siblings, so it teaches her the wrong boundary.
 *
 *   ORPHAN — the phrasing shares almost nothing with its own siblings. If it
 *   lands in the held-out quarter it cannot be got right by anyone, and it
 *   drags the honest score down for no reason.
 *
 * Similarity is Jaccard over content words, which is a fair proxy for what the
 * hashed bag-of-words actually sees.
 */
const STOP = new Set(["the", "a", "an", "my", "please", "can", "you", "i", "to", "is", "it", "me", "do", "of", "for", "that"]);

const words = (t) => new Set(
  String(t).toLowerCase()
    .replace(/\{thing\}|\{number\}/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
);

const jaccard = (a, b) => {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
};

/** For one template: how close is its nearest neighbour inside its own intent, versus outside it? */
function analyse(bank) {
  const all = [];
  for (const [intent, templates] of Object.entries(bank)) {
    for (const t of templates) all.push({ intent, text: t, w: words(t) });
  }

  const problems = [];
  const orphans = [];
  for (const row of all) {
    let own = 0, other = 0, otherText = "", otherIntent = "";
    for (const cmp of all) {
      if (cmp === row) continue;
      const s = jaccard(row.w, cmp.w);
      if (cmp.intent === row.intent) { own = Math.max(own, s); }
      else if (s > other) { other = s; otherText = cmp.text; otherIntent = cmp.intent; }
    }
    // Looks more like a different intent than like its own siblings.
    if (other >= own && other > 0.3) {
      problems.push({ ...row, own, other, otherText, otherIntent });
    }
    // Shares almost nothing with its own intent — unlearnable if held out.
    if (own < 0.2) orphans.push({ ...row, own });
  }
  return { total: all.length, problems, orphans };
}

function report(label, bank) {
  const { total, problems, orphans } = analyse(bank);
  console.log(`\n  ${label}: ${total} templates`);
  console.log(`    ${problems.length} closer to another intent than to their own`);
  console.log(`    ${orphans.length} sharing almost nothing with their own intent`);
  for (const p of problems.slice(0, 8)) {
    console.log(`      "${p.text}" [${p.intent}]  ${(p.other * 100).toFixed(0)}% like "${p.otherText}" [${p.otherIntent}] vs ${(p.own * 100).toFixed(0)}% own`);
  }
  for (const o of orphans.slice(0, 8)) {
    console.log(`      orphan: "${o.text}" [${o.intent}] — nearest sibling only ${(o.own * 100).toFixed(0)}%`);
  }
  return { total, problems: problems.length, orphans: orphans.length };
}

module.exports = { analyse, report, words, jaccard };

if (require.main === module) {
  const Intent = require("../intent.js");
  const { problems, orphans } = report("her vocabulary", Intent.INTENTS);
  console.log();
  process.exit(problems > 25 || orphans > 8 ? 1 : 0);
}
