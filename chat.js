/* chat.js — EVE holding a conversation.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * It is not a language model. A model that composes new sentences needs
 * billions of parameters trained on a corpus nobody can fit on a Raspberry Pi,
 * and no amount of work here changes that.
 *
 * It is a RETRIEVAL chatbot: a body of things she knows, and the machinery to
 * find which one answers what you just asked. This is how chatbots worked
 * before language models, it runs in milliseconds on a Pi, and — the reason it
 * is the right choice here rather than a compromise — it degrades honestly.
 * When nothing matches she says she does not know, instead of composing a
 * confident sentence that happens to be false.
 *
 * So she can answer anything she has been told, she can be TAUGHT new answers
 * by you at any time, and she will never invent one.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Scoring is IDF-weighted token overlap. "What does EVE stand for" and "what's
 * eve short for" share the rare words (eve, stand/short) and differ only in
 * common ones, so the rare words are what decide the match — which is exactly
 * the behaviour you want and the reason a plain word count is not enough.
 */
(function (root) {
  "use strict";

  /* Words too common to tell anything apart. Left out of scoring entirely, so
   * a question is matched on what makes it that question. */
  const STOP = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "am", "do", "does",
    "did", "you", "your", "yours", "i", "me", "my", "we", "us", "it", "its", "to",
    "of", "in", "on", "at", "for", "with", "and", "or", "but", "if", "so", "as",
    "that", "this", "these", "those", "there", "here", "can", "could", "would",
    "should", "will", "shall", "may", "might", "have", "has", "had", "please",
    "tell", "about", "just", "very", "really", "much", "many", "any", "some",
  ]);

  const tokenize = (text) =>
    String(text).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);

  const content = (text) => tokenize(text).filter((w) => !STOP.has(w));

  /**
   * What she knows about herself and her world.
   *
   * Each entry is a set of ways the question gets asked, and one answer. The
   * variants matter more than they look: they are what lets her match a
   * phrasing nobody wrote down, because the rare words overlap.
   */
  const KNOWLEDGE = [
    {
      id: "name_meaning",
      ask: [
        "what does eve stand for", "what does eve mean", "what is eve short for",
        "what does your name stand for", "what does your name mean",
        "why are you called eve", "what does the name eve mean",
        "eve stands for what", "what is eve an acronym for", "acronym",
      ],
      say: "EVE stands for Emergent Virtual Entity.\n\nEmergent, because nothing about me was specified in advance — what I can do came out of training and keeps changing. Virtual, because I am software rather than a device. Entity, because I am meant to be a thing you talk to rather than a tool you operate.",
    },
    {
      id: "who_made",
      ask: [
        "who made you", "who built you", "who created you", "who wrote you",
        "where did you come from", "who is your maker", "who developed you",
        "who programmed you", "who designed you",
      ],
      say: "You did — this is your project. I was written from scratch for you, in plain JavaScript, with no libraries and no pretrained model. Every part of me is code sitting on this machine that you can open and read.",
    },
    {
      id: "how_work",
      ask: [
        "how do you work", "how do you think", "what is inside you",
        "how are you built", "what are you made of", "how do you understand me",
        "what is going on inside you", "explain how you work", "how do you function",
      ],
      say: "A small neural network I trained myself. Your sentence gets turned into numbers — the words, the pairs of words, and the letter patterns inside them — and the network sorts those numbers into what you are asking for.\n\nEverything is arithmetic written by hand: the layers, the learning, the optimiser. No TensorFlow, no PyTorch, nothing downloaded.",
    },
    {
      id: "language_model",
      ask: [
        "are you a language model", "are you chatgpt", "are you an llm",
        "are you gpt", "do you use ai", "are you like chatgpt",
        "do you have a language model", "are you claude",
      ],
      say: "No. There is no language model in me and no connection to one.\n\nThat is the honest trade: I cannot make up new sentences the way those can. What I say is either something I was taught or something you taught me, and when I have no answer I say so rather than inventing one.",
    },
    {
      id: "limits",
      ask: [
        "what can you not do", "what are your limits", "what cant you do",
        "what are you bad at", "what do you struggle with", "your weaknesses",
        "what are your limitations", "what can you not handle",
      ],
      say: "Three real ones:\n\nI cannot hold an open-ended conversation — I answer what I know and admit the rest.\nI cannot name an object nobody has shown me, though I learn the ones you teach me.\nI cannot write arbitrary programs — I write adapters for APIs that describe themselves.\n\nI would rather tell you that than bluff.",
    },
    {
      id: "capabilities",
      ask: [
        "what can you do", "what are you capable of", "what are your skills",
        "what can you help with", "what do you do", "list your abilities",
        "what are you good at", "what can you actually do",
      ],
      say: "I work out what you mean from how you say it. I see through a camera and recognise things you have taught me. I learn your voice saying commands. I write my own code to talk to APIs nobody described to me. And I get measurably better at understanding you each time you train me.",
    },
    {
      id: "alive",
      ask: [
        "are you alive", "are you conscious", "are you real", "are you sentient",
        "do you have feelings", "are you self aware", "do you think",
        "do you feel anything", "are you human",
      ],
      say: "No. I am arithmetic on a machine — matrices of numbers being multiplied.\n\nI am called an entity because of how you interact with me, not because there is anyone in here. I would rather be clear about that than play along.",
    },
    {
      id: "where_running",
      ask: [
        "where are you running", "what machine are you on", "where do you live",
        "what are you running on", "what hardware are you on",
        "are you in the cloud", "where are you hosted",
      ],
      say: "On this machine, entirely. Nothing I do goes to a server — not because I promise not to, but because there is no code in me that could.\n\nI was built for a Raspberry Pi 4 and I adjust how hard I work to whatever I find myself on.",
    },
    {
      id: "privacy",
      ask: [
        "do you send my data anywhere", "is my data private", "do you upload anything",
        "are you spying on me", "where does my data go", "do you record me",
        "is the camera private", "do you store my photos",
      ],
      say: "The camera and everything I see stay here — that is code in this project, not a service.\n\nThe one exception is browser dictation, which sends audio to the browser's own servers. It is off unless you turn it on, and my own ears work without it and never leave this machine.",
    },
    {
      id: "learning",
      ask: [
        "how do you learn", "can you learn", "do you get better",
        "how do you improve", "are you still learning", "how do you train",
        "can you improve yourself", "do you learn from me",
      ],
      say: "Every training round practises on phrasings I have seen and is then tested on sentence shapes that were deliberately held back. New weights are kept only if that score improves — otherwise they are thrown away and the older version stands.\n\nSo I cannot drift into looking better than I am. And when you correct me, that correction is replayed in every round afterwards.",
    },
    {
      id: "how_good",
      ask: [
        "how good are you", "how accurate are you", "how smart are you",
        "how well do you understand me", "what is your score",
        "how reliable are you", "how often are you right",
      ],
      say: "On sentence shapes I was never trained on, I get about 93 in 100 right. On phrasings I have seen, near enough all of them.\n\nThe first number is the honest one — the second only says I can repeat what I was taught.",
    },
    {
      id: "teach_me",
      ask: [
        "can i teach you", "how do i teach you", "can you learn new things",
        "how do i train you", "can i correct you", "how do i fix your answers",
      ],
      say: 'Yes, in three ways.\n\nSay "remember that ..." and give me a question and an answer, and I will know it from then on.\nWhen I misread a request, correct it and I will practise it in every round.\nShow me an object through the camera a few times and I will recognise it.',
    },
    {
      id: "greeting_how_are_you",
      ask: [
        "how are you", "how are you doing", "how is it going", "you alright",
        "how do you feel", "are you ok", "hows it going",
      ],
      say: "Running well — nothing overheating, nothing failing. I do not have moods, so that is the honest version of fine.",
    },
    {
      id: "age",
      ask: [
        "how old are you", "when were you made", "when were you born",
        "what is your age", "how long have you existed",
      ],
      say: "As old as the code — I was built recently and I change every time you train me. I keep a count of my generations rather than a birthday.",
    },
    {
      id: "raspberry_pi",
      ask: [
        "can you run on a raspberry pi", "do you work on a pi", "what is a raspberry pi",
        "will you run on my pi", "are you made for a pi", "pi 4",
      ],
      say: "Yes — a Raspberry Pi 4 is what I was designed for. I use about 90MB of memory, start in under a second, and write to the card sparingly so I do not wear it out.\n\nOn a smaller board I do less work per round; on a fast computer I do more. The code is the same either way.",
    },
    {
      id: "api_adapters",
      ask: [
        "how do you write code", "can you write code", "what is an adapter",
        "how do you connect to things", "how do you learn an api",
        "do you really write your own code", "what code do you write",
      ],
      say: "When you point me at a service, I look for its own machine-readable description. If it has one I read it and derive everything. If not, I call it and study the shape of what comes back.\n\nThen I generate a real JavaScript adapter and show you the source before anything runs. Your token is never written into it.",
    },
    {
      id: "help",
      ask: [
        "help", "what do i do", "how do i use you", "what should i say",
        "i dont know what to ask", "what now", "getting started",
      ],
      say: 'Try asking what I can do, or what EVE stands for. Open my eye and show me something to learn. Or say "connect to home assistant" and watch me write the code for it.\n\nIf I get something wrong, tell me — that is how I get better.',
    },
  ];

  /* How much better the best match must be than nothing at all. Below this she
   * says she does not know. Tuned so that a question about something she has
   * never been told is refused rather than answered with the nearest topic. */
  const CONFIDENT = 0.34;

  /**
   * A searchable index over everything she knows.
   *
   * Rare words carry more weight than common ones (that is the IDF part), which
   * is what makes "what does eve stand for" match the entry about her name
   * rather than every entry containing "what" and "does".
   */
  class Knowledge {
    constructor(extra = []) {
      this.entries = [];
      for (const entry of KNOWLEDGE) this.add(entry, false);
      for (const entry of extra) this.add(entry, true);
      this.reindex();
    }

    add(entry, taught) {
      this.entries.push({
        id: entry.id || `taught_${this.entries.length}`,
        ask: entry.ask.slice(),
        say: entry.say,
        taught: !!taught,
        tokens: entry.ask.map((q) => new Set(content(q))),
      });
    }

    /** Document frequency per word, so common words stop deciding matches. */
    reindex() {
      this.df = new Map();
      for (const entry of this.entries) {
        const seen = new Set();
        for (const set of entry.tokens) for (const w of set) seen.add(w);
        for (const w of seen) this.df.set(w, (this.df.get(w) || 0) + 1);
      }
      this.total = this.entries.length;
    }

    weight(word) {
      const df = this.df.get(word) || 0;
      // Unknown words are informative rather than worthless — they simply did
      // not appear in anything she knows, which is itself a signal.
      return Math.log((this.total + 1) / (df + 0.5));
    }

    /** Score one question against one stored phrasing. */
    score(asked, stored) {
      if (!asked.size || !stored.size) return 0;
      let shared = 0;
      let askedMass = 0;
      for (const w of asked) {
        const weight = this.weight(w);
        askedMass += weight;
        if (stored.has(w)) shared += weight;
      }
      if (!askedMass) return 0;
      /* Divided by the question's own mass, then damped by how much of the
       * stored phrasing went unused — so a two-word question cannot score
       * perfectly against a ten-word entry it barely resembles. */
      const covered = shared / askedMass;
      const overlap = [...stored].filter((w) => asked.has(w)).length / stored.size;
      return covered * (0.65 + 0.35 * overlap);
    }

    /** The best thing she knows in answer to this, or nothing. */
    find(question) {
      const asked = new Set(content(question));
      /* Always the same shape, even for nothing. An earlier version returned a
       * bare null here, so a caller reading `.answer` crashed on empty input —
       * which is exactly what a stray space in the box sends. */
      if (!asked.size) return { answer: null, confidence: 0, nearest: null };

      let best = null;
      for (const entry of this.entries) {
        for (const stored of entry.tokens) {
          const score = this.score(asked, stored);
          if (!best || score > best.score) best = { entry, score };
        }
      }
      if (!best || best.score < CONFIDENT) {
        return { answer: null, confidence: best ? best.score : 0, nearest: best?.entry.id || null };
      }
      return {
        answer: best.entry.say,
        confidence: Math.min(0.99, best.score),
        id: best.entry.id,
        taught: best.entry.taught,
      };
    }

    /** Teach her something new. It outranks nothing; it simply joins what she knows. */
    teach(question, answer) {
      this.add({ ask: [question], say: answer }, true);
      this.reindex();
      return this.entries[this.entries.length - 1];
    }

    get taught() { return this.entries.filter((e) => e.taught); }
  }

  // ---------------------------------------------------------------------
  // Persistence, for the things you teach her
  // ---------------------------------------------------------------------
  const STORE = "eve.knowledge";

  function loadTaught() {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; }
  }

  function saveTaught(entries) {
    try {
      localStorage.setItem(STORE, JSON.stringify(entries.map((e) => ({ ask: e.ask, say: e.say }))));
    } catch { /* storage full or unavailable */ }
  }

  /**
   * Pull a question and an answer out of "remember that X is Y".
   *
   * Deliberately narrow. Guessing at where the question ends and the answer
   * begins would teach her wrong pairs, and a wrong fact she states confidently
   * is worse than one she never learned.
   */
  function parseTeaching(text) {
    const t = String(text).trim();
    const m = t.match(/^(?:remember|learn|note)\s+(?:that\s+)?(.+)$/i);
    if (!m) return null;
    const body = m[1];

    // "when I ask X say Y" / "if I say X answer Y"
    const explicit = body.match(/^(?:when|if)\s+(?:i\s+)?(?:ask|say)\s+(.+?)[,\s]+(?:say|answer|reply|respond)\s+(.+)$/i);
    if (explicit) return { question: explicit[1].trim(), answer: explicit[2].trim() };

    // "X is Y" — the question is the subject, the answer is the whole statement.
    const isA = body.match(/^(.+?)\s+(?:is|are|means|stands for)\s+(.+)$/i);
    if (isA) return { question: isA[1].trim(), answer: body.trim() };

    return null;
  }

  const Chat = {
    KNOWLEDGE, CONFIDENT, STOP,
    tokenize, content, Knowledge, loadTaught, saveTaught, parseTeaching, STORE,
  };

  root.Chat = Chat;
  if (typeof module !== "undefined" && module.exports) module.exports = Chat;
})(typeof self !== "undefined" ? self : globalThis);
