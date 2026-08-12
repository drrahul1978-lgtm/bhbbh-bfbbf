/* map.js — an honest account of what EVE can actually do.
 *
 * Ratings are never stored. They are recomputed from evidence every time they
 * are read, because a stored rating is a claim that outlives the thing it was
 * based on — a skill can rot, a success rate can fall, and a number written
 * down last month will happily keep saying "strong" while it happens.
 *
 * Four things follow from that, and each is enforced below:
 *
 *   No evidence means UNSUPPORTED, not "unknown" and never a default. If EVE
 *   has never done something, the map says so plainly.
 *
 *   A rating is capped by how much evidence there is. Three successes is not
 *   "strong" — it is "limited, on three runs". Confidence is reported next to
 *   the level so the two are never confused.
 *
 *   Failures and corrections pull a rating down. Being told she was wrong is
 *   evidence about a capability, not just about one answer.
 *
 *   A gap is reported with whether it can be closed, and how. "Unsupported" is
 *   more useful when it comes with either a route to acquiring the capability
 *   or a plain statement of what is missing.
 */
"use strict";

const LEVEL = {
  UNSUPPORTED: "unsupported",  // never done it
  LIMITED: "limited",          // done it, badly or barely
  MODERATE: "moderate",        // works, with a real failure rate
  STRONG: "strong",            // works reliably, on enough runs to mean it
};

const ORDER = [LEVEL.UNSUPPORTED, LEVEL.LIMITED, LEVEL.MODERATE, LEVEL.STRONG];

/** How much evidence a level needs. A rating cannot exceed what the samples support. */
const REQUIRED_SAMPLES = { [LEVEL.LIMITED]: 1, [LEVEL.MODERATE]: 10, [LEVEL.STRONG]: 30 };

/**
 * Routes by which a missing capability could be acquired. Each says honestly
 * whether EVE can walk it herself, or what stands in the way.
 */
const ACQUISITION = [
  {
    id: "rest_api",
    matches: /\b(api|rest|http|endpoint|webhook|json|service|server|hub|bridge)\b/i,
    available: true,
    how: "point me at it with --api and I will read its description, write an adapter, test it in isolation and install it if it works",
    needs: ["the address", "a token if it needs one", "NETWORK_ACCESS"],
  },
  {
    id: "home_automation",
    matches: /\b(light|lamp|switch|thermostat|door|blind|plug|sensor|home ?assistant|mqtt)\b/i,
    available: true,
    how: "if it speaks a REST API I can write an adapter for it the same way I did for Home Assistant",
    needs: ["the address", "a long-lived token", "HOME_AUTOMATION permission"],
  },
  {
    id: "hardware",
    matches: /\b(gpio|pin|camera|microphone|bluetooth|serial|usb|i2c|spi|3d ?print|printer)\b/i,
    available: false,
    how: null,
    blocker: "this needs a driver and physical access I do not have — a REST bridge in front of the hardware is the realistic route",
    needs: ["a driver or a bridge that exposes it over the network"],
  },
  {
    id: "open_ended_reasoning",
    matches: /\b(write me|explain|summar|essay|translate|chat|reason about|think about|opinion)\b/i,
    available: false,
    how: null,
    blocker: "this needs a language model. Mine classify; they do not compose. Nothing is configured in config.model, and training longer will not change it",
    needs: ["a model configured in config.model"],
  },
];

/**
 * A domain of capability, and where the evidence for it comes from.
 * `collect` returns { successes, failures, corrections, note } from live data.
 */
function defaultDomains({ registry, cases, suite, memory }) {
  const skillStats = (predicate) => {
    if (!registry) return null;
    const skills = registry.list().filter(predicate);
    if (!skills.length) return null;
    const runs = skills.reduce((a, s) => a + (s.runs || 0), 0);
    if (!runs) return { successes: 0, failures: 0, note: `${skills.length} skill(s) installed but never run` };
    const successes = skills.reduce((a, s) => a + Math.round((s.successRate || 0) * (s.runs || 0)), 0);
    return { successes, failures: runs - successes, note: `${skills.length} skill(s), ${runs} runs` };
  };

  const correctionsFor = (pattern) => {
    if (!cases) return 0;
    return cases.settled().filter((c) =>
      pattern.test(`${c.question} ${c.answer}`) && c.human?.verdict !== "correct").length;
  };

  return [
    {
      id: "api_integration",
      name: "API integration",
      collect: () => {
        const base = skillStats(() => true) || { successes: 0, failures: 0, note: "no skills yet" };
        return { ...base, corrections: correctionsFor(/api|endpoint|http/i) };
      },
    },
    {
      id: "home_automation",
      name: "Home automation",
      collect: () => {
        const base = skillStats((s) => /home|light|switch|thermostat|hass/i.test(`${s.id} ${s.name}`))
          || { successes: 0, failures: 0, note: "no home automation skill installed" };
        return { ...base, corrections: correctionsFor(/light|thermostat|door|switch|home ?assistant/i) };
      },
    },
    {
      id: "code_generation",
      name: "Writing adapters",
      collect: () => {
        if (!registry) return { successes: 0, failures: 0, note: "no registry" };
        const all = registry.list();
        const installed = all.filter((s) => s.version != null).length;
        const attempted = all.length;
        return {
          successes: installed,
          failures: attempted - installed,
          note: attempted ? `${installed} of ${attempted} generated skills reached service` : "nothing generated yet",
        };
      },
    },
    {
      id: "language_understanding",
      name: "Understanding requests",
      collect: () => {
        // Regression tests are the honest measure: does she still get right
        // what she was corrected on, including when it is worded differently?
        if (!suite) return { successes: 0, failures: 0, note: "no regression history" };
        const tests = suite.list();
        const runs = tests.flatMap((t) => t.runs || []);
        if (!runs.length) return { successes: 0, failures: 0, note: `${tests.length} test(s), never replayed` };
        return {
          successes: runs.filter((r) => r.status === "passed").length,
          failures: runs.filter((r) => r.status !== "passed").length,
          note: `${runs.length} regression replays`,
        };
      },
    },
    {
      id: "memory_recall",
      name: "Remembering",
      collect: () => {
        if (!memory) return { successes: 0, failures: 0, note: "no memory store" };
        const stats = memory.stats();
        const used = memory.items.filter((i) => i.useCount > 0).length;
        return {
          successes: used,
          failures: 0,
          note: `${stats.total} memories, ${used} have actually been recalled`,
          // Storing things is not a capability; retrieving the right one is.
          cap: used < 10 ? LEVEL.LIMITED : null,
        };
      },
    },
    {
      id: "web_research",
      name: "Web research",
      collect: () => ({
        successes: 0, failures: 0,
        note: "search is implemented but nothing has been learned from it yet — no evidence either way",
      }),
    },
    {
      id: "self_modification",
      name: "Changing her own code",
      collect: () => ({
        successes: 0, failures: 0,
        note: "not built — she can write adapters, not modify her own source",
      }),
    },
  ];
}

class CapabilityMap {
  constructor({ registry = null, cases = null, suite = null, memory = null, log = null, domains = null, platform = null } = {}) {
    this.sources = { registry, cases, suite, memory };
    this.log = log;
    // What the machine physically offers, which is different from what she
    // knows how to do. No GPIO pins means no GPIO skill, however clever she is.
    this.platform = platform;
    this.domains = domains || defaultDomains(this.sources);
  }

  /** Add a domain at runtime, so a new area of competence can be tracked. */
  addDomain(domain) {
    if (!domain?.id || typeof domain.collect !== "function") {
      throw new Error("A domain needs an id and a collect() that returns real evidence.");
    }
    this.domains = this.domains.filter((d) => d.id !== domain.id).concat(domain);
    return domain;
  }

  /**
   * Rate one domain from its evidence, now.
   *
   * The rating is bounded twice: by the success rate, and by how many runs
   * there were. A perfect record over four attempts is "limited" — because
   * four attempts cannot tell you much, and saying otherwise is how a system
   * starts believing its own press.
   */
  rate(id) {
    const domain = this.domains.find((d) => d.id === id);
    if (!domain) return null;

    const evidence = domain.collect() || {};
    const successes = evidence.successes || 0;
    const failures = evidence.failures || 0;
    const corrections = evidence.corrections || 0;
    const samples = successes + failures;

    if (samples === 0) {
      return {
        id: domain.id, name: domain.name, level: LEVEL.UNSUPPORTED,
        confidence: 0, samples: 0, successRate: null, corrections,
        why: evidence.note || "never attempted", evidence,
      };
    }

    // Corrections count against: being told she was wrong is evidence about
    // the capability, not only about that one answer.
    const successRate = successes / samples;
    const adjusted = Math.max(0, successRate - corrections / (samples + corrections) * 0.5);

    let level =
      adjusted >= 0.9 ? LEVEL.STRONG :
      adjusted >= 0.7 ? LEVEL.MODERATE :
      LEVEL.LIMITED;

    // Cap by evidence: a level you have not earned enough runs for drops.
    while (level !== LEVEL.LIMITED && samples < REQUIRED_SAMPLES[level]) {
      level = ORDER[ORDER.indexOf(level) - 1];
    }
    if (evidence.cap && ORDER.indexOf(evidence.cap) < ORDER.indexOf(level)) level = evidence.cap;

    // Confidence is about the amount of evidence, not the success rate.
    const confidence = Math.min(1, samples / REQUIRED_SAMPLES[LEVEL.STRONG]);

    return {
      id: domain.id, name: domain.name, level, confidence,
      samples, successRate, corrections,
      why: samples < REQUIRED_SAMPLES[LEVEL.MODERATE]
        ? `${(successRate * 100).toFixed(0)}% of ${samples} run(s) — too few to call it more than limited`
        : `${(successRate * 100).toFixed(0)}% of ${samples} runs${corrections ? `, ${corrections} correction(s) against it` : ""}`,
      evidence,
    };
  }

  /** The whole table, strongest first. */
  all() {
    return this.domains
      .map((d) => this.rate(d.id))
      .sort((a, b) => ORDER.indexOf(b.level) - ORDER.indexOf(a.level) || b.confidence - a.confidence);
  }

  /** The table as the brief draws it. */
  render() {
    const label = { unsupported: "Unsupported", limited: "Limited", moderate: "Moderate", strong: "Strong" };
    const width = Math.max(...this.domains.map((d) => d.name.length));
    return this.all().map((r) => `${r.name.padEnd(width)} → ${label[r.level]}${r.samples ? ` (${r.samples} runs)` : ""}`).join("\n");
  }

  /**
   * Can she do this, and if not, could she learn to?
   *
   * Heuristic and word-based — there is no model here to understand an
   * arbitrary request — so it reports how it decided, and a low-confidence
   * match says so instead of guessing quietly.
   */
  assess(request) {
    const text = String(request || "");

    // Pick the route with the most signals in the request, not the first one
    // that happens to match. "read a sensor on a gpio pin" mentions a sensor,
    // but "gpio" and "pin" together say far more clearly what it really needs.
    const routed = ACQUISITION
      .map((a) => ({ route: a, hits: (text.match(new RegExp(a.matches.source, "gi")) || []).length }))
      .filter((r) => r.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    const route = routed[0]?.route || null;

    // Which existing domain, if any, this looks like.
    const scored = this.domains.map((domain) => {
      const words = domain.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const hits = words.filter((w) => text.toLowerCase().includes(w)).length;
      return { domain, hits };
    }).sort((a, b) => b.hits - a.hits);
    const nearest = scored[0]?.hits ? this.rate(scored[0].domain.id) : null;

    const covered = !!nearest && nearest.level !== LEVEL.UNSUPPORTED;

    if (covered) {
      return {
        covered: true, level: nearest.level, domain: nearest.id,
        confidence: nearest.confidence,
        answer: `I have done this before — ${nearest.name.toLowerCase()} is ${nearest.level} (${nearest.why}).`,
        caveat: nearest.level === LEVEL.LIMITED ? "expect to have to correct me" : null,
      };
    }

    // Hardware is a special case: whether it is even possible depends on the
    // machine she is running on, not on anything she has learned.
    if (route?.id === "hardware" && this.platform) {
      const host = require("../platform/detect.js").hostCapabilities(this.platform);

      // Which interface does this request actually need? A laptop having a
      // microphone says nothing about whether it can drive a GPIO pin, so the
      // question is about the specific hardware, not hardware in general.
      const WANTS = [
        [/\bgpio|\bpin\b/i, "GPIO"],
        [/camera|webcam|photo|video/i, "CAMERA"],
        [/microphone|\bmic\b|listen|voice|audio/i, "MICROPHONE"],
        [/bluetooth|\bble\b/i, "BLUETOOTH"],
        [/\bi2c\b/i, "I2C"],
        [/\bspi\b/i, "SPI"],
        [/temperature|thermal/i, "THERMAL_READINGS"],
      ];
      const needed = WANTS.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
      const relevant = needed.length ? needed : Object.keys(host);
      const reachable = relevant.filter((name) => host[name] === "available").map((n) => n.toLowerCase());

      if (reachable.length) {
        return {
          covered: false, canAcquire: "partly", route: route.id,
          answer: `This machine does have ${reachable.join(", ")}, so it is physically possible here — but I have no driver for it. A bridge exposing it over HTTP is the route I could actually take.`,
          needs: ["a driver skill, or a REST bridge in front of the hardware"],
          hostCapabilities: host,
        };
      }
      return {
        covered: false, canAcquire: false, route: route.id,
        answer: `Not on this machine — there is no such hardware here at all (${this.platform.host}). On a Raspberry Pi the answer might be different.`,
        needs: route.needs,
        hostCapabilities: host,
      };
    }

    if (route?.available) {
      return {
        covered: false, canAcquire: true, route: route.id,
        answer: `I cannot do that yet, but I can learn it: ${route.how}.`,
        needs: route.needs,
        matchedOn: String(route.matches),
      };
    }
    if (route) {
      return {
        covered: false, canAcquire: false, route: route.id,
        answer: `I cannot do that, and I cannot learn it as I am: ${route.blocker}.`,
        needs: route.needs,
        matchedOn: String(route.matches),
      };
    }
    return {
      covered: false, canAcquire: null,
      answer: "I do not recognise that as anything I can do or acquire — I match requests by words, so if this is something I should handle, tell me which of my abilities it is closest to.",
      needs: [],
    };
  }
}

module.exports = { CapabilityMap, LEVEL, ORDER, REQUIRED_SAMPLES, ACQUISITION, defaultDomains };
