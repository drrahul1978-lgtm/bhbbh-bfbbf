/* Kodexa course catalog — 21 languages.
 * JavaScript is the deep flagship course (8 units, hand-written).
 * HTML, CSS and SQL have hand-written courses of their own.
 * The other 17 languages are built from per-language syntax specs so every
 * exercise uses that language's real syntax.
 *
 * Exercise types (consumed by app.js):
 *   mc    — multiple choice            {t,q,code?,choices,a}
 *   fill  — pick a chip to fill ___    {t,q,code (contains ___),choices,a}
 *   order — arrange chips into code    {t,q,tokens}
 *   type  — type the answer            {t,q,code?,a,alt?}
 * For mc/fill the correct choice is always FIRST (a:0); the player shuffles. */

"use strict";

/* ---------- tiny exercise factories ---------- */
const mc = (q, code, choices) => ({ t: "mc", q, ...(code ? { code } : {}), choices, a: 0 });
const fill = (q, code, choices) => ({ t: "fill", q, code, choices, a: 0 });
const order = (q, tokens) => ({ t: "order", q, tokens });
const typeEx = (q, code, a) => ({ t: "type", q, ...(code ? { code } : {}), a });
const codeEx = (q, a, alt, extra) => ({ t: "code", q, a, ...(alt ? { alt } : {}), ...(extra || {}) });

/* Questions that are true in (almost) every language */
const G = {
  commentsIgnored: () => mc("What happens to comments when the program runs?", null,
    ["They are ignored completely", "They print to the screen", "They cause errors", "They run twice"]),
  condTrue: () => mc("An if block runs its code when the condition is…", null,
    ["true", "false", "a string", "missing"]),
  elseRuns: () => mc("The else branch runs when the if condition is…", null,
    ["false", "true", "undefined", "an error"]),
  validName: (choices) => mc("Which of these is usually a VALID variable name?", null,
    choices || ["myScore", "2cool", "my-score", "my score"]),
  varWhy: () => mc("Variables let you…", null,
    ["Store a value and reuse it by name", "Make the program slower", "Print automatically", "Skip writing code"]),
  boolDef: () => mc("What IS a boolean?", null,
    ["A value that is either true or false", "A whole number", "A piece of text", "A type of loop"]),
  concatTerm: () => mc("Joining two strings together is called…", null,
    ["concatenation", "addition", "stapling", "compression"]),
  quotes: () => mc("Text values (strings) are usually wrapped in…", null,
    ["quotes", "brackets", "slashes", "stars"]),
  modName: () => mc("The remainder operator is often called…", null,
    ["modulo", "percentify", "divmod", "slicing"]),
  gteQ: () => mc("What does >= mean?", null,
    ["greater than or equal to", "greater than only", "assign if greater", "approximately equal"]),
  loopsFor: () => mc("Loops are used to…", null,
    ["Repeat code without copy-pasting it", "Run code exactly once", "Store data", "Style the page"]),
  whileRuns: () => mc("A while-style loop keeps running as long as its condition is…", null,
    ["true", "false", "a number", "short"]),
  infiniteQ: () => mc("A loop whose condition never becomes false is called…", null,
    ["an infinite loop", "a mega loop", "a forever-if", "a stack"]),
  funcDef: () => mc("A function is…", null,
    ["A reusable, named block of code", "A type of variable", "A kind of loop", "A comment"]),
  argsQ: () => mc("Values you pass INTO a function are called…", null,
    ["arguments", "ingredients", "imports", "options"]),
  returnDef: () => mc("What does returning a value from a function do?", null,
    ["Sends the value back to whoever called the function", "Prints the value", "Saves it to a file", "Restarts the program"]),
  elseChain: () => mc("To check several conditions one after another, you use…", null,
    ["a chain of else-if style branches", "many semicolons", "only loops", "comments"]),
  listsHold: () => mc("Why use a list / array?", null,
    ["To store many values in one variable", "To make code run faster", "To draw pictures", "To rename variables"]),
};

/* Deterministic sampler used to build Review and Mastery units */
function sample(pool, n, offset) {
  const out = [];
  if (!pool.length) return out;
  const step = Math.max(1, Math.floor(pool.length / n));
  for (let i = 0; out.length < Math.min(n, pool.length); i++) {
    const ex = pool[(offset + i * step) % pool.length];
    if (!out.includes(ex)) out.push(ex);
  }
  return out;
}

function allExercises(units) {
  return units.flatMap((u) => u.lessons.flatMap((l) => l.exercises));
}

/* A drill unit of pure arithmetic-output questions, built from a
 * language's print wrapper so the code is always real syntax. */
function numbersUnit(wrap, num) {
  return {
    title: `Unit ${num} · Number Ninja`,
    desc: "Speed-run arithmetic in code",
    lessons: [
      {
        title: "Quick Math I",
        exercises: [
          typeEx("Type the output of this code", wrap("7 + 8"), "15"),
          mc("What is the output?", wrap("12 - 5"), ["7", "6", "8", "17"]),
          typeEx("Type the output of this code", wrap("3 * 7"), "21"),
          mc("What is the output?", wrap("(9 - 4) * 3"), ["15", "23", "12", "27"]),
          typeEx("Type the output of this code", wrap("100 - 25"), "75"),
          mc("What is the output?", wrap("6 * 6"), ["36", "12", "66", "30"]),
        ],
      },
      {
        title: "Quick Math II",
        exercises: [
          mc("What is the output?", wrap("2 * (10 - 6)"), ["8", "14", "20", "4"]),
          typeEx("Type the output of this code", wrap("45 + 55"), "100"),
          mc("What is the output?", wrap("9 * 9"), ["81", "18", "99", "72"]),
          typeEx("Type the output of this code", wrap("60 - 12"), "48"),
          mc("What is the output?", wrap("(3 + 3) * (2 + 2)"), ["24", "12", "36", "10"]),
          codeEx("⌨️ Your turn — type ONE line of code that prints the result of 7 * 11", wrap("7 * 11"), [wrap("77")]),
        ],
      },
    ],
  };
}

/* Print wrappers for hand-written courses that also get a Number Ninja unit */
const NUM_WRAP = { js: (e) => `console.log(${e});` };

/* Make sure a sampled lesson contains at least one type-the-code exercise */
function ensureCodeEx(list, pool) {
  if (!list.some((e) => e.t === "code")) {
    const c = pool.find((e) => e.t === "code" && !list.includes(e));
    if (c) list[list.length - 1] = c;
  }
  return list;
}

/* Appends Review + Mastery units built from a course's own exercises */
function withReviewUnits(units, startNum) {
  const pool = allExercises(units);
  const half = Math.floor(pool.length / 2);
  return [
    ...units,
    {
      title: `Unit ${startNum} · Review`,
      desc: "Strengthen what you've learned",
      lessons: [
        { title: "Review I", exercises: ensureCodeEx(sample(pool.slice(0, half), 6, 0), pool) },
        { title: "Review II", exercises: ensureCodeEx(sample(pool.slice(half), 6, 1), pool) },
      ],
    },
    {
      title: `Unit ${startNum + 1} · Mastery`,
      desc: "Prove you've mastered it all",
      lessons: [
        { title: "Mastery Exam A", exercises: ensureCodeEx(sample(pool, 7, 2), pool) },
        { title: "Mastery Exam B", exercises: ensureCodeEx(sample(pool, 7, 5), pool) },
      ],
    },
  ];
}

/* ---------- generated course builder (10 units per language) ---------- */
function buildCourse(meta, g, x) {
  const N = meta.name;
  // derived "type it yourself" exercises, one per unit, in real syntax
  const fl = (s) => String(s).split("\n")[0];
  const ifLineBlank = fl(g.ifFill.code);
  const ifLineAns = ifLineBlank.replace("___", g.ifFill.choices[0]);
  const loopLineBlank = fl(g.loopFill.code);
  const loopLineAns = loopLineBlank.replace("___", g.loopFill.choices[0]);
  const funcLines = String(g.funcOut.code).split("\n");
  const funcMasked = ["___", ...funcLines.slice(1)].join("\n");
  const units = [
    {
      title: "Unit 1 · First Steps",
      desc: `Print, comment, and meet ${N}`,
      lessons: [
        {
          title: `Hello, ${N}!`,
          exercises: [
            mc(`Which line prints "Hello!" in ${N}?`, null, [g.printLine, ...g.wrongPrints]),
            mc("What is the output?", g.printNum.code, [g.printNum.out, ...g.printNum.wrong]),
            g.printTokens ? order('Build the code: print "Hi"', g.printTokens) : null,
            fill("Fill in the blank to print a message", g.printFill.code, g.printFill.choices),
            typeEx("Type the output of this code", g.hello.code, g.hello.ans),
            codeEx(`⌨️ Your turn — write the ${N} code that prints: Hello, World!`, g.hello.code),
          ].filter(Boolean),
        },
        {
          title: "Comments & Style",
          exercises: [
            mc(`Which starts a single-line comment in ${N}?`, null, [g.commentChar, ...g.commentWrong]),
            fill("Turn this into a comment", "___ TODO: fix this later", [g.commentChar, ...g.commentWrong]),
            G.commentsIgnored(),
            mc(g.styleQ.q, g.styleQ.code || null, g.styleQ.choices),
            mc(g.useQ.q || `What is ${N} mostly used for?`, null, g.useQ.choices),
          ],
        },
      ],
    },
    {
      title: "Unit 2 · Variables",
      desc: "Boxes that store your data",
      lessons: [
        {
          title: "Declaring Variables",
          exercises: [
            mc(`How do you create a variable x holding 5 in ${N}?`, null, [g.decl.line, ...g.decl.wrong]),
            g.declTokens ? order("Build the code: store 13 in a variable called age", g.declTokens) : null,
            fill("Fill in the blank", g.declFill.code, g.declFill.choices),
            typeEx("Type the output of this code", g.varPrint.code, g.varPrint.ans),
            codeEx("⌨️ Your turn — type the code that creates a variable x holding 5", g.decl.line),
          ].filter(Boolean),
        },
        {
          title: "Using Variables",
          exercises: [
            G.varWhy(),
            G.validName(g.nameQ),
            mc(x.incQ.q, x.incQ.code || null, x.incQ.choices),
            typeEx("Type the output of this code", g.varPrint.code, g.varPrint.ans),
          ],
        },
      ],
    },
    {
      title: "Unit 3 · Types & Text",
      desc: "Strings, numbers & booleans",
      lessons: [
        {
          title: "Data Types",
          exercises: [
            mc(g.types1.q, g.types1.code || null, g.types1.choices),
            mc(g.types2.q, g.types2.code || null, g.types2.choices),
            G.boolDef(),
            mc(g.boolQ.q, g.boolQ.code || null, g.boolQ.choices),
          ],
        },
        {
          title: "Working with Text",
          exercises: [
            G.quotes(),
            mc(g.concat.q, g.concat.code || null, g.concat.choices),
            G.concatTerm(),
            mc('How many characters? What is the output?', x.strLen.code, ["4", "3", "5", "Error"]),
            codeEx('⌨️ Your turn — write the code that prints: Good morning',
              g.printFill.code.replace("___", g.printFill.choices[0])),
          ],
        },
      ],
    },
    {
      title: "Unit 4 · Math & Operators",
      desc: "Crunch numbers and compare them",
      lessons: [
        {
          title: "Arithmetic",
          exercises: [
            typeEx("Type the output of this code", x.mul.code, x.mul.ans),
            mc("What is the output? (the remainder operator)", x.mod.code, [x.mod.out, ...x.mod.wrong]),
            G.modName(),
          ],
        },
        {
          title: "Number Drills",
          exercises: [
            typeEx("Type the output of this code", x.wrap("3 + 4"), "7"),
            mc("What is the output?", x.wrap("6 * 3"), ["18", "9", "63", "Error"]),
            typeEx("Type the output of this code", x.wrap("9 - 4"), "5"),
            mc("What is the output?", x.modDrill || x.wrap(`8 ${x.modOp} 3`), ["2", "1", "3", "0"]),
            mc("What is the output?", x.wrap("(2 + 3) * 2"), ["10", "12", "7", "8"]),
            typeEx("Type the output of this code", x.wrap("5 * 5"), "25"),
            codeEx("⌨️ Your turn — write ONE line that prints the result of 4 * 5", x.mul.code, [x.wrap("20")]),
          ],
        },
        {
          title: "Comparisons",
          exercises: [
            mc(g.eqQ.q || `Which operator checks equality in ${N}?`, null, g.eqQ.choices),
            mc(x.neq.q || `Which means NOT equal in ${N}?`, null, x.neq.choices),
            mc("What is the output?", x.cmp.code, [x.cmp.out, ...x.cmp.wrong]),
            mc("What is the output?", x.cmp2.code, [x.cmp2.out, ...x.cmp2.wrong]),
            G.gteQ(),
          ],
        },
      ],
    },
    {
      title: "Unit 5 · Conditionals",
      desc: "Teach your code to decide",
      lessons: [
        {
          title: "Making Decisions",
          exercises: [
            G.condTrue(),
            fill("Fill in the keyword", g.ifFill.code, g.ifFill.choices),
            mc("What is the output?", g.ifQ.code, [g.ifQ.out, ...g.ifQ.wrong]),
            codeEx("⌨️ Your turn — type this complete opening line, filling in the blank", ifLineAns, null, { code: ifLineBlank }),
          ],
        },
        {
          title: "Else & Branches",
          exercises: [
            G.elseRuns(),
            G.elseChain(),
            mc(`Which keyword chains a second condition in ${N}?`, null,
              [x.elif, ...["elif", "elsif", "elseif", "else if"].filter((k) => k !== x.elif).slice(0, 3)]),
            mc("What is the output?", g.ifQ.code, [g.ifQ.out, ...g.ifQ.wrong]),
            fill("Fill in the keyword", g.ifFill.code, g.ifFill.choices),
          ],
        },
        {
          title: "Logic Operators",
          exercises: [
            mc(`Which operator means AND in ${N}?`, null, x.logic.and),
            mc(`Which operator means OR in ${N}?`, null, x.logic.or),
            mc(`Which operator means NOT in ${N}?`, null, x.logic.not),
            mc("If it must be sunny AND warm to swim, when do you swim?", null,
              ["Only when both are true", "When either is true", "When neither is true", "Always"]),
          ],
        },
      ],
    },
    {
      title: "Unit 6 · Loops",
      desc: "Repeat without repeating yourself",
      lessons: [
        {
          title: "Counting Loops",
          exercises: [
            G.loopsFor(),
            mc("What is the output?", g.loopQ.code, [g.loopQ.out, ...g.loopQ.wrong]),
            fill("Fill in the blank", g.loopFill.code, g.loopFill.choices),
            typeEx("How many times does this loop print? (type a number)", x.loopCount.code, x.loopCount.ans),
            codeEx("⌨️ Your turn — type this complete loop line, filling in the blank", loopLineAns, null, { code: loopLineBlank }),
          ],
        },
        {
          title: "While Loops",
          exercises: [
            G.whileRuns(),
            mc("What is the output?", x.whileQ.code, [x.whileQ.out, ...x.whileQ.wrong]),
            G.infiniteQ(),
            mc("What is the output?", g.loopQ.code, [g.loopQ.out, ...g.loopQ.wrong]),
          ],
        },
      ],
    },
    {
      title: "Unit 7 · Functions",
      desc: "Reusable blocks of code",
      lessons: [
        {
          title: "Your First Function",
          exercises: [
            G.funcDef(),
            mc(g.funcQ.q || `Which keyword defines a function in ${N}?`, null, g.funcQ.choices),
            mc("What is the output?", g.funcOut.code, [g.funcOut.out, ...g.funcOut.wrong]),
          ],
        },
        {
          title: "Parameters & Return",
          exercises: [
            G.argsQ(),
            G.returnDef(),
            g.returnTokens ? order("Build the code: return a plus b", g.returnTokens) : null,
            mc("What is the output?", g.funcOut.code, [g.funcOut.out, ...g.funcOut.wrong]),
            codeEx("⌨️ Your turn — type the missing FIRST line of this function", fl(g.funcOut.code), null, { code: funcMasked }),
          ].filter(Boolean),
        },
      ],
    },
    {
      title: "Unit 8 · Collections",
      desc: "Lists, arrays & friends",
      lessons: [
        {
          title: "Making Lists",
          exercises: [
            G.listsHold(),
            mc(`How do you create a list of 1, 2, 3 in ${N}?`, null, [x.listLit.line, ...x.listLit.wrong]),
            mc(`List positions (indexes) in ${N} start counting at…`, null,
              x.idxStart === "1" ? ["1", "0", "-1", "Wherever you like"] : ["0", "1", "-1", "Wherever you like"]),
            mc("What is the output?", x.listIdx.code, [x.listIdx.out, ...x.listIdx.wrong]),
          ],
        },
        {
          title: "Using Lists",
          exercises: [
            mc("What is the output?", x.listLen.code, [x.listLen.out, ...x.listLen.wrong]),
            mc(x.listAdd.q, x.listAdd.code || null, x.listAdd.choices),
            typeEx("Type the output of this code", x.listGet.code, x.listGet.ans),
            codeEx("⌨️ Your turn — type the code that creates a list of 1, 2, 3", x.listLit.line),
          ],
        },
      ],
    },
  ];
  const extra = (typeof EXTRA_UNITS !== "undefined" && EXTRA_UNITS[meta.id]) || [];
  const all = [...units, ...extra];
  all.push(numbersUnit(x.wrap, all.length + 1));
  return { ...meta, units: withReviewUnits(all, all.length + 1) };
}

/* =====================================================================
 * JavaScript — flagship hand-written course (8 units)
 * =================================================================== */
const JS_UNITS = [
  {
    title: "Unit 1 · First Steps",
    desc: "Say hello to JavaScript",
    lessons: [
      {
        title: "Hello, World!",
        exercises: [
          mc("What does this code do?", 'console.log("Hello!");',
            ["Prints Hello! to the console", "Shows a popup window", "Saves a file called Hello", "Nothing — it's a comment"]),
          order('Build the code: print "Hi" to the console', ["console", ".", "log", "(", '"Hi"', ")", ";"]),
          mc("What is the output?", "console.log(123);", ["123", '"123"', "console", "Nothing"]),
          fill("Fill in the blank to print a message", '___("Good morning");', ["console.log", "print", "echo"]),
          typeEx("Type the output of this code", "console.log(5);", "5"),
          codeEx("⌨️ Your turn — write the JavaScript that prints: Hello, World!", 'console.log("Hello, World!");'),
          mc("Where can JavaScript run?", null,
            ["In browsers and on servers (Node.js)", "Only inside Microsoft Word", "Only on phones", "Only on calculators"]),
        ],
      },
      {
        title: "Comments & Syntax",
        exercises: [
          mc("Which symbol starts a single-line comment?", null, ["//", "##", "<!--", "**"]),
          fill("Turn this line into a comment", "___ remind me to drink water", ["//", "\\\\", "%%"]),
          mc("How do you write a comment that spans many lines?", null,
            ["/* like this */", "// like this //", "(( like this ))", "## like this ##"]),
          G.commentsIgnored(),
          order("Build a single-line comment that says: my first comment", ["//", "my", "first", "comment"]),
          mc("Which character usually ends a JavaScript statement?", null, [";", ":", ".", "!"]),
        ],
      },
    ],
  },
  {
    title: "Unit 2 · Variables",
    desc: "Boxes that store your data",
    lessons: [
      {
        title: "Declaring Variables",
        exercises: [
          mc("Which keyword declares a variable whose value can change?", null, ["let", "make", "variable", "new"]),
          order("Build the code: store 13 in a variable called age", ["let", "age", "=", "13", ";"]),
          fill("Fill in the blank to assign a value", 'let name ___ "Ada";', ["=", "==", "=>"]),
          mc("What is the output?", "let score = 10;\nconsole.log(score);", ["10", "score", '"score"', "undefined"]),
          typeEx("Type the output of this code", "let x = 7;\nconsole.log(x);", "7"),
          codeEx("⌨️ Your turn — declare a variable called age holding 13 (use let)", "let age = 13;"),
          mc("Which is a valid variable name?", null, ["myScore", "2cool", "my-score", "let"]),
        ],
      },
      {
        title: "const vs let",
        exercises: [
          mc("What does const mean?", null,
            ["The variable can't be reassigned", "The variable is secret", "The variable is a number", "The variable updates constantly"]),
          mc("What happens here?", "const pi = 3.14;\npi = 3;",
            ["An error — you can't reassign a const", "pi becomes 3", "pi becomes 3.14 again", "Nothing"]),
          fill("Your birthday never changes — pick the best keyword", '___ birthday = "June 10";', ["const", "let", "var"]),
          mc("What is the output?", "let x = 1;\nx = 2;\nconsole.log(x);", ["2", "1", "12", "Error"]),
          order('Build the code: a constant called name holding "Rahul"', ["const", "name", "=", '"Rahul"', ";"]),
          mc("Which should you reach for by default in modern JavaScript?", null,
            ["const, switching to let only when you need to reassign", "var everywhere", "let everywhere", "No keyword at all"]),
        ],
      },
    ],
  },
  {
    title: "Unit 3 · Data Types",
    desc: "Numbers, strings & booleans",
    lessons: [
      {
        title: "Numbers & Strings",
        exercises: [
          mc('What type of value is "hello"?', null, ["string", "number", "boolean", "letter"]),
          mc("What type of value is 42?", null, ["number", "string", "integer-string", "digit"]),
          fill("Make greeting a string", "let greeting = ___;", ['"Hello"', "Hello", "(Hello)"]),
          mc("What is the result of this expression?", '"Hi" + " there"', ['"Hi there"', '"Hi+there"', "An error", "0"]),
          typeEx("Type the output of this code", 'console.log(typeof "cat");', "string"),
          codeEx('⌨️ Your turn — type the code that prints the type of "cat"', 'console.log(typeof "cat");'),
          mc("Joining two strings with + is called…", null, ["concatenation", "addition", "compression", "stringification"]),
        ],
      },
      {
        title: "Booleans & typeof",
        exercises: [
          mc("Which two values can a boolean have?", null, ["true and false", "yes and no", "1 and 2", "on and off"]),
          mc("What is the output?", "console.log(typeof true);", ['"boolean"', '"true"', '"bool"', '"number"']),
          fill("Fill in a boolean value", "let isHappy = ___;", ["true", '"yes"', "happy"]),
          mc("What is the output?", "console.log(typeof 99);", ['"number"', '"99"', '"string"', '"integer"']),
          typeEx("Type the output of this code", "console.log(typeof 3.14);", "number"),
          mc("Which of these is NOT a JavaScript type?", null, ["letter", "string", "number", "boolean"]),
        ],
      },
    ],
  },
  {
    title: "Unit 4 · Operators",
    desc: "Math, comparisons & logic",
    lessons: [
      {
        title: "Math Time",
        exercises: [
          mc("What is the output? (% gives the remainder)", "console.log(7 % 2);", ["1", "3.5", "2", "0"]),
          typeEx("Type the output of this code", "console.log(4 * 5);", "20"),
          fill("Add the price and the tax", "let total = price ___ tax;", ["+", "&", "plus"]),
          mc("What is the output?", "console.log(10 / 4);", ["2.5", "2", "3", "2.25"]),
          mc("What does x += 3 mean?", null, ["x = x + 3", "x === 3", "x is at least 3", "Add x to 3 and throw it away"]),
          order("Build the code: store a plus b in a variable called sum", ["let", "sum", "=", "a", "+", "b", ";"]),
          codeEx("⌨️ Your turn — type ONE line that prints the result of 4 * 5", "console.log(4 * 5);", ["console.log(20);"]),
        ],
      },
      {
        title: "Comparisons & Logic",
        exercises: [
          mc("What is the output?", 'console.log(5 === "5");', ["false", "true", "5", "Error"]),
          mc("Which operator checks value AND type?", null, ["===", "==", "=", "=>"]),
          typeEx("Type the output of this code", "console.log(7 > 3);", "true"),
          mc("What is the result of true && false?", null, ["false", "true", "maybe", "Error"]),
          mc("What does !true evaluate to? (! means NOT)", null, ["false", "true", "undefined", "Error"]),
          fill("Both conditions must be true — pick the operator", "if (age >= 13 ___ age < 20)", ["&&", "||", "++"]),
        ],
      },
    ],
  },
  {
    title: "Unit 5 · Conditionals",
    desc: "Teach your code to decide",
    lessons: [
      {
        title: "Making Decisions",
        exercises: [
          G.condTrue(),
          fill("Fill in the keyword", '___ (temp > 30) {\n  console.log("Hot!");\n}', ["if", "when", "check"]),
          mc("What is the output?", 'let x = 10;\nif (x > 5) {\n  console.log("big");\n}', ["big", "small", "x", "Nothing"]),
          typeEx("Type the output of this code", 'let age = 15;\nif (age >= 13) {\n  console.log("teen");\n}', "teen"),
          mc("In an if statement, the condition goes inside…", null,
            ['parentheses ( )', "curly braces { }", "square brackets [ ]", 'quotes " "']),
          order("Build the code: if x is greater than 5", ["if", "(", "x", ">", "5", ")"]),
          codeEx("⌨️ Your turn — type the opening line of an if that checks whether x is greater than 5", "if (x > 5) {", ["if (x > 5)"]),
        ],
      },
      {
        title: "Else & Else If",
        exercises: [
          G.elseRuns(),
          fill("Fill in the keyword", 'if (sunny) {\n  console.log("Beach!");\n} ___ {\n  console.log("Movies!");\n}', ["else", "otherwise", "or"]),
          mc("What is the output?", 'let x = 3;\nif (x > 5) {\n  console.log("big");\n} else {\n  console.log("small");\n}', ["small", "big", "3", "Nothing"]),
          mc("Which keyword chains a second condition?", null, ["else if", "elif", "elseif", "also if"]),
          typeEx("Type the output of this code", 'let n = 10;\nif (n % 2 === 0) {\n  console.log("even");\n} else {\n  console.log("odd");\n}', "even"),
          order('Build the else branch that prints "nope"', ["else", "{", "console.log", "(", '"nope"', ")", ";", "}"]),
        ],
      },
    ],
  },
  {
    title: "Unit 6 · Loops",
    desc: "Repeat without repeating yourself",
    lessons: [
      {
        title: "The for Loop",
        exercises: [
          mc("What is the correct order of the three parts in a for loop header?", null,
            ["start; condition; update", "condition; start; update", "update; condition; start", "start; update; condition"]),
          mc("What is the output?", "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}", ["0 1 2", "1 2 3", "0 1 2 3", "3"]),
          fill("Loop while i is less than 5", "for (let i = 0; i ___ 5; i++)", ["<", ">", "==="]),
          typeEx("How many times does this loop run? (type a number)", 'for (let i = 0; i < 4; i++) {\n  console.log("hi");\n}', "4"),
          mc("What does i++ do?", null, ["Adds 1 to i", "Doubles i", "Resets i to 0", "Deletes i"]),
          order("Build a for loop header counting 0, 1, 2", ["for", "(", "let i = 0", ";", "i < 3", ";", "i++", ")"]),
          codeEx("⌨️ Your turn — type a for-loop header that counts 0, 1, 2", "for (let i = 0; i < 3; i++) {", ["for (let i = 0; i < 3; i++)"]),
        ],
      },
      {
        title: "The while Loop",
        exercises: [
          mc("A while loop keeps running as long as its condition is…", null, ["true", "false", "a number", "short"]),
          mc("What is the output?", "let i = 0;\nwhile (i < 2) {\n  console.log(i);\n  i++;\n}", ["0 1", "1 2", "0 1 2", "Nothing"]),
          fill("Keep looping while lives is greater than 0", "while (lives ___ 0)", [">", "<", "==="]),
          mc("If you forget i++ inside a while loop, you get…", null,
            ["An infinite loop", "A syntax error", "A faster loop", "Exactly one run"]),
          typeEx("Type the output of this code", "let c = 3;\nwhile (c > 0) {\n  c--;\n}\nconsole.log(c);", "0"),
          mc("Which loop always runs its body at least once?", null, ["do...while", "while", "for", "if"]),
        ],
      },
    ],
  },
  {
    title: "Unit 7 · Functions",
    desc: "Reusable blocks of code",
    lessons: [
      {
        title: "Your First Function",
        exercises: [
          mc("Which keyword declares a function?", null, ["function", "func", "def", "method"]),
          order("Build the code: declare an empty function called greet", ["function", "greet", "(", ")", "{", "}"]),
          mc("How do you CALL the function greet?", null, ["greet();", "call greet;", "greet.run", "function greet"]),
          fill("Fill in the keyword", '___ sayHi() {\n  console.log("Hi");\n}', ["function", "method", "fun"]),
          mc("What is the output?", 'function wave() {\n  console.log("👋");\n}\nwave();\nwave();', ["👋 👋", "👋", "wave wave", "Nothing"]),
          typeEx("Type the output of this code", 'function boo() {\n  console.log("Boo!");\n}\nboo();', "Boo!"),
        ],
      },
      {
        title: "Parameters & Return",
        exercises: [
          mc("Values you pass into a function are called…", null, ["arguments", "ingredients", "imports", "options"]),
          mc("What does the return keyword do?", null,
            ["Sends a value back and ends the function", "Prints a value", "Restarts the function", "Deletes the function"]),
          typeEx("Type the output of this code", "function double(n) {\n  return n * 2;\n}\nconsole.log(double(5));", "10"),
          codeEx("⌨️ Your turn — write the line that sends a + b back to the caller", "return a + b;"),
          fill("Send the sum back to the caller", "function add(a, b) {\n  ___ a + b;\n}", ["return", "give", "console.log"]),
          mc("What is the output?", "function add(a, b) {\n  return a + b;\n}\nconsole.log(add(2, 3));", ["5", "23", "a + b", "undefined"]),
          order("Build the code: return a times b", ["return", "a", "*", "b", ";"]),
        ],
      },
    ],
  },
  {
    title: "Unit 8 · Arrays",
    desc: "Lists of anything",
    lessons: [
      {
        title: "Lists of Things",
        exercises: [
          mc("Which brackets create an array?", null, ["[ ]", "{ }", "( )", "< >"]),
          mc("Array positions (indexes) start counting at…", null, ["0", "1", "-1", "Wherever you like"]),
          typeEx("Type the output of this code", 'let letters = ["a", "b", "c"];\nconsole.log(letters[1]);', "b"),
          fill("How many items? Fill in the property", 'let colors = ["red", "blue"];\nconsole.log(colors.___);', ["length", "size", "count"]),
          mc("What is the output?", "console.log([1, 2, 3].length);", ["3", "2", "123", "[1, 2, 3]"]),
          order("Build the code: an array of the numbers 1, 2, 3 called nums", ["let", "nums", "=", "[", "1, 2, 3", "]", ";"]),
          codeEx("⌨️ Your turn — type the code that creates an array nums holding 1, 2, 3", "let nums = [1, 2, 3];", ["const nums = [1, 2, 3];"]),
        ],
      },
      {
        title: "Array Methods",
        exercises: [
          mc("Which method adds an item to the END of an array?", null, ["push", "pop", "add", "append"]),
          mc("Which method removes the LAST item of an array?", null, ["pop", "push", "shift", "cut"]),
          typeEx("Type the output of this code", "let a = [1, 2];\na.push(3);\nconsole.log(a.length);", "3"),
          fill('Add "apple" to the end of the list', 'fruits.___("apple");', ["push", "pop", "plus"]),
          mc("After this code runs, what is nums?", "let nums = [1, 2, 3];\nnums.pop();", ["[1, 2]", "[2, 3]", "[1, 2, 3]", "[]"]),
          mc('What does fruits.includes("kiwi") tell you?', null,
            ['Whether "kiwi" is in the array (true/false)', 'Where "kiwi" is', "How many kiwis there are", "It adds a kiwi"]),
        ],
      },
    ],
  },
];

/* =====================================================================
 * HTML — hand-written
 * =================================================================== */
const HTML_UNITS = [
  {
    title: "Unit 1 · Page Skeleton",
    desc: "Tags, headings & links",
    lessons: [
      {
        title: "Your First Tags",
        exercises: [
          mc("What is HTML used for?", null,
            ["The structure and content of web pages", "Making pages pretty", "Adding interactivity", "Querying databases"]),
          mc("Which tag makes the BIGGEST heading?", null, ["<h1>", "<h6>", "<head>", "<big>"]),
          order('Build a heading that says Hello', ["<h1>", "Hello", "</h1>"]),
          fill("Make this a paragraph", "<___>This is a paragraph</p>", ["p", "par", "text"]),
          codeEx("⌨️ Your turn — write the HTML for a big heading that says Hello", "<h1>Hello</h1>"),
          mc("Most HTML elements need an opening tag and a…", null,
            ["closing tag like </p>", "semicolon", "second opening tag", "password"]),
        ],
      },
      {
        title: "Links & Images",
        exercises: [
          mc("Which tag creates a link?", null, ["<a>", "<link>", "<url>", "<go>"]),
          fill("Make the link point somewhere", '<a ___="https://example.com">Visit</a>', ["href", "src", "url"]),
          mc("Which tag shows an image?", null, ["<img>", "<image>", "<pic>", "<photo>"]),
          typeEx("Which attribute holds the image file's address? (type it)", '<img ___="cat.png">', "src"),
          mc('What is the alt attribute on an image for?', null,
            ["A text description for screen readers and broken images", "An alternative image", "The image's password", "Making it load faster"]),
        ],
      },
    ],
  },
  {
    title: "Unit 2 · Structure & Forms",
    desc: "Lists, containers & inputs",
    lessons: [
      {
        title: "Lists & Containers",
        exercises: [
          mc("Which tag makes a BULLETED list?", null, ["<ul>", "<ol>", "<list>", "<li> alone"]),
          fill("Add an item to the list", "<ul>\n  <___>Milk</li>\n</ul>", ["li", "item", "ul"]),
          mc("What is <div> for?", null,
            ["A generic container for grouping content", "Dividing numbers", "Drawing lines", "Videos"]),
          mc("Which list is NUMBERED?", null, ["<ol>", "<ul>", "<nl>", "<dl>"]),
          order("Build a one-item bulleted list", ["<ul>", "<li>", "Tea", "</li>", "</ul>"]),
        ],
      },
      {
        title: "Forms & Buttons",
        exercises: [
          mc("Which tag makes a clickable button?", null, ["<button>", "<click>", "<btn>", "<press>"]),
          fill("Make a text box", '<input ___="text">', ["type", "kind", "mode"]),
          mc("Which tag wraps a whole form?", null, ["<form>", "<input>", "<submit>", "<fieldbox>"]),
          typeEx("Which tag makes a dropdown menu? (type it without brackets)", "<___>\n  <option>Red</option>\n</___>", "select"),
          mc("What does <label> do?", null,
            ["Describes an input so users (and screen readers) know what it's for", "Prints a sticker", "Names the page", "Adds a border"]),
          codeEx("⌨️ Your turn — type the HTML for a button that says Go", "<button>Go</button>"),
        ],
      },
    ],
  },
  {
    title: "Unit 3 · Tables & Media",
    desc: "Structured data, video & semantics",
    lessons: [
      {
        title: "Tables",
        exercises: [
          mc("Which tag starts a table?", null, ["<table>", "<tab>", "<grid>", "<sheet>"]),
          mc("Which tag is a table ROW?", null, ["<tr>", "<td>", "<row>", "<line>"]),
          fill("Add a data cell to the row", "<tr>\n  <___>42</td>\n</tr>", ["td", "cell", "tc"]),
          mc("Which tag is a bold HEADER cell?", null, ["<th>", "<td>", "<head>", "<hd>"]),
          codeEx("⌨️ Your turn — type a table row holding one cell with 42 in it", "<tr><td>42</td></tr>"),
        ],
      },
      {
        title: "Media & Semantics",
        exercises: [
          mc("Which tag embeds a video player?", null, ["<video>", "<movie>", "<media>", "<play>"]),
          mc("Which tag plays sound?", null, ["<audio>", "<sound>", "<music>", "<mp3>"]),
          mc("Which tag marks the top section of a page (logo, nav)?", null, ["<header>", "<top>", "<heading>", "<h1>"]),
          mc("Why use semantic tags like <nav>, <main> and <footer>?", null,
            ["They describe MEANING, helping search engines and screen readers", "They load faster", "They add styling automatically", "They are required by law"]),
        ],
      },
    ],
  },
  {
    title: "Unit 4 · The <head> & Attributes",
    desc: "Page setup and element superpowers",
    lessons: [
      {
        title: "Inside the <head>",
        exercises: [
          mc("What does the <title> tag control?", null,
            ["The text shown in the browser tab", "The biggest heading", "The page's font", "The URL"]),
          fill("Tell the browser which characters to use", '<meta ___="UTF-8">', ["charset", "encoding", "letters"]),
          mc("Which line loads a CSS file?", null,
            ['<link rel="stylesheet" href="style.css">', '<css src="style.css">', '<style href="style.css">', '<load css="style.css">']),
          mc("Which line loads a JavaScript file?", null,
            ['<script src="app.js"></script>', '<js href="app.js">', '<javascript src="app.js">', '<run file="app.js">']),
          codeEx("⌨️ Your turn — type the tag that names the browser tab: Home", "<title>Home</title>"),
        ],
      },
      {
        title: "Attributes",
        exercises: [
          mc("What is the difference between id and class?", null,
            ["id must be unique on the page; class can be reused", "They are identical", "class must be unique", "id is only for forms"]),
          mc('Can an element have class="card big"?', null,
            ["Yes — that's TWO classes at once", "No — one class only", "Only on divs", "Only with commas"]),
          fill("Give this element a unique name", '<div ___="main-menu">', ["id", "name", "key"]),
          mc('What does style="color: red" on a tag do?', null,
            ["Applies CSS directly to that one element", "Colors the whole page", "Nothing without a stylesheet", "Renames the tag"]),
        ],
      },
    ],
  },
];

/* =====================================================================
 * CSS — hand-written
 * =================================================================== */
const CSS_UNITS = [
  {
    title: "Unit 1 · Selectors & Colors",
    desc: "Point at things and paint them",
    lessons: [
      {
        title: "First Styles",
        exercises: [
          mc("What is CSS used for?", null,
            ["How a page LOOKS — colors, sizes, layout", "The page's content", "Interactivity and logic", "Storing data"]),
          fill("Make every heading red", "h1 {\n  color: ___;\n}", ["red", '"red"', "#red"]),
          mc('Which selector targets class="card"?', null, [".card", "#card", "card()", "<card>"]),
          mc('Which selector targets id="menu"?', null, ["#menu", ".menu", "menu()", "*menu"]),
          codeEx("⌨️ Your turn — write the declaration that makes text red", "color: red;"),
          order("Build the rule: make h1 blue", ["h1", "{", "color", ":", "blue", ";", "}"]),
        ],
      },
      {
        title: "Text & Color",
        exercises: [
          mc("Which property changes the BACKGROUND color?", null,
            ["background-color", "color-back", "bg", "fill"]),
          typeEx("Which property changes how BIG text is? (type it)", "p {\n  ___: 20px;\n}", "font-size"),
          fill("Give the size a unit", "font-size: 20___;", ["px", "size", "wide"]),
          mc("The hex color #ff0000 is…", null, ["red", "green", "blue", "white"]),
          mc("How do you write a CSS comment?", null, ["/* like this */", "// like this", "# like this", "<!-- like this -->"]),
        ],
      },
    ],
  },
  {
    title: "Unit 2 · Box & Layout",
    desc: "Spacing, borders & flexbox",
    lessons: [
      {
        title: "The Box Model",
        exercises: [
          mc("What is the difference between margin and padding?", null,
            ["Margin is space OUTSIDE the border, padding is INSIDE", "They are the same", "Margin is inside, padding is outside", "Padding only works on text"]),
          fill("Give the box a visible edge", "border: 1px ___ black;", ["solid", "filled", "hard"]),
          mc("From inside out, the box model layers are…", null,
            ["content → padding → border → margin", "margin → border → padding → content", "content → margin → padding → border", "border → content → padding → margin"]),
          typeEx("Which property rounds the corners? (type it)", ".card {\n  ___: 12px;\n}", "border-radius"),
          codeEx("⌨️ Your turn — type the declaration that rounds corners by 12px", "border-radius: 12px;"),
          mc("width: 100% makes an element…", null,
            ["As wide as its container", "100 pixels wide", "Full screen always", "Invisible"]),
        ],
      },
      {
        title: "Flexbox",
        exercises: [
          mc("Which display value lays children out in a flexible row?", null, ["flex", "row", "line", "inline-box"]),
          fill("Center the children horizontally", "display: flex;\n___: center;", ["justify-content", "text-align", "center-items"]),
          mc("Which property adds space BETWEEN flex children?", null, ["gap", "space", "between", "margin-flex"]),
          mc("align-items: center does what in a flex row?", null,
            ["Centers children vertically", "Centers children horizontally", "Centers the page", "Nothing"]),
          mc("Which selector styles a link while the mouse is over it?", null,
            ["a:hover", "a.hover", "a-hover", "hover(a)"]),
        ],
      },
    ],
  },
  {
    title: "Unit 3 · Color & Effects",
    desc: "Gradients, shadows & motion",
    lessons: [
      {
        title: "More Color",
        exercises: [
          mc("Which writes a color from red/green/blue amounts?", null, ["rgb(255, 0, 0)", "color(red)", "mix(r, g, b)", "#rgb only"]),
          mc("opacity: 0.5 makes an element…", null, ["Half transparent", "Half as wide", "Twice as bright", "Invisible"]),
          codeEx("⌨️ Your turn — type the declaration that makes an element half transparent", "opacity: 0.5;"),
          fill("Fade between two colors", "background: linear-___(red, blue);", ["gradient", "fade", "blend"]),
          mc("Which color is #00ff00?", null, ["green", "red", "blue", "yellow"]),
        ],
      },
      {
        title: "Shadows & Motion",
        exercises: [
          mc("Which property adds a soft shadow under a card?", null, ["box-shadow", "shadow", "drop", "blur-under"]),
          fill("Animate changes smoothly over 0.3 seconds", "transition: all 0.3___;", ["s", "px", "x"]),
          mc("transform: scale(1.1) makes an element…", null, ["10% bigger", "10% smaller", "Rotated 1.1°", "1.1px wider"]),
          mc("Which makes the mouse pointer a hand over a button?", null, ["cursor: pointer", "mouse: hand", "pointer: hand", "hover: grab"]),
        ],
      },
    ],
  },
  {
    title: "Unit 4 · Units & Position",
    desc: "Sizes that adapt, layers that stick",
    lessons: [
      {
        title: "Sizing Units",
        exercises: [
          mc("width: 50% means…", null,
            ["Half the width of the parent element", "50 pixels", "Half the screen always", "50 characters"]),
          mc("What is 100vh?", null,
            ["The full height of the viewport (screen)", "100 pixels", "Very high priority", "100% of the parent"]),
          mc("1em is relative to…", null,
            ["The element's font size", "One pixel", "The screen width", "The em dash"]),
          fill("Make it half the parent's width", "width: 50___;", ["%", "px", "em"]),
          codeEx("⌨️ Your turn — type the declaration that makes the width half of the parent", "width: 50%;"),
        ],
      },
      {
        title: "Position & Layers",
        exercises: [
          mc("position: fixed makes an element…", null,
            ["Stay in place even when you scroll", "Unbreakable", "Centered", "Invisible"]),
          mc("position: absolute places an element…", null,
            ["Relative to its nearest positioned ancestor", "In the exact screen center", "At the top always", "Randomly"]),
          mc("Which property decides what's on TOP when elements overlap?", null,
            ["z-index", "layer", "depth", "top-most"]),
          fill("Make the header stick to the top while scrolling", "position: ___;\ntop: 0;", ["sticky", "stuck", "glue"]),
        ],
      },
    ],
  },
];

/* =====================================================================
 * SQL — hand-written
 * =================================================================== */
const SQL_UNITS = [
  {
    title: "Unit 1 · Reading Data",
    desc: "SELECT your way around",
    lessons: [
      {
        title: "SELECT & FROM",
        exercises: [
          mc("What does SELECT do?", null,
            ["Reads data out of a table", "Deletes data", "Creates a table", "Renames the database"]),
          fill("Get EVERY column", "SELECT ___ FROM users;", ["*", "%", "all"]),
          order("Build the query: get all names from the users table", ["SELECT", "name", "FROM", "users", ";"]),
          mc("In SELECT name FROM users, what is users?", null,
            ["The table to read from", "A column", "A password", "A function"]),
          typeEx("Which keyword fetches data? (type it)", "___ name FROM users;", "SELECT"),
          codeEx("⌨️ Your turn — write the query that gets ALL columns from the users table", "SELECT * FROM users;", null, { ci: true }),
        ],
      },
      {
        title: "Filtering & Sorting",
        exercises: [
          fill("Only adults, please", "SELECT * FROM users ___ age >= 18;", ["WHERE", "IF", "FILTER"]),
          mc("What does WHERE do?", null,
            ["Keeps only rows that match a condition", "Chooses the database", "Sorts the rows", "Renames a column"]),
          mc("Which clause sorts the results?", null, ["ORDER BY", "SORT BY", "ARRANGE", "GROUP BY"]),
          fill("Only the first 10 rows", "SELECT * FROM scores ORDER BY points DESC ___ 10;", ["LIMIT", "TOP", "FIRST"]),
          mc("SELECT DISTINCT city FROM users returns…", null,
            ["Each city only once", "All rows", "Cities in uppercase", "The biggest city"]),
        ],
      },
    ],
  },
  {
    title: "Unit 2 · Changing Data",
    desc: "Insert, update, delete — carefully",
    lessons: [
      {
        title: "Insert & Update",
        exercises: [
          mc("Which statement adds a NEW row?", null, ["INSERT INTO", "ADD ROW", "NEW", "APPEND"]),
          fill("Complete the insert", "INSERT INTO users (name) ___ ('Ada');", ["VALUES", "SET", "DATA"]),
          mc("Which statement changes EXISTING rows?", null, ["UPDATE", "CHANGE", "MODIFY", "ALTER ROW"]),
          fill("Complete the delete", "DELETE ___ users WHERE id = 1;", ["FROM", "IN", "OFF"]),
          mc("What happens if you run DELETE FROM users with NO WHERE clause?", null,
            ["Every row in the table is deleted", "Nothing", "One random row is deleted", "An error — WHERE is required"]),
          codeEx("⌨️ Your turn — type the statement that deletes the user with id 1 from users", "DELETE FROM users WHERE id = 1;", null, { ci: true }),
        ],
      },
      {
        title: "Counting & Joining",
        exercises: [
          mc("How do you count the rows in a table?", null,
            ["SELECT COUNT(*) FROM users;", "SELECT SIZE FROM users;", "COUNT users;", "SELECT TOTAL users;"]),
          fill("Count signups per city", "SELECT city, COUNT(*) FROM users ___ city;", ["GROUP BY", "ORDER BY", "SPLIT BY"]),
          mc("What does JOIN do?", null,
            ["Combines rows from two tables using a related column", "Merges two databases", "Adds two numbers", "Duplicates a table"]),
          mc("A PRIMARY KEY is…", null,
            ["A column that uniquely identifies each row", "The first column", "A password", "The fastest column"]),
          typeEx("Which keyword combines two tables? (type it)", "SELECT * FROM orders ___ users ON orders.user_id = users.id;", "JOIN"),
        ],
      },
    ],
  },
  {
    title: "Unit 3 · Tables & Safety",
    desc: "Create tables, combine conditions",
    lessons: [
      {
        title: "Making Tables",
        exercises: [
          mc("Which statement makes a NEW table?", null, ["CREATE TABLE", "NEW TABLE", "MAKE TABLE", "ADD TABLE"]),
          fill("Give the column a text type", "CREATE TABLE users (\n  name ___(50)\n);", ["VARCHAR", "TEXTBOX", "STRINGY"]),
          mc("NULL in a row means…", null, ["The value is missing/unknown", "The value is zero", "The text 'NULL'", "An error"]),
          mc("Which combines two conditions in a WHERE clause?", null, ["AND", "PLUS", "WITH", "&&&"]),
          codeEx("⌨️ Your turn — type the query that counts ALL rows in users", "SELECT COUNT(*) FROM users;", null, { ci: true }),
        ],
      },
      {
        title: "Patterns & Math",
        exercises: [
          mc("WHERE name LIKE 'A%' matches…", null, ["Names starting with A", "Names ending with A", "Names containing %", "Exactly 'A%'"]),
          fill("Ages from 13 to 19 inclusive", "WHERE age ___ 13 AND 19;", ["BETWEEN", "RANGE", "FROM"]),
          mc("Which gives the average of a column?", null, ["AVG(score)", "MEAN(score)", "MID(score)", "AVERAGE ALL"]),
          mc("Why use query parameters instead of pasting user text into SQL?", null,
            ["To prevent SQL injection attacks", "It runs faster", "It looks nicer", "Parameters are required"]),
        ],
      },
    ],
  },
  {
    title: "Unit 4 · Sorting & NULL",
    desc: "Order results, handle the unknown",
    lessons: [
      {
        title: "Sorting & Sets",
        exercises: [
          fill("Highest scores first", "SELECT * FROM scores ORDER BY points ___;", ["DESC", "DOWN", "HIGH"]),
          mc("Without ASC or DESC, ORDER BY sorts…", null,
            ["Ascending (smallest first)", "Descending", "Randomly", "By row id"]),
          mc("WHERE city IN ('Rome', 'Paris') matches…", null,
            ["Rows whose city is Rome OR Paris", "Rows in both cities", "Cities containing those letters", "Nothing — invalid"]),
          fill("Match either of the two cities", "WHERE city ___ ('Rome', 'Paris');", ["IN", "OF", "AT"]),
          codeEx("⌨️ Your turn — type the query that gets all users sorted by name, highest first", "SELECT * FROM users ORDER BY name DESC;", null, { ci: true }),
        ],
      },
      {
        title: "NULL & NOT",
        exercises: [
          mc("How do you find rows where phone is missing?", null,
            ["WHERE phone IS NULL", "WHERE phone = NULL", "WHERE phone == NULL", "WHERE phone EMPTY"]),
          fill("Only rows that HAVE a phone number", "WHERE phone IS ___ NULL;", ["NOT", "NO", "ANTI"]),
          mc("What does NOT do in a WHERE clause?", null,
            ["Reverses a condition", "Deletes rows", "Sorts backwards", "Comments it out"]),
          mc("Which means NOT EQUAL in SQL?", null, ["<>", "!==", "=/=", "~="]),
        ],
      },
    ],
  },
];

/* =====================================================================
 * Generated language specs
 * =================================================================== */
const SPEC = {};

SPEC.python = {
  printLine: 'print("Hello!")',
  wrongPrints: ['console.log("Hello!")', 'echo "Hello!"', 'System.out.println("Hello!");'],
  printNum: { code: "print(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["print", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["print", "echo", "console.log"] },
  hello: { code: 'print("Hello, World!")', ans: "Hello, World!" },
  commentChar: "#", commentWrong: ["//", "<!--"],
  styleQ: { q: "How does Python group the code inside an if or a loop?",
    choices: ["Indentation (spaces at the start of the line)", "Curly braces { }", "Parentheses ( )", "Semicolons"] },
  useQ: { choices: ["Data science, AI and automation", "Styling web pages", "Only phone apps", "Designing fonts"] },
  decl: { line: "x = 5", wrong: ["let x = 5;", "int x = 5;", "var x := 5"] },
  declTokens: ["age", "=", "13"],
  declFill: { code: 'name ___ "Ada"', choices: ["=", "==", "<-"] },
  varPrint: { code: "x = 7\nprint(x)", ans: "7" },
  types1: { q: 'What type is "hello" in Python?', choices: ["str", "string", "char", "text"] },
  types2: { q: "What type is 42 in Python?", choices: ["int", "number", "float", "digit"] },
  boolQ: { q: "Which are Python's boolean values?", choices: ["True and False", "true and false", "YES and NO", "1 and 0 only"] },
  concat: { q: 'What does "Py" + "thon" give you?', choices: ['"Python"', '"Py thon"', "An error", '"Py+thon"'] },
  eqQ: { choices: ["==", "=", "===", "equals"] },
  ifFill: { code: '___ age >= 13:\n    print("teen")', choices: ["if", "when", "case"] },
  ifQ: { code: 'x = 3\nif x > 5:\n    print("big")\nelse:\n    print("small")', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i in range(3):\n    print(i)", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for i in ___(5):", choices: ["range", "count", "loop"] },
  funcQ: { choices: ["def", "function", "fn", "func"] },
  funcOut: { code: "def double(n):\n    return n * 2\n\nprint(double(5))", out: "10", wrong: ["5", "double(5)", "n * 2"] },
  returnTokens: ["return", "a", "+", "b"],
};

SPEC.typescript = {
  printLine: 'console.log("Hello!");',
  wrongPrints: ['print("Hello!")', 'echo "Hello!";', 'System.out.println("Hello!");'],
  printNum: { code: "console.log(2 + 3);", out: "5", wrong: ["23", "2 + 3", "Error"] },
  printTokens: ["console", ".", "log", "(", '"Hi"', ")", ";"],
  printFill: { code: '___("Good morning");', choices: ["console.log", "print", "echo"] },
  hello: { code: 'console.log("Hello, World!");', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "What does TypeScript add on top of JavaScript?",
    choices: ["Static types that catch bugs before the code runs", "Faster internet", "A new browser", "Built-in databases"] },
  useQ: { choices: ["Large web apps that need type-safe JavaScript", "Styling pages", "Operating systems", "Spreadsheets"] },
  decl: { line: "let x: number = 5;", wrong: ["x = 5", "int x = 5;", "let x := 5"] },
  declTokens: ["let", "age", ":", "number", "=", "13", ";"],
  declFill: { code: 'let name: ___ = "Ada";', choices: ["string", "text", "str"] },
  varPrint: { code: "let x: number = 7;\nconsole.log(x);", ans: "7" },
  types1: { q: "Which type annotation is for text?", choices: ["string", "text", "char", "letters"] },
  types2: { q: "Which type annotation is for 42?", choices: ["number", "int", "float", "digit"] },
  boolQ: { q: "Which are TypeScript's boolean values?", choices: ["true and false", "True and False", "YES and NO", "1 and 0 only"] },
  concat: { q: 'What does "Type" + "Script" give you?', choices: ['"TypeScript"', '"Type Script"', "An error", '"Type+Script"'] },
  eqQ: { q: "Which operator checks value AND type?", choices: ["===", "==", "=", "is"] },
  ifFill: { code: '___ (x > 5) {\n  console.log("big");\n}', choices: ["if", "when", "check"] },
  ifQ: { code: 'let x = 3;\nif (x > 5) {\n  console.log("big");\n} else {\n  console.log("small");\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (let i = 0; i ___ 3; i++)", choices: ["<", ">", "==="] },
  funcQ: { choices: ["function", "def", "fn", "func"] },
  funcOut: { code: "function double(n: number): number {\n  return n * 2;\n}\nconsole.log(double(5));", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b", ";"],
};

SPEC.java = {
  printLine: 'System.out.println("Hello!");',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!");', 'echo "Hello!";'],
  printNum: { code: "System.out.println(2 + 3);", out: "5", wrong: ["23", "2 + 3", "Error"] },
  printTokens: ["System.out.println", "(", '"Hi"', ")", ";"],
  printFill: { code: '___("Good morning");', choices: ["System.out.println", "print", "console.log"] },
  hello: { code: 'System.out.println("Hello, World!");', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "Every statement in Java must end with…", choices: [";", "a new line", "a period", "nothing"] },
  useQ: { choices: ["Android apps and large business systems", "Styling web pages", "Quick shell scripts", "Spreadsheets"] },
  decl: { line: "int x = 5;", wrong: ["x = 5", "let x = 5;", "x := 5"] },
  declTokens: ["int", "age", "=", "13", ";"],
  declFill: { code: "___ score = 10;", choices: ["int", "number", "let"] },
  varPrint: { code: "int x = 7;\nSystem.out.println(x);", ans: "7" },
  types1: { q: 'Which Java type holds text like "hello"?', choices: ["String", "str", "text", "letters"] },
  types2: { q: "Which Java type holds the whole number 42?", choices: ["int", "String", "decimal", "num"] },
  boolQ: { q: "Which are Java's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: 'What does "Ja" + "va" give you?', choices: ['"Java"', '"Ja va"', "An error", '"Ja+va"'] },
  eqQ: { q: "Which operator compares two numbers for equality in Java?", choices: ["==", "=", "===", "is"] },
  ifFill: { code: '___ (x > 5) {\n    System.out.println("big");\n}', choices: ["if", "when", "check"] },
  ifQ: { code: 'int x = 3;\nif (x > 5) {\n    System.out.println("big");\n} else {\n    System.out.println("small");\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for (int i = 0; i < 3; i++) {\n    System.out.println(i);\n}", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (int i = 0; i ___ 3; i++)", choices: ["<", ">", "=="] },
  funcQ: { q: "Which keyword sends a value back from a Java method?", choices: ["return", "give", "send", "out"] },
  funcOut: { code: "static int doubleIt(int n) {\n    return n * 2;\n}\n// later…\nSystem.out.println(doubleIt(5));", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b", ";"],
};

SPEC.csharp = {
  printLine: 'Console.WriteLine("Hello!");',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!");', 'echo "Hello!";'],
  printNum: { code: "Console.WriteLine(2 + 3);", out: "5", wrong: ["23", "2 + 3", "Error"] },
  printTokens: ["Console.WriteLine", "(", '"Hi"', ")", ";"],
  printFill: { code: '___("Good morning");', choices: ["Console.WriteLine", "print", "echo"] },
  hello: { code: 'Console.WriteLine("Hello, World!");', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "Every statement in C# ends with…", choices: [";", "a new line", "a period", "a comma"] },
  useQ: { choices: ["Windows apps, web services and Unity games", "Styling web pages", "Statistics", "Phone calls"] },
  decl: { line: "int x = 5;", wrong: ["x = 5", "let x = 5;", "dim x = 5"] },
  declTokens: ["int", "age", "=", "13", ";"],
  declFill: { code: '___ name = "Ada";', choices: ["var", "let", "dim"] },
  varPrint: { code: "int x = 7;\nConsole.WriteLine(x);", ans: "7" },
  types1: { q: 'Which C# type holds text like "hello"?', choices: ["string", "str", "text", "varchar"] },
  types2: { q: "Which C# type holds the whole number 42?", choices: ["int", "number", "digit", "numeric"] },
  boolQ: { q: "Which are C#'s boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: 'What does "C" + "Sharp" give you?', choices: ['"CSharp"', '"C Sharp"', "An error", '"C+Sharp"'] },
  eqQ: { choices: ["==", "=", "===", "Equals only"] },
  ifFill: { code: '___ (x > 5) {\n    Console.WriteLine("big");\n}', choices: ["if", "when", "check"] },
  ifQ: { code: 'int x = 3;\nif (x > 5) {\n    Console.WriteLine("big");\n} else {\n    Console.WriteLine("small");\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for (int i = 0; i < 3; i++) {\n    Console.WriteLine(i);\n}", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (int i = 0; i ___ 3; i++)", choices: ["<", ">", "=="] },
  funcQ: { q: "Which keyword sends a value back from a C# method?", choices: ["return", "give", "yield only", "out"] },
  funcOut: { code: "static int DoubleIt(int n) {\n    return n * 2;\n}\n// later…\nConsole.WriteLine(DoubleIt(5));", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b", ";"],
};

SPEC.cpp = {
  printLine: 'std::cout << "Hello!";',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!");', 'echo "Hello!";'],
  printNum: { code: "std::cout << 2 + 3;", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["std::cout", "<<", '"Hi"', ";"],
  printFill: { code: 'std::___ << "Good morning";', choices: ["cout", "print", "cin"] },
  hello: { code: 'std::cout << "Hello, World!";', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "Which operator sends text TO std::cout?", choices: ["<<", ">>", "->", "::"] },
  useQ: { choices: ["Games, game engines and high-performance software", "Styling web pages", "Writing emails", "Simple website forms"] },
  decl: { line: "int x = 5;", wrong: ["x = 5", "let x = 5;", "x := 5"] },
  declTokens: ["int", "age", "=", "13", ";"],
  declFill: { code: "___ score = 10;", choices: ["int", "let", "def"] },
  varPrint: { code: "int x = 7;\nstd::cout << x;", ans: "7" },
  types1: { q: 'Which C++ type holds text like "hello"?', choices: ["std::string", "str", "text", "letters"] },
  types2: { q: "Which C++ type holds the whole number 42?", choices: ["int", "number", "digit", "num"] },
  boolQ: { q: "Which are C++'s boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: "What does this print?", code: 'std::cout << "C" << "++";', choices: ["C++", "C ++", "Error", '"C""++"'] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ (x > 5) {\n    std::cout << "big";\n}', choices: ["if", "when", "check"] },
  ifQ: { code: 'int x = 3;\nif (x > 5) {\n    std::cout << "big";\n} else {\n    std::cout << "small";\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: 'for (int i = 0; i < 3; i++) {\n    std::cout << i << " ";\n}', out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (int i = 0; i ___ 3; i++)", choices: ["<", ">", "=="] },
  funcQ: { q: "Which keyword sends a value back from a C++ function?", choices: ["return", "give", "send", "out"] },
  funcOut: { code: "int doubleIt(int n) {\n    return n * 2;\n}\n// later…\nstd::cout << doubleIt(5);", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "*", "b", ";"],
};

SPEC.c = {
  printLine: 'printf("Hello!");',
  wrongPrints: ['print("Hello!")', 'System.out.println("Hello!");', 'echo "Hello!";'],
  printNum: { code: 'printf("%d", 2 + 3);', out: "5", wrong: ["%d", "2 + 3", "Error"] },
  printTokens: ["printf", "(", '"Hi"', ")", ";"],
  printFill: { code: '___("Good morning");', choices: ["printf", "print", "console.log"] },
  hello: { code: 'printf("Hello, World!");', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "Every statement in C ends with…", choices: [";", ":", ".", "a comma"] },
  useQ: { choices: ["Operating systems and fast, low-level programs", "Styling web pages", "Slideshows", "Database queries"] },
  decl: { line: "int x = 5;", wrong: ["x = 5", "let x = 5;", "make x = 5"] },
  declTokens: ["int", "age", "=", "13", ";"],
  declFill: { code: "___ score = 10;", choices: ["int", "let", "var"] },
  varPrint: { code: 'int x = 7;\nprintf("%d", x);', ans: "7" },
  types1: { q: "How is text usually stored in C?", choices: ["As an array of chars, like char name[]", "In a String object", "As a text type", "C can't store text"] },
  types2: { q: "Which C type holds the whole number 42?", choices: ["int", "number", "digit", "text"] },
  boolQ: { q: "In a C condition, 0 counts as … and any other number as …", choices: ["false / true", "true / false", "error / ok", "empty / full"] },
  concat: { q: "Which printf placeholder prints a whole number?", choices: ["%d", "%s", "%n", "%x"] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ (x > 5) {\n    printf("big");\n}', choices: ["if", "when", "check"] },
  ifQ: { code: 'int x = 3;\nif (x > 5) {\n    printf("big");\n} else {\n    printf("small");\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: 'for (int i = 0; i < 3; i++) {\n    printf("%d ", i);\n}', out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (int i = 0; i ___ 3; i++)", choices: ["<", ">", "=="] },
  funcQ: { q: "What does return do in a C function?", choices: ["Sends a value back and ends the function", "Prints a value", "Pauses the program", "Declares a variable"] },
  funcOut: { code: 'int doubleIt(int n) {\n    return n * 2;\n}\n// later…\nprintf("%d", doubleIt(5));', out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b", ";"],
};

SPEC.go = {
  printLine: 'fmt.Println("Hello!")',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!");', 'echo "Hello!"'],
  printNum: { code: "fmt.Println(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["fmt.Println", "(", '"Hi"', ")"],
  printFill: { code: 'fmt.___("Good morning")', choices: ["Println", "Echo", "Log"] },
  hello: { code: 'fmt.Println("Hello, World!")', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "How do you create AND assign a new variable in Go, in one step?", choices: ["x := 5", "x = 5 only", "let x = 5", "make x 5"] },
  useQ: { choices: ["Cloud services, servers and developer tools", "Styling web pages", "Phone ringtones", "Spreadsheets"] },
  decl: { line: "x := 5", wrong: ["let x = 5;", "int x = 5;", "x == 5"] },
  declTokens: ["age", ":=", "13"],
  declFill: { code: 'name ___ "Ada"', choices: [":=", "=:", "<-"] },
  varPrint: { code: "x := 7\nfmt.Println(x)", ans: "7" },
  types1: { q: 'Which Go type holds text like "hello"?', choices: ["string", "str", "text", "letters"] },
  types2: { q: "Which Go type holds the whole number 42?", choices: ["int", "number", "integer", "digit"] },
  boolQ: { q: "Which are Go's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: 'What does "Go" + "pher" give you?', choices: ['"Gopher"', '"Go pher"', "An error", '"Go+pher"'] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ x > 5 {\n    fmt.Println("big")\n}', choices: ["if", "when", "case"] },
  ifQ: { code: 'x := 3\nif x > 5 {\n    fmt.Println("big")\n} else {\n    fmt.Println("small")\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i := 0; i < 3; i++ {\n    fmt.Println(i)\n}", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for i := 0; i ___ 3; i++", choices: ["<", ">", "=="] },
  funcQ: { choices: ["func", "function", "def", "fn"] },
  funcOut: { code: "func double(n int) int {\n    return n * 2\n}\n// later…\nfmt.Println(double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b"],
};

SPEC.rust = {
  printLine: 'println!("Hello!");',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!");', 'echo "Hello!";'],
  printNum: { code: 'println!("{}", 2 + 3);', out: "5", wrong: ["{}", "2 + 3", "Error"] },
  printTokens: ["println!", "(", '"Hi"', ")", ";"],
  printFill: { code: '___("Good morning");', choices: ["println!", "print", "echo!"] },
  hello: { code: 'println!("Hello, World!");', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "The ! in println! tells you it is a…", choices: ["macro", "function", "warning", "mistake"] },
  useQ: { choices: ["Fast, memory-safe systems programming", "Styling web pages", "Spreadsheets", "Slide decks"] },
  decl: { line: "let x = 5;", wrong: ["x = 5", "int x = 5;", "var x = 5;"] },
  declTokens: ["let", "age", "=", "13", ";"],
  declFill: { code: '___ name = "Ada";', choices: ["let", "var", "int"] },
  varPrint: { code: 'let x = 7;\nprintln!("{}", x);', ans: "7" },
  types1: { q: "Which is a Rust text type?", choices: ["String", "text", "varchar", "letters"] },
  types2: { q: "Which Rust type is a 32-bit whole number?", choices: ["i32", "int", "number", "n32"] },
  boolQ: { q: "Which are Rust's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: "What does this print?", code: 'println!("{}{}", "Ru", "st");', choices: ["Rust", "Ru st", "{}{}", "Error"] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ x > 5 {\n    println!("big");\n}', choices: ["if", "when", "match"] },
  ifQ: { code: 'let x = 3;\nif x > 5 {\n    println!("big");\n} else {\n    println!("small");\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: 'for i in 0..3 {\n    println!("{}", i);\n}', out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for i in 0___3 {", choices: ["..", "=>", "->"] },
  funcQ: { choices: ["fn", "function", "def", "func"] },
  funcOut: { code: 'fn double(n: i32) -> i32 {\n    n * 2\n}\n// later…\nprintln!("{}", double(5));', out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b", ";"],
};

SPEC.php = {
  printLine: 'echo "Hello!";',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!");', 'System.out.println("Hello!");'],
  printNum: { code: "echo 2 + 3;", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["echo", '"Hi"', ";"],
  printFill: { code: '___ "Good morning";', choices: ["echo", "console.log", "println"] },
  hello: { code: 'echo "Hello, World!";', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["<!--", "**"],
  styleQ: { q: "Every PHP variable name starts with…", choices: ["$", "#", "@", "&"] },
  useQ: { choices: ["Server-side websites — WordPress, Laravel & more", "Styling web pages", "Phone apps only", "Video editing"] },
  decl: { line: "$x = 5;", wrong: ["x = 5;", "let x = 5;", "int x = 5;"] },
  declTokens: ["$age", "=", "13", ";"],
  declFill: { code: "___age = 13;", choices: ["$", "#", "@"] },
  varPrint: { code: "$x = 7;\necho $x;", ans: "7" },
  types1: { q: 'What type is "hello" in PHP?', choices: ["string", "str", "text", "char"] },
  types2: { q: "What type is 42 in PHP?", choices: ["int", "number", "digit", "numeric"] },
  boolQ: { q: "Which are PHP's boolean values?", choices: ["true and false", "True and False only", "1 and 0 only", "YES and NO"] },
  concat: { q: "PHP joins strings with which operator?", choices: [".", "+", "&", "++"] },
  eqQ: { q: "Which PHP operator checks value AND type?", choices: ["===", "==", "=", "eq"] },
  ifFill: { code: '___ ($x > 5) {\n    echo "big";\n}', choices: ["if", "when", "check"] },
  ifQ: { code: '$x = 3;\nif ($x > 5) {\n    echo "big";\n} else {\n    echo "small";\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: 'for ($i = 0; $i < 3; $i++) {\n    echo $i . " ";\n}', out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for ($i = 0; $i ___ 3; $i++)", choices: ["<", ">", "=="] },
  funcQ: { choices: ["function", "def", "func", "fn"] },
  funcOut: { code: "function double($n) {\n    return $n * 2;\n}\necho double(5);", out: "10", wrong: ["5", "$n * 2", "Error"] },
  returnTokens: ["return", "$a", "+", "$b", ";"],
  nameQ: ["$score", "score", "2cool", "my-score"],
};

SPEC.ruby = {
  printLine: 'puts "Hello!"',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!")', 'echo "Hello!"'],
  printNum: { code: "puts 2 + 3", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["puts", '"Hi"'],
  printFill: { code: '___ "Good morning"', choices: ["puts", "echo", "console.log"] },
  hello: { code: 'puts "Hello, World!"', ans: "Hello, World!" },
  commentChar: "#", commentWrong: ["//", "<!--"],
  styleQ: { q: "How does Ruby close an if block?", choices: ["end", "}", "fi", "stop"] },
  useQ: { choices: ["Web apps — especially with Ruby on Rails", "Styling web pages", "Operating systems", "3D games"] },
  decl: { line: "x = 5", wrong: ["let x = 5", "int x = 5", "var x := 5"] },
  declTokens: ["age", "=", "13"],
  declFill: { code: 'name ___ "Ada"', choices: ["=", "==", "<-"] },
  varPrint: { code: "x = 7\nputs x", ans: "7" },
  types1: { q: 'What class is "hello" in Ruby?', choices: ["String", "str", "text", "varchar"] },
  types2: { q: "What class is 42 in Ruby?", choices: ["Integer", "int", "number", "Float"] },
  boolQ: { q: "Which are Ruby's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: 'What does "Ru" + "by" give you?', choices: ['"Ruby"', '"Ru by"', "An error", '"Ru+by"'] },
  eqQ: { choices: ["==", "=", "<=>", "eq"] },
  ifFill: { code: '___ age >= 13\n  puts "teen"\nend', choices: ["if", "when", "case"] },
  ifQ: { code: 'x = 3\nif x > 5\n  puts "big"\nelse\n  puts "small"\nend', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "3.times do |i|\n  puts i\nend", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "3.___ do |i|\n  puts i\nend", choices: ["times", "loops", "repeat"] },
  funcQ: { choices: ["def", "function", "fn", "func"] },
  funcOut: { code: "def double(n)\n  n * 2\nend\n\nputs double(5)", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b"],
};

SPEC.swift = {
  printLine: 'print("Hello!")',
  wrongPrints: ['echo "Hello!"', 'console.log("Hello!")', 'puts "Hello!"'],
  printNum: { code: "print(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["print", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["print", "puts", "echo"] },
  hello: { code: 'print("Hello, World!")', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "In Swift, let creates a … and var creates a …",
    choices: ["constant / changeable variable", "variable / constant", "loop / function", "class / struct"] },
  useQ: { choices: ["iPhone, iPad and Mac apps", "Styling web pages", "Windows games", "Databases"] },
  decl: { line: "var x = 5", wrong: ["x = 5 only", "int x = 5;", "dim x = 5"] },
  declTokens: ["var", "age", "=", "13"],
  declFill: { code: '___ birthday = "June"  // never changes', choices: ["let", "var", "const"] },
  varPrint: { code: "var x = 7\nprint(x)", ans: "7" },
  types1: { q: 'Which Swift type holds text like "hello"?', choices: ["String", "str", "text", "chars"] },
  types2: { q: "Which Swift type holds the whole number 42?", choices: ["Int", "int", "number", "integer"] },
  boolQ: { q: "Which are Swift's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: 'What does "Sw" + "ift" give you?', choices: ['"Swift"', '"Sw ift"', "An error", '"Sw+ift"'] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ x > 5 {\n    print("big")\n}', choices: ["if", "when", "guard"] },
  ifQ: { code: 'let x = 3\nif x > 5 {\n    print("big")\n} else {\n    print("small")\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i in 0..<3 {\n    print(i)\n}", out: "0 1 2", wrong: ["0 1 2 3", "1 2 3", "3"] },
  loopFill: { code: "for i in 0___3 {  // 0, 1, 2", choices: ["..<", "...", "->"] },
  funcQ: { choices: ["func", "function", "def", "fn"] },
  funcOut: { code: "func double(_ n: Int) -> Int {\n    return n * 2\n}\nprint(double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b"],
};

SPEC.kotlin = {
  printLine: 'println("Hello!")',
  wrongPrints: ['print!("Hello!")', 'console.log("Hello!")', 'echo "Hello!"'],
  printNum: { code: "println(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["println", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["println", "printline", "echo"] },
  hello: { code: 'println("Hello, World!")', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "In Kotlin, val creates a … and var creates a …",
    choices: ["read-only value / changeable variable", "variable / constant", "function / class", "loop / range"] },
  useQ: { choices: ["Android apps — Google's preferred language", "Styling web pages", "Operating systems", "Spreadsheets"] },
  decl: { line: "var x = 5", wrong: ["x = 5", "int x = 5;", "dim x = 5"] },
  declTokens: ["var", "age", "=", "13"],
  declFill: { code: '___ birthday = "June"  // never changes', choices: ["val", "var", "let"] },
  varPrint: { code: "var x = 7\nprintln(x)", ans: "7" },
  types1: { q: 'Which Kotlin type holds text like "hello"?', choices: ["String", "str", "text", "chars"] },
  types2: { q: "Which Kotlin type holds the whole number 42?", choices: ["Int", "int", "number", "digit"] },
  boolQ: { q: "Which are Kotlin's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: 'What does "Kot" + "lin" give you?', choices: ['"Kotlin"', '"Kot lin"', "An error", '"Kot+lin"'] },
  eqQ: { choices: ["==", "=", "eq", "<=>"] },
  ifFill: { code: '___ (x > 5) {\n    println("big")\n}', choices: ["if", "when", "check"] },
  ifQ: { code: 'val x = 3\nif (x > 5) {\n    println("big")\n} else {\n    println("small")\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for (i in 0..2) {\n    println(i)\n}", out: "0 1 2", wrong: ["0 1", "1 2", "0 1 2 3"] },
  loopFill: { code: "for (i in 0___2) {  // 0, 1, 2", choices: ["..", "...", "to"] },
  funcQ: { choices: ["fun", "func", "def", "function"] },
  funcOut: { code: "fun double(n: Int): Int {\n    return n * 2\n}\nprintln(double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b"],
};

SPEC.dart = {
  printLine: "print('Hello!');",
  wrongPrints: ['echo "Hello!";', 'console.log("Hello!");', 'puts "Hello!"'],
  printNum: { code: "print(2 + 3);", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["print", "(", "'Hi'", ")", ";"],
  printFill: { code: "___('Good morning');", choices: ["print", "echo", "console.log"] },
  hello: { code: "print('Hello, World!');", ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "Dart is the language behind which app framework?", choices: ["Flutter", "React", "Django", "Rails"] },
  useQ: { choices: ["Cross-platform apps with Flutter", "Styling web pages", "Operating systems", "Databases"] },
  decl: { line: "var x = 5;", wrong: ["x = 5", "let x = 5;", "dim x = 5"] },
  declTokens: ["var", "age", "=", "13", ";"],
  declFill: { code: "___ name = 'Ada';", choices: ["var", "let", "dim"] },
  varPrint: { code: "var x = 7;\nprint(x);", ans: "7" },
  types1: { q: "Which Dart type holds text like 'hello'?", choices: ["String", "str", "text", "chars"] },
  types2: { q: "Which Dart type holds the whole number 42?", choices: ["int", "Int", "number", "digit"] },
  boolQ: { q: "Which are Dart's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: "What does 'Da' + 'rt' give you?", choices: ["'Dart'", "'Da rt'", "An error", "'Da+rt'"] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: "___ (x > 5) {\n  print('big');\n}", choices: ["if", "when", "check"] },
  ifQ: { code: "var x = 3;\nif (x > 5) {\n  print('big');\n} else {\n  print('small');\n}", out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for (var i = 0; i < 3; i++) {\n  print(i);\n}", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (var i = 0; i ___ 3; i++)", choices: ["<", ">", "=="] },
  funcQ: { q: "What does return do in a Dart function?", choices: ["Sends a value back and ends the function", "Prints a value", "Restarts the app", "Imports a package"] },
  funcOut: { code: "int twice(int n) {\n  return n * 2;\n}\nprint(twice(5));", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b", ";"],
};

SPEC.bash = {
  printLine: 'echo "Hello!"',
  wrongPrints: ['print("Hello!")', 'console.log("Hello!")', 'System.out.println("Hello!");'],
  printNum: { code: "echo $((2 + 3))", out: "5", wrong: ["$((2 + 3))", "2 + 3", "Error"] },
  printTokens: ["echo", '"Hi"'],
  printFill: { code: '___ "Good morning"', choices: ["echo", "print", "puts"] },
  hello: { code: 'echo "Hello, World!"', ans: "Hello, World!" },
  commentChar: "#", commentWrong: ["//", "<!--"],
  styleQ: { q: "When assigning a Bash variable, spaces around = are…",
    choices: ["Not allowed — write x=5, not x = 5", "Required", "Optional", "Encouraged for style"] },
  useQ: { choices: ["Automating tasks in the terminal", "Styling web pages", "Mobile apps", "3D graphics"] },
  decl: { line: "x=5", wrong: ["x = 5", "let x := 5", "int x=5"] },
  declTokens: null,
  declFill: { code: 'echo "Age: ___age"', choices: ["$", "#", "&"] },
  varPrint: { code: "x=7\necho $x", ans: "7" },
  types1: { q: "By default, Bash treats every variable as…", choices: ["Text (a string)", "A number", "A boolean", "An object"] },
  types2: { q: "How do you do arithmetic in Bash?", choices: ["$(( 2 + 3 ))", "2 + 3", "math 2 + 3", "calc(2+3)"] },
  boolQ: { q: "In Bash, an exit status of 0 means the command…", choices: ["Succeeded", "Failed", "Printed nothing", "Was skipped"] },
  concat: { q: "What does this print?", code: 'a="Ba"\nb="sh"\necho "$a$b"', choices: ["Bash", "Ba sh", "$a$b", "Error"] },
  eqQ: { q: "Which compares two NUMBERS in a Bash test like [ ]?", choices: ["-eq", "==", "=", "equals"] },
  ifFill: { code: '___ [ $x -gt 5 ]; then\n  echo "big"\nfi', choices: ["if", "when", "test"] },
  ifQ: { code: 'x=3\nif [ $x -gt 5 ]; then\n  echo "big"\nelse\n  echo "small"\nfi', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i in 1 2 3; do\n  echo $i\ndone", out: "1 2 3", wrong: ["0 1 2", "1 2", "3"] },
  loopFill: { code: "for i in 1 2 3; ___\n  echo $i\ndone", choices: ["do", "then", "start"] },
  funcQ: { q: "How do you END an if block in Bash?", choices: ["fi", "end", "}", "endif"] },
  funcOut: { code: 'greet() {\n  echo "Hi there"\n}\ngreet', out: "Hi there", wrong: ["greet", "Error", "Nothing"] },
  returnTokens: null,
  nameQ: ["my_score", "2cool", "my-score", "my score"],
};

SPEC.lua = {
  printLine: 'print("Hello!")',
  wrongPrints: ['echo "Hello!"', 'console.log("Hello!")', 'puts "Hello!"'],
  printNum: { code: "print(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["print", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["print", "echo", "console.log"] },
  hello: { code: 'print("Hello, World!")', ans: "Hello, World!" },
  commentChar: "--", commentWrong: ["//", "#"],
  styleQ: { q: "How does Lua close an if block?", choices: ["end", "}", "fi", "done"] },
  useQ: { choices: ["Scripting games — Roblox, WoW addons & more", "Styling web pages", "Databases", "Spreadsheets"] },
  decl: { line: "local x = 5", wrong: ["let x = 5", "int x = 5;", "var x = 5"] },
  declTokens: ["local", "age", "=", "13"],
  declFill: { code: '___ name = "Ada"', choices: ["local", "let", "var"] },
  varPrint: { code: "local x = 7\nprint(x)", ans: "7" },
  types1: { q: 'What type is "hello" in Lua?', choices: ["string", "str", "text", "chars"] },
  types2: { q: "What type is 42 in Lua?", choices: ["number", "int", "float", "digit"] },
  boolQ: { q: "Which are Lua's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: "Lua joins strings with which operator?", choices: ["..", "+", "&", "++"] },
  eqQ: { q: "Which operator checks equality in Lua? (~= means NOT equal)", choices: ["==", "=", "~=", "eq"] },
  ifFill: { code: '___ x > 5 then\n  print("big")\nend', choices: ["if", "when", "case"] },
  ifQ: { code: 'local x = 3\nif x > 5 then\n  print("big")\nelse\n  print("small")\nend', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i = 1, 3 do\n  print(i)\nend", out: "1 2 3", wrong: ["0 1 2", "1 2", "3"] },
  loopFill: { code: "for i = 1, 3 ___\n  print(i)\nend", choices: ["do", "then", "begin"] },
  funcQ: { choices: ["function", "def", "fn", "func"] },
  funcOut: { code: "function double(n)\n  return n * 2\nend\nprint(double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b"],
};

SPEC.r = {
  printLine: 'cat("Hello!")',
  wrongPrints: ['echo "Hello!"', 'console.log("Hello!")', 'System.out.println("Hello!");'],
  printNum: { code: "cat(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["cat", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["cat", "echo", "say"] },
  hello: { code: 'cat("Hello, World!")', ans: "Hello, World!" },
  commentChar: "#", commentWrong: ["//", "<!--"],
  styleQ: { q: "Which is the classic assignment operator in R?", choices: ["<-", "->>", "=>", ":="] },
  useQ: { choices: ["Statistics and data analysis", "Styling web pages", "Mobile games", "Operating systems"] },
  decl: { line: "x <- 5", wrong: ["let x = 5", "int x = 5;", "x := 5"] },
  declTokens: ["age", "<-", "13"],
  declFill: { code: 'name ___ "Ada"', choices: ["<-", "=>", "->>"] },
  varPrint: { code: "x <- 7\ncat(x)", ans: "7" },
  types1: { q: 'What does class("hello") return in R?', choices: ['"character"', '"string"', '"text"', '"char"'] },
  types2: { q: "What does class(42) return in R?", choices: ['"numeric"', '"int"', '"number"', '"digit"'] },
  boolQ: { q: "R's boolean values are written…", choices: ["TRUE and FALSE", "true and false", "T only", "Yes and No"] },
  concat: { q: "Which function joins strings in R?", choices: ["paste()", "concat()", "join()", "+"] },
  eqQ: { choices: ["==", "=", "<-", "eq"] },
  ifFill: { code: '___ (x > 5) {\n  cat("big")\n}', choices: ["if", "when", "test"] },
  ifQ: { code: 'x <- 3\nif (x > 5) {\n  cat("big")\n} else {\n  cat("small")\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: 'for (i in 1:3) {\n  cat(i, "")\n}', out: "1 2 3", wrong: ["0 1 2", "1 2", "3"] },
  loopFill: { code: "for (i ___ 1:3)", choices: ["in", "of", "from"] },
  funcQ: { q: "How do you create a function in R?",
    choices: ["double <- function(n) { n * 2 }", "def double(n):", "function double(n) {}", "fn double(n)"] },
  funcOut: { code: "double <- function(n) {\n  n * 2\n}\ncat(double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: null,
};

SPEC.perl = {
  printLine: 'print "Hello!";',
  wrongPrints: ['console.log("Hello!");', 'echo "Hello!"', 'System.out.println("Hello!");'],
  printNum: { code: "print 2 + 3;", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["print", '"Hi"', ";"],
  printFill: { code: '___ "Good morning";', choices: ["print", "echo", "puts"] },
  hello: { code: 'print "Hello, World!";', ans: "Hello, World!" },
  commentChar: "#", commentWrong: ["//", "<!--"],
  styleQ: { q: "Perl scalar variables (single values) start with…", choices: ["$", "@", "%", "&"] },
  useQ: { choices: ["Text processing and classic sysadmin scripts", "Styling web pages", "Phone apps", "3D games"] },
  decl: { line: "my $x = 5;", wrong: ["x = 5", "let x = 5;", "int x = 5;"] },
  declTokens: ["my", "$age", "=", "13", ";"],
  declFill: { code: '___ $name = "Ada";', choices: ["my", "let", "var"] },
  varPrint: { code: "my $x = 7;\nprint $x;", ans: "7" },
  types1: { q: "A single value in Perl ($name) is called a…", choices: ["scalar", "string", "cell", "unit"] },
  types2: { q: "An @items variable in Perl is a…", choices: ["array", "scalar", "hash", "set"] },
  boolQ: { q: "Which value counts as FALSE in Perl?", choices: ["0", "1", '"yes"', "any text"] },
  concat: { q: "Perl joins strings with which operator?", choices: [".", "+", "&", "++"] },
  eqQ: { q: "Which compares two NUMBERS in Perl? (eq is for strings)", choices: ["==", "eq", "=", "is"] },
  ifFill: { code: '___ ($x > 5) {\n    print "big";\n}', choices: ["if", "when", "test"] },
  ifQ: { code: 'my $x = 3;\nif ($x > 5) {\n    print "big";\n} else {\n    print "small";\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: 'for my $i (1..3) {\n    print "$i ";\n}', out: "1 2 3", wrong: ["0 1 2", "1 2", "3"] },
  loopFill: { code: "for my $i (1___3)", choices: ["..", "to", "->"] },
  funcQ: { choices: ["sub", "function", "def", "fn"] },
  funcOut: { code: "sub double {\n    my ($n) = @_;\n    return $n * 2;\n}\nprint double(5);", out: "10", wrong: ["5", "$n * 2", "Error"] },
  returnTokens: ["return", "$a", "+", "$b", ";"],
  nameQ: ["$score", "score!", "2cool", "my-score"],
};

/* =====================================================================
 * Extended specs — math, comparisons, while loops & collections
 * =================================================================== */
const wrongsMod = ["3", "0", "2"];
const wrongsTrue = ["false", "1", "True"];
const neqStd = { choices: ["!=", "=/=", "<>", "~="] };
const incPP = { q: "What does x++ do?", choices: ["Adds 1 to x", "Doubles x", "Compares x to 1", "Deletes x"] };

const EXT = {};

EXT.python = {
  incQ: { q: "What does x += 3 do?", choices: ["Adds 3 to x", "Compares x to 3", "Sets x to 3 forever", "Deletes x"] },
  mul: { code: "print(4 * 5)", ans: "20" },
  mod: { code: "print(7 % 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "print(7 > 3)", out: "True", wrong: ["true", "1", "False"] },
  neq: neqStd,
  whileQ: { code: "i = 0\nwhile i < 2:\n    print(i)\n    i += 1", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for i in range(4):\n    print("hi")', ans: "4" },
  listLit: { line: "nums = [1, 2, 3]", wrong: ["nums = (1; 2; 3)", "array nums = 1, 2, 3", "nums = <1, 2, 3>"] },
  idxStart: "0",
  listIdx: { code: 'pets = ["cat", "dog"]\nprint(pets[0])', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "print(len([1, 2, 3]))", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: 'Which adds "kiwi" to the END of a Python list?', choices: ['fruits.append("kiwi")', 'fruits.push("kiwi")', 'fruits.add("kiwi")', 'fruits.insert("kiwi")'] },
  listGet: { code: 'letters = ["a", "b", "c"]\nprint(letters[1])', ans: "b" },
};

EXT.typescript = {
  incQ: incPP,
  mul: { code: "console.log(4 * 5);", ans: "20" },
  mod: { code: "console.log(7 % 2);", out: "1", wrong: wrongsMod },
  cmp: { code: "console.log(7 > 3);", out: "true", wrong: ["false", "1", "True"] },
  neq: { q: "Which means NOT equal (value and type)?", choices: ["!==", "=/=", "<>", "~="] },
  whileQ: { code: "let i = 0;\nwhile (i < 2) {\n  console.log(i);\n  i++;\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (let i = 0; i < 4; i++) {\n  console.log("hi");\n}', ans: "4" },
  listLit: { line: "let nums: number[] = [1, 2, 3];", wrong: ["let nums = (1, 2, 3);", "array nums = 1, 2, 3;", "let nums = <1, 2, 3>;"] },
  idxStart: "0",
  listIdx: { code: 'const pets = ["cat", "dog"];\nconsole.log(pets[0]);', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "console.log([1, 2, 3].length);", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: 'Which adds "kiwi" to the END of an array?', choices: ['fruits.push("kiwi");', 'fruits.append("kiwi");', 'fruits.add("kiwi");', 'push(fruits, "kiwi");'] },
  listGet: { code: 'const letters = ["a", "b", "c"];\nconsole.log(letters[1]);', ans: "b" },
};

EXT.java = {
  incQ: incPP,
  mul: { code: "System.out.println(4 * 5);", ans: "20" },
  mod: { code: "System.out.println(7 % 2);", out: "1", wrong: wrongsMod },
  cmp: { code: "System.out.println(7 > 3);", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "int i = 0;\nwhile (i < 2) {\n    System.out.println(i);\n    i++;\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (int i = 0; i < 4; i++) {\n    System.out.println("hi");\n}', ans: "4" },
  listLit: { line: "int[] nums = {1, 2, 3};", wrong: ["int nums = [1, 2, 3];", "array nums = (1, 2, 3);", "nums := {1, 2, 3}"] },
  idxStart: "0",
  listIdx: { code: 'String[] pets = {"cat", "dog"};\nSystem.out.println(pets[0]);', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "int[] n = {1, 2, 3};\nSystem.out.println(n.length);", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which Java collection GROWS as you add items?", choices: ["ArrayList", "int[]", "String", "enum"] },
  listGet: { code: 'String[] l = {"a", "b", "c"};\nSystem.out.println(l[1]);', ans: "b" },
};

EXT.csharp = {
  incQ: incPP,
  mul: { code: "Console.WriteLine(4 * 5);", ans: "20" },
  mod: { code: "Console.WriteLine(7 % 2);", out: "1", wrong: wrongsMod },
  cmp: { code: "Console.WriteLine(7 > 3);", out: "True", wrong: ["true", "1", "False"] },
  neq: neqStd,
  whileQ: { code: "int i = 0;\nwhile (i < 2) {\n    Console.WriteLine(i);\n    i++;\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (int i = 0; i < 4; i++) {\n    Console.WriteLine("hi");\n}', ans: "4" },
  listLit: { line: "int[] nums = {1, 2, 3};", wrong: ["int nums = [1, 2, 3];", "array nums = (1, 2, 3);", "nums := {1, 2, 3}"] },
  idxStart: "0",
  listIdx: { code: 'string[] pets = {"cat", "dog"};\nConsole.WriteLine(pets[0]);', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "int[] n = {1, 2, 3};\nConsole.WriteLine(n.Length);", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which C# collection grows as you add items?", choices: ["List<int>", "int[]", "struct", "enum"] },
  listGet: { code: 'string[] l = {"a", "b", "c"};\nConsole.WriteLine(l[1]);', ans: "b" },
};

EXT.cpp = {
  incQ: incPP,
  mul: { code: "std::cout << 4 * 5;", ans: "20" },
  mod: { code: "std::cout << 7 % 2;", out: "1", wrong: wrongsMod },
  cmp: { code: "std::cout << (7 > 3);", out: "1", wrong: ["true", "0", "7"] },
  neq: neqStd,
  whileQ: { code: 'int i = 0;\nwhile (i < 2) {\n    std::cout << i << " ";\n    i++;\n}', out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (int i = 0; i < 4; i++) {\n    std::cout << "hi";\n}', ans: "4" },
  listLit: { line: "std::vector<int> nums = {1, 2, 3};", wrong: ["vector nums = [1, 2, 3];", "int nums = {1, 2, 3};", "array<int> nums(1, 2, 3);"] },
  idxStart: "0",
  listIdx: { code: 'std::vector<std::string> pets = {"cat", "dog"};\nstd::cout << pets[0];', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "std::vector<int> n = {1, 2, 3};\nstd::cout << n.size();", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 4 to the end of a std::vector?", choices: ["nums.push_back(4);", "nums.push(4);", "nums.add(4);", "nums.append(4);"] },
  listGet: { code: 'std::vector<std::string> l = {"a", "b", "c"};\nstd::cout << l[1];', ans: "b" },
};

EXT.c = {
  incQ: incPP,
  mul: { code: 'printf("%d", 4 * 5);', ans: "20" },
  mod: { code: 'printf("%d", 7 % 2);', out: "1", wrong: wrongsMod },
  cmp: { code: 'printf("%d", 7 > 3);', out: "1", wrong: ["true", "0", "73"] },
  neq: neqStd,
  whileQ: { code: 'int i = 0;\nwhile (i < 2) {\n    printf("%d ", i);\n    i++;\n}', out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (int i = 0; i < 4; i++) {\n    printf("hi");\n}', ans: "4" },
  listLit: { line: "int nums[] = {1, 2, 3};", wrong: ["int nums = [1, 2, 3];", "array nums = (1, 2, 3);", "list nums = {1, 2, 3};"] },
  idxStart: "0",
  listIdx: { code: 'int nums[] = {10, 20};\nprintf("%d", nums[0]);', out: "10", wrong: ["20", "0", "Error"] },
  listLen: { code: 'int n[] = {1, 2, 3};\nprintf("%zu", sizeof(n) / sizeof(n[0]));', out: "3", wrong: ["12", "1", "Error"] },
  listAdd: { q: "Can a plain C array change its size after creation?", choices: ["No — its size is fixed", "Yes, with nums.push()", "Yes, it grows automatically", "Yes, with nums.add()"] },
  listGet: { code: 'int l[] = {5, 6, 7};\nprintf("%d", l[1]);', ans: "6" },
};

EXT.go = {
  incQ: incPP,
  mul: { code: "fmt.Println(4 * 5)", ans: "20" },
  mod: { code: "fmt.Println(7 % 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "fmt.Println(7 > 3)", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "i := 0\nfor i < 2 {\n    fmt.Println(i)\n    i++\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for i := 0; i < 4; i++ {\n    fmt.Println("hi")\n}', ans: "4" },
  listLit: { line: "nums := []int{1, 2, 3}", wrong: ["nums := [1, 2, 3]", "int nums = {1, 2, 3};", "nums := list(1, 2, 3)"] },
  idxStart: "0",
  listIdx: { code: 'pets := []string{"cat", "dog"}\nfmt.Println(pets[0])', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "fmt.Println(len([]int{1, 2, 3}))", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 4 to the end of a Go slice?", choices: ["nums = append(nums, 4)", "nums.push(4)", "nums.add(4)", "append nums 4"] },
  listGet: { code: 'letters := []string{"a", "b", "c"}\nfmt.Println(letters[1])', ans: "b" },
};

EXT.rust = {
  incQ: { q: "What does x += 1 do in Rust?", choices: ["Adds 1 to x (x must be mut)", "Compares x to 1", "Makes x immutable", "Deletes x"] },
  mul: { code: 'println!("{}", 4 * 5);', ans: "20" },
  mod: { code: 'println!("{}", 7 % 2);', out: "1", wrong: wrongsMod },
  cmp: { code: 'println!("{}", 7 > 3);', out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: 'let mut i = 0;\nwhile i < 2 {\n    println!("{}", i);\n    i += 1;\n}', out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for _ in 0..4 {\n    println!("hi");\n}', ans: "4" },
  listLit: { line: "let nums = vec![1, 2, 3];", wrong: ["let nums = [1; 2; 3];", "vector nums = (1, 2, 3);", "let nums = list!(1, 2, 3);"] },
  idxStart: "0",
  listIdx: { code: 'let pets = vec!["cat", "dog"];\nprintln!("{}", pets[0]);', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: 'println!("{}", vec![1, 2, 3].len());', out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 4 to the end of a Vec?", choices: ["nums.push(4);", "nums.append(4);", "nums.add(4);", "push!(nums, 4);"] },
  listGet: { code: 'let l = vec!["a", "b", "c"];\nprintln!("{}", l[1]);', ans: "b" },
};

EXT.php = {
  incQ: { q: "What does $x++ do?", choices: ["Adds 1 to $x", "Doubles $x", "Compares $x to 1", "Deletes $x"] },
  mul: { code: "echo 4 * 5;", ans: "20" },
  mod: { code: "echo 7 % 2;", out: "1", wrong: wrongsMod },
  cmp: { code: "echo 7 > 3;", out: "1 (true prints as 1)", wrong: ["true", "7", "Error"] },
  neq: neqStd,
  whileQ: { code: '$i = 0;\nwhile ($i < 2) {\n    echo $i . " ";\n    $i++;\n}', out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for ($i = 0; $i < 4; $i++) {\n    echo "hi";\n}', ans: "4" },
  listLit: { line: "$nums = [1, 2, 3];", wrong: ["nums = [1, 2, 3]", "$nums = (1, 2, 3);", "array $nums = 1, 2, 3;"] },
  idxStart: "0",
  listIdx: { code: '$pets = ["cat", "dog"];\necho $pets[0];', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "echo count([1, 2, 3]);", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: 'Which adds "kiwi" to the END of a PHP array?', choices: ['$fruits[] = "kiwi";', '$fruits.push("kiwi");', 'add($fruits, "kiwi");', '$fruits->append("kiwi");'] },
  listGet: { code: '$l = ["a", "b", "c"];\necho $l[1];', ans: "b" },
};

EXT.ruby = {
  incQ: { q: "How do you add 1 to x in Ruby? (there is no x++)", choices: ["x += 1", "x++", "inc x", "x.add(1)"] },
  mul: { code: "puts 4 * 5", ans: "20" },
  mod: { code: "puts 7 % 2", out: "1", wrong: wrongsMod },
  cmp: { code: "puts 7 > 3", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "i = 0\nwhile i < 2\n  puts i\n  i += 1\nend", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: '4.times do\n  puts "hi"\nend', ans: "4" },
  listLit: { line: "nums = [1, 2, 3]", wrong: ["nums = (1, 2, 3)", "array nums = 1, 2, 3", "nums = {1, 2, 3}"] },
  idxStart: "0",
  listIdx: { code: 'pets = ["cat", "dog"]\nputs pets[0]', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "puts [1, 2, 3].length", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: 'Which adds "kiwi" to the END of a Ruby array?', choices: ['fruits << "kiwi"', 'fruits.push! "kiwi"', 'add(fruits, "kiwi")', 'fruits =+ "kiwi"'] },
  listGet: { code: 'l = ["a", "b", "c"]\nputs l[1]', ans: "b" },
};

EXT.swift = {
  incQ: { q: "How do you add 1 to x in Swift? (x++ was removed!)", choices: ["x += 1", "x++", "inc(x)", "x.add(1)"] },
  mul: { code: "print(4 * 5)", ans: "20" },
  mod: { code: "print(7 % 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "print(7 > 3)", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "var i = 0\nwhile i < 2 {\n    print(i)\n    i += 1\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for _ in 0..<4 {\n    print("hi")\n}', ans: "4" },
  listLit: { line: "var nums = [1, 2, 3]", wrong: ["var nums = (1, 2, 3)", "array nums = {1, 2, 3}", "var nums = <1, 2, 3>"] },
  idxStart: "0",
  listIdx: { code: 'let pets = ["cat", "dog"]\nprint(pets[0])', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "print([1, 2, 3].count)", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: 'Which adds "kiwi" to the END of a Swift array?', choices: ['fruits.append("kiwi")', 'fruits.push("kiwi")', 'fruits.add("kiwi")', 'fruits << "kiwi"'] },
  listGet: { code: 'let l = ["a", "b", "c"]\nprint(l[1])', ans: "b" },
};

EXT.kotlin = {
  incQ: incPP,
  mul: { code: "println(4 * 5)", ans: "20" },
  mod: { code: "println(7 % 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "println(7 > 3)", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "var i = 0\nwhile (i < 2) {\n    println(i)\n    i++\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'repeat(4) {\n    println("hi")\n}', ans: "4" },
  listLit: { line: "val nums = listOf(1, 2, 3)", wrong: ["val nums = [1, 2, 3]", "list nums = (1, 2, 3)", "val nums = array(1; 2; 3)"] },
  idxStart: "0",
  listIdx: { code: 'val pets = listOf("cat", "dog")\nprintln(pets[0])', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "println(listOf(1, 2, 3).size)", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which Kotlin list lets you ADD items after creation?", choices: ["mutableListOf(...)", "listOf(...)", "setOf(...)", "fixedListOf(...)"] },
  listGet: { code: 'val l = listOf("a", "b", "c")\nprintln(l[1])', ans: "b" },
};

EXT.dart = {
  incQ: incPP,
  mul: { code: "print(4 * 5);", ans: "20" },
  mod: { code: "print(7 % 2);", out: "1", wrong: wrongsMod },
  cmp: { code: "print(7 > 3);", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "var i = 0;\nwhile (i < 2) {\n  print(i);\n  i++;\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: "for (var i = 0; i < 4; i++) {\n  print('hi');\n}", ans: "4" },
  listLit: { line: "var nums = [1, 2, 3];", wrong: ["var nums = (1, 2, 3);", "array nums = {1, 2, 3};", "var nums = <1; 2; 3>;"] },
  idxStart: "0",
  listIdx: { code: "var pets = ['cat', 'dog'];\nprint(pets[0]);", out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "print([1, 2, 3].length);", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 'kiwi' to the END of a Dart list?", choices: ["fruits.add('kiwi');", "fruits.push('kiwi');", "fruits.append('kiwi');", "fruits << 'kiwi';"] },
  listGet: { code: "var l = ['a', 'b', 'c'];\nprint(l[1]);", ans: "b" },
};

EXT.bash = {
  incQ: { q: "Which adds 1 to x in Bash?", choices: ["x=$((x + 1))", "x++ anywhere", "x += 1", "inc x"] },
  mul: { code: "echo $((4 * 5))", ans: "20" },
  mod: { code: "echo $((7 % 2))", out: "1", wrong: wrongsMod },
  cmp: { code: 'if [ 7 -gt 3 ]; then\n  echo "yes"\nfi', out: "yes", wrong: ["no", "7", "Nothing"] },
  neq: { q: "Which means NOT equal for numbers in a Bash test?", choices: ["-ne", "!=", "=/=", "<>"] },
  whileQ: { code: "i=0\nwhile [ $i -lt 2 ]; do\n  echo $i\n  i=$((i + 1))\ndone", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for i in 1 2 3 4; do\n  echo "hi"\ndone', ans: "4" },
  listLit: { line: "nums=(1 2 3)", wrong: ["nums=[1, 2, 3]", "nums={1, 2, 3}", "array nums = 1 2 3"] },
  idxStart: "0",
  listIdx: { code: 'pets=("cat" "dog")\necho ${pets[0]}', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "nums=(1 2 3)\necho ${#nums[@]}", out: "3", wrong: ["2", "1 2 3", "Error"] },
  listAdd: { q: "Which adds 4 to the end of a Bash array?", choices: ["nums+=(4)", "nums.push(4)", "nums << 4", "add nums 4"] },
  listGet: { code: 'l=("a" "b" "c")\necho ${l[1]}', ans: "b" },
};

EXT.lua = {
  incQ: { q: "How do you add 1 to x in Lua? (there is no x++)", choices: ["x = x + 1", "x++", "x += 1", "inc(x)"] },
  mul: { code: "print(4 * 5)", ans: "20" },
  mod: { code: "print(7 % 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "print(7 > 3)", out: "true", wrong: ["false", "1", "True"] },
  neq: { q: "Which means NOT equal in Lua?", choices: ["~=", "!=", "<>", "=/="] },
  whileQ: { code: "local i = 0\nwhile i < 2 do\n  print(i)\n  i = i + 1\nend", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for i = 1, 4 do\n  print("hi")\nend', ans: "4" },
  listLit: { line: "local nums = {1, 2, 3}", wrong: ["local nums = [1, 2, 3]", "nums = (1, 2, 3)", "array nums = 1, 2, 3"] },
  idxStart: "1",
  listIdx: { code: 'local pets = {"cat", "dog"}\nprint(pets[1])', out: "cat", wrong: ["dog", "nil", "Error"] },
  listLen: { code: "local nums = {1, 2, 3}\nprint(#nums)", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 4 to the end of a Lua table?", choices: ["table.insert(nums, 4)", "nums.push(4)", "nums:add(4)", "nums += 4"] },
  listGet: { code: 'local l = {"a", "b", "c"}\nprint(l[2])', ans: "b" },
};

EXT.r = {
  incQ: { q: "How do you add 1 to x in R?", choices: ["x <- x + 1", "x++", "x += 1", "inc(x)"] },
  mul: { code: "cat(4 * 5)", ans: "20" },
  mod: { code: "cat(7 %% 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "cat(7 > 3)", out: "TRUE", wrong: ["true", "1", "FALSE"] },
  neq: neqStd,
  whileQ: { code: 'i <- 0\nwhile (i < 2) {\n  cat(i, "")\n  i <- i + 1\n}', out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (i in 1:4) {\n  cat("hi ")\n}', ans: "4" },
  listLit: { line: "nums <- c(1, 2, 3)", wrong: ["nums <- [1, 2, 3]", "nums <- list[1, 2, 3]", "vector nums = 1, 2, 3"] },
  idxStart: "1",
  listIdx: { code: 'pets <- c("cat", "dog")\ncat(pets[1])', out: "cat", wrong: ["dog", "NA", "Error"] },
  listLen: { code: "cat(length(c(1, 2, 3)))", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 4 to the end of an R vector?", choices: ["nums <- c(nums, 4)", "nums.push(4)", "append nums 4", "nums += 4"] },
  listGet: { code: 'l <- c("a", "b", "c")\ncat(l[2])', ans: "b" },
};

EXT.perl = {
  incQ: { q: "What does $x++ do?", choices: ["Adds 1 to $x", "Doubles $x", "Compares $x to 1", "Deletes $x"] },
  mul: { code: "print 4 * 5;", ans: "20" },
  mod: { code: "print 7 % 2;", out: "1", wrong: wrongsMod },
  cmp: { code: "print 7 > 3;", out: "1 (true prints as 1)", wrong: ["true", "0", "Nothing"] },
  neq: { q: "Which means NOT equal for NUMBERS in Perl?", choices: ["!=", "ne", "=/=", "<>"] },
  whileQ: { code: 'my $i = 0;\nwhile ($i < 2) {\n    print "$i ";\n    $i++;\n}', out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for my $i (1..4) {\n    print "hi ";\n}', ans: "4" },
  listLit: { line: "my @nums = (1, 2, 3);", wrong: ["my nums = [1, 2, 3];", "array @nums = 1, 2, 3;", "my @nums = {1; 2; 3};"] },
  idxStart: "0",
  listIdx: { code: 'my @pets = ("cat", "dog");\nprint $pets[0];', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "my @n = (1, 2, 3);\nprint scalar @n;", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: 'Which adds "kiwi" to the END of a Perl array?', choices: ['push @fruits, "kiwi";', '@fruits.push("kiwi");', 'add(@fruits, "kiwi");', '@fruits << "kiwi";'] },
  listGet: { code: 'my @l = ("a", "b", "c");\nprint $l[1];', ans: "b" },
};

/* ===== Batch 2 languages ===== */

SPEC.scala = {
  printLine: 'println("Hello!")',
  wrongPrints: ['print!("Hello!")', 'echo "Hello!"', 'console.log("Hello!")'],
  printNum: { code: "println(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["println", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["println", "echo", "print!"] },
  hello: { code: 'println("Hello, World!")', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "In Scala, val creates a … and var creates a …",
    choices: ["immutable value / changeable variable", "variable / constant", "function / class", "loop / range"] },
  useQ: { choices: ["Big data (Apache Spark) and JVM backends", "Styling web pages", "Phone ringtones", "Spreadsheets"] },
  decl: { line: "var x = 5", wrong: ["x := 5", "int x = 5;", "dim x = 5"] },
  declTokens: ["var", "age", "=", "13"],
  declFill: { code: '___ birthday = "June"  // never changes', choices: ["val", "var", "let"] },
  varPrint: { code: "var x = 7\nprintln(x)", ans: "7" },
  types1: { q: 'Which Scala type holds text like "hello"?', choices: ["String", "str", "text", "chars"] },
  types2: { q: "Which Scala type holds the whole number 42?", choices: ["Int", "int", "number", "digit"] },
  boolQ: { q: "Which are Scala's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: 'What does "Sca" + "la" give you?', choices: ['"Scala"', '"Sca la"', "An error", '"Sca+la"'] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ (x > 5) println("big")', choices: ["if", "when", "case"] },
  ifQ: { code: 'val x = 3\nif (x > 5) println("big") else println("small")', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for (i <- 0 until 3) println(i)", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (i ___ 0 until 3) println(i)", choices: ["<-", "in", "=>"] },
  funcQ: { choices: ["def", "function", "fn", "func"] },
  funcOut: { code: "def double(n: Int): Int = n * 2\nprintln(double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b"],
};
EXT.scala = {
  incQ: { q: "How do you add 1 to x in Scala? (there is no x++)", choices: ["x += 1", "x++", "inc(x)", "x.add(1)"] },
  mul: { code: "println(4 * 5)", ans: "20" },
  mod: { code: "println(7 % 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "println(7 > 3)", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "var i = 0\nwhile (i < 2) {\n  println(i)\n  i += 1\n}", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (i <- 1 to 4) println("hi")', ans: "4" },
  listLit: { line: "val nums = List(1, 2, 3)", wrong: ["val nums = [1, 2, 3]", "list nums = (1, 2, 3)", "val nums = array(1; 2; 3)"] },
  idxStart: "0",
  listIdx: { code: 'val pets = List("cat", "dog")\nprintln(pets(0))', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "println(List(1, 2, 3).length)", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 4 to the END of a Scala List?", choices: ["nums :+ 4", "nums.push(4)", "nums.add(4)", "nums << 4"] },
  listGet: { code: 'val l = List("a", "b", "c")\nprintln(l(1))', ans: "b" },
};

SPEC.haskell = {
  printLine: 'putStrLn "Hello!"',
  wrongPrints: ['print("Hello!")', 'echo "Hello!"', 'console.log("Hello!")'],
  printNum: { code: "print (2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["putStrLn", '"Hi"'],
  printFill: { code: '___ "Good morning"', choices: ["putStrLn", "echo", "println"] },
  hello: { code: 'putStrLn "Hello, World!"', ans: "Hello, World!" },
  commentChar: "--", commentWrong: ["//", "#"],
  styleQ: { q: "Haskell is famous for being a … language",
    choices: ["purely functional", "object-oriented", "assembly-level", "markup"] },
  useQ: { choices: ["Compilers, finance and rock-solid functional code", "Styling web pages", "Phone apps", "Game engines"] },
  decl: { line: "x = 5", wrong: ["let x := 5", "int x = 5;", "var x = 5"] },
  declTokens: ["age", "=", "13"],
  declFill: { code: 'name ___ "Ada"', choices: ["=", ":=", "<<"] },
  varPrint: { code: "x = 7\nmain = print x", ans: "7" },
  types1: { q: 'What type is "hello" in Haskell?', choices: ["String", "str", "text", "chars"] },
  types2: { q: "What type is 42 (a whole number)?", choices: ["Int", "number", "int32", "digit"] },
  boolQ: { q: "Haskell booleans are written…", choices: ["True and False", "true and false", "1 and 0", "YES and NO"] },
  concat: { q: "Which operator joins two strings in Haskell?", choices: ["++", "+", "&", ".."] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ x > 5 then "big" else "small"', choices: ["if", "when", "case"] },
  ifQ: { code: 'x = 3\nmain = putStrLn (if x > 5 then "big" else "small")', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "main = mapM_ print [0, 1, 2]", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "[0,1,2]"] },
  loopFill: { code: "main = mapM_ print [0___2]", choices: ["..", "...", "->"] },
  funcQ: { q: "How do you define a function double in Haskell?",
    choices: ["double n = n * 2", "def double(n):", "function double(n) {}", "fn double(n)"] },
  funcOut: { code: "double n = n * 2\nmain = print (double 5)", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: null,
};
EXT.haskell = {
  incQ: { q: "Haskell values are immutable. How do you get x + 1?",
    choices: ["Make a new value: y = x + 1", "x++", "x += 1", "mutate x"] },
  mul: { code: "print (4 * 5)", ans: "20" },
  mod: { code: "print (7 `mod` 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "print (7 > 3)", out: "True", wrong: ["true", "1", "False"] },
  neq: { q: "Which means NOT equal in Haskell?", choices: ["/=", "!=", "<>", "~="] },
  whileQ: { code: 'count 0 = putStrLn "done"\ncount n = do\n  print n\n  count (n - 1)\n\nmain = count 2', out: "2 1 done", wrong: ["1 2 done", "2 1 0", "done"] },
  loopCount: { code: 'main = mapM_ (\\_ -> putStrLn "hi") [1..4]', ans: "4" },
  listLit: { line: "nums = [1, 2, 3]", wrong: ["nums = (1, 2, 3)", "nums = {1, 2, 3}", "array nums = 1, 2, 3"] },
  idxStart: "0",
  listIdx: { code: 'pets = ["cat", "dog"]\nmain = putStrLn (pets !! 0)', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "main = print (length [1, 2, 3])", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which joins [4] onto the end of a Haskell list?", choices: ["nums ++ [4]", "nums.push(4)", "nums.add(4)", "nums << 4"] },
  listGet: { code: 'l = ["a", "b", "c"]\nmain = putStrLn (l !! 1)', ans: "b" },
};

SPEC.julia = {
  printLine: 'println("Hello!")',
  wrongPrints: ['echo "Hello!"', 'console.log("Hello!")', 'puts "Hello!"'],
  printNum: { code: "println(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["println", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["println", "echo", "disp"] },
  hello: { code: 'println("Hello, World!")', ans: "Hello, World!" },
  commentChar: "#", commentWrong: ["//", "<!--"],
  styleQ: { q: "How does Julia close an if block or a loop?", choices: ["end", "}", "fi", "done"] },
  useQ: { choices: ["Scientific computing and high-speed math", "Styling web pages", "Mobile apps", "Word processing"] },
  decl: { line: "x = 5", wrong: ["let x = 5;", "int x = 5;", "var x := 5"] },
  declTokens: ["age", "=", "13"],
  declFill: { code: 'name ___ "Ada"', choices: ["=", "<-", "=="] },
  varPrint: { code: "x = 7\nprintln(x)", ans: "7" },
  types1: { q: 'What type is "hello" in Julia?', choices: ["String", "str", "text", "chars"] },
  types2: { q: "What type is 42 in Julia?", choices: ["Int64", "int", "number", "digit"] },
  boolQ: { q: "Which are Julia's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: "Julia joins strings with which (surprising) operator?", choices: ["*", "+", "&", "++"] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ x > 5\n    println("big")\nend', choices: ["if", "when", "case"] },
  ifQ: { code: 'x = 3\nif x > 5\n    println("big")\nelse\n    println("small")\nend', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i in 0:2\n    println(i)\nend", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for i ___ 0:2", choices: ["in", "of", "from"] },
  funcQ: { choices: ["function", "def", "fn", "func"] },
  funcOut: { code: "function double(n)\n    n * 2\nend\nprintln(double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b"],
};
EXT.julia = {
  incQ: { q: "How do you add 1 to x in Julia?", choices: ["x += 1", "x++", "inc(x)", "x.add(1)"] },
  mul: { code: "println(4 * 5)", ans: "20" },
  mod: { code: "println(7 % 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "println(7 > 3)", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "i = 0\nwhile i < 2\n    println(i)\n    i += 1\nend", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for i in 1:4\n    println("hi")\nend', ans: "4" },
  listLit: { line: "nums = [1, 2, 3]", wrong: ["nums = (1; 2; 3)", "array nums = 1, 2, 3", "nums = <1, 2, 3>"] },
  idxStart: "1",
  listIdx: { code: 'pets = ["cat", "dog"]\nprintln(pets[1])', out: "cat", wrong: ["dog", "nothing", "Error"] },
  listLen: { code: "println(length([1, 2, 3]))", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which adds 4 to the end of a Julia array?", choices: ["push!(nums, 4)", "nums.push(4)", "nums.add(4)", "append nums 4"] },
  listGet: { code: 'l = ["a", "b", "c"]\nprintln(l[2])', ans: "b" },
};

SPEC.elixir = {
  printLine: 'IO.puts("Hello!")',
  wrongPrints: ['print("Hello!")', 'echo "Hello!"', 'console.log("Hello!")'],
  printNum: { code: "IO.puts(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["IO.puts", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["IO.puts", "echo", "console.log"] },
  hello: { code: 'IO.puts("Hello, World!")', ans: "Hello, World!" },
  commentChar: "#", commentWrong: ["//", "<!--"],
  styleQ: { q: "How does Elixir close an if block?", choices: ["end", "}", "fi", "done"] },
  useQ: { choices: ["Fault-tolerant servers and real-time apps (Phoenix)", "Styling web pages", "3D games", "Spreadsheets"] },
  decl: { line: "x = 5", wrong: ["let x = 5", "int x = 5;", "var x = 5"] },
  declTokens: ["age", "=", "13"],
  declFill: { code: 'name ___ "Ada"', choices: ["=", "<-", ":="] },
  varPrint: { code: "x = 7\nIO.puts(x)", ans: "7" },
  types1: { q: 'What type is "hello" in Elixir?', choices: ["String", "str", "text", "chars"] },
  types2: { q: "What type is 42 in Elixir?", choices: ["Integer", "int", "number", "digit"] },
  boolQ: { q: "Which are Elixir's boolean values?", choices: ["true and false", "True and False", "1 and 0 only", "YES and NO"] },
  concat: { q: "Elixir joins strings with which operator?", choices: ["<>", "+", "&", "++"] },
  eqQ: { choices: ["==", "=", "===", "eq"] },
  ifFill: { code: '___ x > 5 do\n  IO.puts("big")\nend', choices: ["if", "when", "cond"] },
  ifQ: { code: 'x = 3\nif x > 5 do\n  IO.puts("big")\nelse\n  IO.puts("small")\nend', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "Enum.each(0..2, fn i ->\n  IO.puts(i)\nend)", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "Enum.each(0___2, fn i -> IO.puts(i) end)", choices: ["..", "...", "to"] },
  funcQ: { q: "Which keyword defines a named function (inside a module)?", choices: ["def", "function", "fun", "func"] },
  funcOut: { code: "defmodule M do\n  def double(n), do: n * 2\nend\n\nIO.puts(M.double(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: null,
};
EXT.elixir = {
  incQ: { q: "Elixir data is immutable. How do you get x + 1?", choices: ["x = x + 1 (rebinds x)", "x++", "x += 1", "mutate(x)"] },
  mul: { code: "IO.puts(4 * 5)", ans: "20" },
  mod: { code: "IO.puts(rem(7, 2))", out: "1", wrong: wrongsMod },
  cmp: { code: "IO.puts(7 > 3)", out: "true", wrong: ["false", "1", "True"] },
  neq: neqStd,
  whileQ: { code: "Enum.each([0, 1], fn i ->\n  IO.puts(i)\nend)", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'Enum.each(1..4, fn _ ->\n  IO.puts("hi")\nend)', ans: "4" },
  listLit: { line: "nums = [1, 2, 3]", wrong: ["nums = (1, 2, 3)", "nums = {1, 2, 3} only", "array nums = 1, 2, 3"] },
  idxStart: "0",
  listIdx: { code: 'pets = ["cat", "dog"]\nIO.puts(Enum.at(pets, 0))', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "IO.puts(length([1, 2, 3]))", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which joins [4] onto the end of an Elixir list?", choices: ["nums ++ [4]", "nums.push(4)", "push!(nums, 4)", "nums << 4"] },
  listGet: { code: 'l = ["a", "b", "c"]\nIO.puts(Enum.at(l, 1))', ans: "b" },
};

SPEC.pascal = {
  printLine: "writeln('Hello!');",
  wrongPrints: ['print("Hello!")', 'echo "Hello!";', 'console.log("Hello!");'],
  printNum: { code: "writeln(2 + 3);", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["writeln", "(", "'Hi'", ")", ";"],
  printFill: { code: "___('Good morning');", choices: ["writeln", "print", "echo"] },
  hello: { code: "writeln('Hello, World!');", ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "Pascal ASSIGNS values with which operator?", choices: [":=", "=", "<-", "=="] },
  useQ: { choices: ["Learning to program, and Delphi desktop apps", "Styling web pages", "Phone apps", "Databases"] },
  decl: { line: "var x: Integer = 5;", wrong: ["x = 5;", "let x = 5;", "int x = 5;"] },
  declTokens: null,
  declFill: { code: "age ___ 13;", choices: [":=", "=", "<-"] },
  varPrint: { code: "x := 7;\nwriteln(x);", ans: "7" },
  types1: { q: "Which Pascal type holds text?", choices: ["String", "str", "text[]", "chars"] },
  types2: { q: "Which Pascal type holds the whole number 42?", choices: ["Integer", "int", "number", "digit"] },
  boolQ: { q: "Which are Pascal's boolean values?", choices: ["True and False", "true only", "1 and 0 only", "YES and NO"] },
  concat: { q: "Pascal joins strings with which operator?", choices: ["+", ".", "&", "++"] },
  eqQ: { q: "Which CHECKS equality in Pascal? (remember := assigns)", choices: ["=", "==", "===", "eq"] },
  ifFill: { code: "___ x > 5 then\n  writeln('big');", choices: ["if", "when", "case"] },
  ifQ: { code: "x := 3;\nif x > 5 then\n  writeln('big')\nelse\n  writeln('small');", out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i := 0 to 2 do\n  writeln(i);", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for i := 0 ___ 2 do", choices: ["to", "until", "upto"] },
  funcQ: { choices: ["function", "def", "func", "fn"] },
  funcOut: { code: "function Double(n: Integer): Integer;\nbegin\n  Double := n * 2;\nend;\n// later…\nwriteln(Double(5));", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: null,
};
EXT.pascal = {
  incQ: { q: "How do you add 1 to x in Pascal?", choices: ["x := x + 1  (or Inc(x))", "x++", "x =+ 1", "add x 1"] },
  mul: { code: "writeln(4 * 5);", ans: "20" },
  mod: { code: "writeln(7 mod 2);", out: "1", wrong: wrongsMod },
  cmp: { code: "writeln(7 > 3);", out: "TRUE", wrong: ["true", "1", "FALSE"] },
  neq: { q: "Which means NOT equal in Pascal?", choices: ["<>", "!=", "=/=", "~="] },
  whileQ: { code: "i := 0;\nwhile i < 2 do\nbegin\n  writeln(i);\n  i := i + 1;\nend;", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: "for i := 1 to 4 do\n  writeln('hi');", ans: "4" },
  listLit: { line: "nums: array[0..2] of Integer = (1, 2, 3);", wrong: ["nums = [1, 2, 3]", "array nums = {1, 2, 3}", "nums := list(1, 2, 3)"] },
  idxStart: "0",
  listIdx: { code: "nums[0] := 10;\nnums[1] := 20;\nwriteln(nums[0]);", out: "10", wrong: ["20", "0", "Error"] },
  listLen: { code: "// nums holds 3 items\nwriteln(Length(nums));", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Can a fixed array[0..2] grow in Pascal?", choices: ["No — use a dynamic array and SetLength", "Yes, with push", "Yes, automatically", "Yes, with nums.add"] },
  listGet: { code: "l: array[0..2] of String = ('a', 'b', 'c');\nwriteln(l[1]);", ans: "b" },
};

SPEC.matlab = {
  printLine: "disp('Hello!')",
  wrongPrints: ['print("Hello!")', 'echo "Hello!"', 'console.log("Hello!")'],
  printNum: { code: "disp(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["disp", "(", "'Hi'", ")"],
  printFill: { code: "___('Good morning')", choices: ["disp", "echo", "show"] },
  hello: { code: "disp('Hello, World!')", ans: "Hello, World!" },
  commentChar: "%", commentWrong: ["//", "#"],
  styleQ: { q: "How does MATLAB close an if block or a loop?", choices: ["end", "}", "fi", "done"] },
  useQ: { choices: ["Engineering math, signals and simulations", "Styling web pages", "Phone apps", "Websites"] },
  decl: { line: "x = 5;", wrong: ["let x = 5;", "int x = 5;", "var x := 5"] },
  declTokens: ["age", "=", "13", ";"],
  declFill: { code: "name ___ 'Ada';", choices: ["=", "<-", "=="] },
  varPrint: { code: "x = 7;\ndisp(x)", ans: "7" },
  types1: { q: "What does class('hello') return in MATLAB?", choices: ["'char'", "'string'", "'text'", "'str'"] },
  types2: { q: "What does class(42) return in MATLAB?", choices: ["'double'", "'int'", "'number'", "'integer'"] },
  boolQ: { q: "MATLAB displays logical true as…", choices: ["1", "true (the word) only", "TRUE", "yes"] },
  concat: { q: "Which joins two char arrays in MATLAB?", choices: ["['Mat' 'lab']", "'Mat' + 'lab' always", "'Mat' . 'lab'", "join only"] },
  eqQ: { choices: ["==", "=", "===", "eq only"] },
  ifFill: { code: "___ x > 5\n    disp('big')\nend", choices: ["if", "when", "case"] },
  ifQ: { code: "x = 3;\nif x > 5\n    disp('big')\nelse\n    disp('small')\nend", out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "for i = 0:2\n    disp(i)\nend", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for i = 0___2", choices: [":", "..", "to"] },
  funcQ: { choices: ["function", "def", "func", "fn"] },
  funcOut: { code: "function y = dbl(n)\n    y = n * 2;\nend\n% later…\ndisp(dbl(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: null,
};
EXT.matlab = {
  incQ: { q: "How do you add 1 to x in MATLAB? (no ++ or +=)", choices: ["x = x + 1", "x++", "x += 1", "inc(x)"] },
  mul: { code: "disp(4 * 5)", ans: "20" },
  mod: { code: "disp(mod(7, 2))", out: "1", wrong: wrongsMod },
  cmp: { code: "disp(7 > 3)", out: "1", wrong: ["true", "0", "TRUE"] },
  neq: { q: "Which means NOT equal in MATLAB?", choices: ["~=", "!=", "<>", "=/="] },
  whileQ: { code: "i = 0;\nwhile i < 2\n    disp(i)\n    i = i + 1;\nend", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: "for i = 1:4\n    disp('hi')\nend", ans: "4" },
  listLit: { line: "nums = [1 2 3]", wrong: ["nums = (1, 2, 3)", "array nums = 1 2 3", "nums = <1, 2, 3>"] },
  idxStart: "1",
  listIdx: { code: "pets = {'cat', 'dog'};\ndisp(pets{1})", out: "cat", wrong: ["dog", "[]", "Error"] },
  listLen: { code: "disp(length([1 2 3]))", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which appends 4 to a MATLAB vector?", choices: ["nums(end+1) = 4", "nums.push(4)", "nums.add(4)", "append nums 4"] },
  listGet: { code: "l = {'a', 'b', 'c'};\ndisp(l{2})", ans: "b" },
};

SPEC.objc = {
  printLine: 'NSLog(@"Hello!");',
  wrongPrints: ['print("Hello!")', 'echo "Hello!";', 'console.log("Hello!");'],
  printNum: { code: 'NSLog(@"%d", 2 + 3);', out: "5", wrong: ["%d", "2 + 3", "Error"] },
  printTokens: ["NSLog", "(", '@"Hi"', ")", ";"],
  printFill: { code: '___(@"Good morning");', choices: ["NSLog", "print", "echo"] },
  hello: { code: 'NSLog(@"Hello, World!");', ans: "Hello, World!" },
  commentChar: "//", commentWrong: ["#", "<!--"],
  styleQ: { q: "Objective-C string literals start with…", choices: ["@", "$", "#", "&"] },
  useQ: { choices: ["Classic iPhone/Mac apps (before Swift)", "Styling web pages", "Databases", "Spreadsheets"] },
  decl: { line: "int x = 5;", wrong: ["x = 5", "let x = 5;", "var x := 5"] },
  declTokens: ["int", "age", "=", "13", ";"],
  declFill: { code: "___ score = 10;", choices: ["int", "let", "var"] },
  varPrint: { code: 'int x = 7;\nNSLog(@"%d", x);', ans: "7" },
  types1: { q: 'Which type holds text like @"hello"?', choices: ["NSString", "str", "text", "string[]"] },
  types2: { q: "Which type holds the whole number 42?", choices: ["int", "number", "digit", "NSNumber only"] },
  boolQ: { q: "Objective-C booleans are traditionally written…", choices: ["YES and NO", "true and false only", "True and False", "1 and 0 only"] },
  concat: { q: "Which method joins two NSStrings?", choices: ["stringByAppendingString:", "+", "&", "concat:"] },
  eqQ: { q: "Which compares two ints for equality?", choices: ["==", "=", "===", "isEqual only"] },
  ifFill: { code: '___ (x > 5) {\n    NSLog(@"big");\n}', choices: ["if", "when", "check"] },
  ifQ: { code: 'int x = 3;\nif (x > 5) {\n    NSLog(@"big");\n} else {\n    NSLog(@"small");\n}', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: 'for (int i = 0; i < 3; i++) {\n    NSLog(@"%d", i);\n}', out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "for (int i = 0; i ___ 3; i++)", choices: ["<", ">", "=="] },
  funcQ: { q: "What does return do in an Objective-C method?",
    choices: ["Sends a value back and ends the method", "Prints a value", "Pauses the app", "Imports a framework"] },
  funcOut: { code: 'int doubleIt(int n) {\n    return n * 2;\n}\n// later…\nNSLog(@"%d", doubleIt(5));', out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["return", "a", "+", "b", ";"],
};
EXT.objc = {
  incQ: incPP,
  mul: { code: 'NSLog(@"%d", 4 * 5);', ans: "20" },
  mod: { code: 'NSLog(@"%d", 7 % 2);', out: "1", wrong: wrongsMod },
  cmp: { code: 'NSLog(@"%d", 7 > 3);', out: "1", wrong: ["true", "0", "YES"] },
  neq: neqStd,
  whileQ: { code: 'int i = 0;\nwhile (i < 2) {\n    NSLog(@"%d", i);\n    i++;\n}', out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'for (int i = 0; i < 4; i++) {\n    NSLog(@"hi");\n}', ans: "4" },
  listLit: { line: "NSArray *nums = @[@1, @2, @3];", wrong: ["int nums = [1, 2, 3];", "NSArray nums = (1, 2, 3);", "array nums = {1, 2, 3};"] },
  idxStart: "0",
  listIdx: { code: 'NSArray *pets = @[@"cat", @"dog"];\nNSLog(@"%@", pets[0]);', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: 'NSArray *n = @[@1, @2, @3];\nNSLog(@"%lu", n.count);', out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which array type can you ADD to after creation?", choices: ["NSMutableArray", "NSArray", "NSFixedArray", "NSList"] },
  listGet: { code: 'NSArray *l = @[@"a", @"b", @"c"];\nNSLog(@"%@", l[1]);', ans: "b" },
};

SPEC.vb = {
  printLine: 'Console.WriteLine("Hello!")',
  wrongPrints: ['print("Hello!")', 'echo "Hello!"', 'console.log("Hello!");'],
  printNum: { code: "Console.WriteLine(2 + 3)", out: "5", wrong: ["2 + 3", "23", "Error"] },
  printTokens: ["Console.WriteLine", "(", '"Hi"', ")"],
  printFill: { code: '___("Good morning")', choices: ["Console.WriteLine", "print", "echo"] },
  hello: { code: 'Console.WriteLine("Hello, World!")', ans: "Hello, World!" },
  commentChar: "'", commentWrong: ["//", "#"],
  styleQ: { q: "How does Visual Basic close an If block?", choices: ["End If", "}", "fi", "EndAll"] },
  useQ: { choices: ["Windows business apps and Office automation", "Styling web pages", "Linux servers", "3D games"] },
  decl: { line: "Dim x As Integer = 5", wrong: ["int x = 5;", "let x = 5", "var x := 5"] },
  declTokens: ["Dim", "age", "As", "Integer", "=", "13"],
  declFill: { code: '___ name As String = "Ada"', choices: ["Dim", "Let", "Var"] },
  varPrint: { code: "Dim x As Integer = 7\nConsole.WriteLine(x)", ans: "7" },
  types1: { q: "Which VB type holds text?", choices: ["String", "str", "Text", "Chars"] },
  types2: { q: "Which VB type holds the whole number 42?", choices: ["Integer", "int", "Number", "Digit"] },
  boolQ: { q: "Which are VB's boolean values?", choices: ["True and False", "true and false", "1 and 0 only", "YES and NO"] },
  concat: { q: "VB joins strings with which operator?", choices: ["&", ".", "<>", "++"] },
  eqQ: { q: "Which checks equality in VB?", choices: ["=", "==", "===", "eq"] },
  ifFill: { code: '___ x > 5 Then\n    Console.WriteLine("big")\nEnd If', choices: ["If", "When", "Check"] },
  ifQ: { code: 'Dim x As Integer = 3\nIf x > 5 Then\n    Console.WriteLine("big")\nElse\n    Console.WriteLine("small")\nEnd If', out: "small", wrong: ["big", "3", "Nothing"] },
  loopQ: { code: "For i As Integer = 0 To 2\n    Console.WriteLine(i)\nNext", out: "0 1 2", wrong: ["1 2 3", "0 1 2 3", "3"] },
  loopFill: { code: "For i As Integer = 0 ___ 2", choices: ["To", "Until", "Upto"] },
  funcQ: { choices: ["Function", "def", "func", "fn"] },
  funcOut: { code: "Function DoubleIt(n As Integer) As Integer\n    Return n * 2\nEnd Function\n' later…\nConsole.WriteLine(DoubleIt(5))", out: "10", wrong: ["5", "n * 2", "Error"] },
  returnTokens: ["Return", "a", "+", "b"],
};
EXT.vb = {
  incQ: { q: "How do you add 1 to x in VB? (there is no x++)", choices: ["x += 1", "x++", "Inc(x)", "x =+ 1"] },
  mul: { code: "Console.WriteLine(4 * 5)", ans: "20" },
  mod: { code: "Console.WriteLine(7 Mod 2)", out: "1", wrong: wrongsMod },
  cmp: { code: "Console.WriteLine(7 > 3)", out: "True", wrong: ["true", "1", "False"] },
  neq: { q: "Which means NOT equal in VB?", choices: ["<>", "!=", "=/=", "~="] },
  whileQ: { code: "Dim i As Integer = 0\nWhile i < 2\n    Console.WriteLine(i)\n    i += 1\nEnd While", out: "0 1", wrong: ["1 2", "0 1 2", "Nothing"] },
  loopCount: { code: 'For i As Integer = 1 To 4\n    Console.WriteLine("hi")\nNext', ans: "4" },
  listLit: { line: "Dim nums() As Integer = {1, 2, 3}", wrong: ["Dim nums = [1, 2, 3]", "int nums = {1, 2, 3};", "nums := (1, 2, 3)"] },
  idxStart: "0",
  listIdx: { code: 'Dim pets() As String = {"cat", "dog"}\nConsole.WriteLine(pets(0))', out: "cat", wrong: ["dog", "0", "Error"] },
  listLen: { code: "Dim n() As Integer = {1, 2, 3}\nConsole.WriteLine(n.Length)", out: "3", wrong: ["2", "4", "Error"] },
  listAdd: { q: "Which VB collection grows as you add items?", choices: ["List(Of Integer)", "Integer()", "Tuple", "Enum"] },
  listGet: { code: 'Dim l() As String = {"a", "b", "c"}\nConsole.WriteLine(l(1))', ans: "b" },
};

/* =====================================================================
 * Drill pack specs — print wrappers, logic ops, elif keyword, string length
 * =================================================================== */
const AND_STD = ["&&", "and", "&", "AND"];
const OR_STD = ["||", "or", "|", "OR"];
const NOT_STD = ["!", "not", "~", "NOT"];
const AND_WORD = ["and", "&&", "&", "AND"];
const OR_WORD = ["or", "||", "|", "OR"];
const NOT_WORD = ["not", "!", "~", "NOT"];

const EXT2 = {
  python: { wrap: (e) => `print(${e})`, modOp: "%", elif: "elif",
    logic: { and: AND_WORD, or: OR_WORD, not: NOT_WORD },
    cmp2: { code: "print(2 > 9)", out: "False", wrong: ["True", "0", "Error"] },
    strLen: { code: 'print(len("code"))' } },
  typescript: { wrap: (e) => `console.log(${e});`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "console.log(2 > 9);", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'console.log("code".length);' } },
  java: { wrap: (e) => `System.out.println(${e});`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "System.out.println(2 > 9);", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'System.out.println("code".length());' } },
  csharp: { wrap: (e) => `Console.WriteLine(${e});`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "Console.WriteLine(2 > 9);", out: "False", wrong: ["false", "0", "Error"] },
    strLen: { code: 'Console.WriteLine("code".Length);' } },
  cpp: { wrap: (e) => `std::cout << ${e};`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "std::cout << (2 > 9);", out: "0", wrong: ["false", "1", "Error"] },
    strLen: { code: 'std::string w = "code";\nstd::cout << w.size();' } },
  c: { wrap: (e) => `printf("%d", ${e});`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: 'printf("%d", 2 > 9);', out: "0", wrong: ["false", "1", "Error"] },
    strLen: { code: 'printf("%zu", strlen("code"));' } },
  go: { wrap: (e) => `fmt.Println(${e})`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "fmt.Println(2 > 9)", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'fmt.Println(len("code"))' } },
  rust: { wrap: (e) => `println!("{}", ${e});`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: 'println!("{}", 2 > 9);', out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'println!("{}", "code".len());' } },
  php: { wrap: (e) => `echo ${e};`, modOp: "%", elif: "elseif",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: 'echo 2 > 9 ? "yes" : "no";', out: "no", wrong: ["yes", "0", "Error"] },
    strLen: { code: 'echo strlen("code");' } },
  ruby: { wrap: (e) => `puts ${e}`, modOp: "%", elif: "elsif",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "puts 2 > 9", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'puts "code".length' } },
  swift: { wrap: (e) => `print(${e})`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "print(2 > 9)", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'print("code".count)' } },
  kotlin: { wrap: (e) => `println(${e})`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "println(2 > 9)", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'println("code".length)' } },
  dart: { wrap: (e) => `print(${e});`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "print(2 > 9);", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: "print('code'.length);" } },
  bash: { wrap: (e) => `echo $((${e}))`, modOp: "%", elif: "elif",
    logic: { and: ["&& (inside [[ ]] or between commands)", "and", "&", "AND"], or: ["||", "or", "|", "OR"], not: ["!", "not", "~", "NOT"] },
    cmp2: { code: "echo $((2 > 9))", out: "0", wrong: ["1", "false", "Error"] },
    strLen: { code: 'w="code"\necho ${#w}' } },
  lua: { wrap: (e) => `print(${e})`, modOp: "%", elif: "elseif",
    logic: { and: AND_WORD, or: OR_WORD, not: NOT_WORD },
    cmp2: { code: "print(2 > 9)", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'print(#"code")' } },
  r: { wrap: (e) => `cat(${e})`, modOp: "%%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "cat(2 > 9)", out: "FALSE", wrong: ["false", "0", "Error"] },
    strLen: { code: 'cat(nchar("code"))' } },
  perl: { wrap: (e) => `print ${e};`, modOp: "%", elif: "elsif",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: 'print 2 > 9 ? "yes" : "no";', out: "no", wrong: ["yes", "0", "Error"] },
    strLen: { code: 'print length("code");' } },
  scala: { wrap: (e) => `println(${e})`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "println(2 > 9)", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'println("code".length)' } },
  haskell: { wrap: (e) => `print (${e})`, modOp: "`mod`", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: ["not", "!", "~", "NOT"] },
    cmp2: { code: "print (2 > 9)", out: "False", wrong: ["false", "0", "Error"] },
    strLen: { code: 'print (length "code")' } },
  julia: { wrap: (e) => `println(${e})`, modOp: "%", elif: "elseif",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: "println(2 > 9)", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'println(length("code"))' } },
  elixir: { wrap: (e) => `IO.puts(${e})`, modOp: "%", modDrill: "IO.puts(rem(8, 3))", elif: "cond",
    logic: { and: AND_WORD, or: OR_WORD, not: NOT_WORD },
    cmp2: { code: "IO.puts(2 > 9)", out: "false", wrong: ["true", "0", "Error"] },
    strLen: { code: 'IO.puts(String.length("code"))' } },
  pascal: { wrap: (e) => `writeln(${e});`, modOp: "mod", elif: "else if",
    logic: { and: AND_WORD, or: OR_WORD, not: NOT_WORD },
    cmp2: { code: "writeln(2 > 9);", out: "FALSE", wrong: ["false", "0", "Error"] },
    strLen: { code: "writeln(Length('code'));" } },
  matlab: { wrap: (e) => `disp(${e})`, modOp: "%", modDrill: "disp(mod(8, 3))", elif: "elseif",
    logic: { and: AND_STD, or: OR_STD, not: ["~", "not", "!", "NOT"] },
    cmp2: { code: "disp(2 > 9)", out: "0", wrong: ["1", "false", "Error"] },
    strLen: { code: "disp(length('code'))" } },
  objc: { wrap: (e) => `NSLog(@"%d", ${e});`, modOp: "%", elif: "else if",
    logic: { and: AND_STD, or: OR_STD, not: NOT_STD },
    cmp2: { code: 'NSLog(@"%d", 2 > 9);', out: "0", wrong: ["1", "false", "Error"] },
    strLen: { code: 'NSLog(@"%lu", @"code".length);' } },
  vb: { wrap: (e) => `Console.WriteLine(${e})`, modOp: "Mod", modDrill: "Console.WriteLine(8 Mod 3)", elif: "ElseIf",
    logic: { and: ["And", "&&", "&", "AndOp"], or: ["Or", "||", "|", "OrOp"], not: ["Not", "!", "~", "NotOp"] },
    cmp2: { code: "Console.WriteLine(2 > 9)", out: "False", wrong: ["false", "0", "Error"] },
    strLen: { code: 'Console.WriteLine("code".Length)' } },
};

/* =====================================================================
 * Extra hand-written units appended to specific generated courses
 * =================================================================== */
const EXTRA_UNITS = {};

EXTRA_UNITS.python = [
  {
    title: "Unit 9 · Dictionaries & Tuples",
    desc: "Key-value pairs and fixed groups",
    lessons: [
      {
        title: "Dictionaries",
        exercises: [
          mc("How do you create a dictionary in Python?", null,
            ['person = {"name": "Ada"}', 'person = ["name": "Ada"]', 'person = ("name" = "Ada")', 'dict person = name, Ada']),
          mc("What is the output?", 'person = {"name": "Ada", "age": 36}\nprint(person["name"])', ["Ada", "name", "36", "Error"]),
          fill("Print Ada's age", 'print(person[___])', ['"age"', "age", "(age)"]),
          mc("How do you ADD a new key to a dict?", null,
            ['person["city"] = "London"', 'person.push("city", "London")', 'person.add("city")', 'insert person city']),
          typeEx("Type the output of this code", 'd = {"a": 1, "b": 2}\nprint(len(d))', "2"),
          codeEx('⌨️ Your turn — type the code that prints the value stored under "name" in person', 'print(person["name"])', ["print(person['name'])"]),
        ],
      },
      {
        title: "Tuples & in",
        exercises: [
          mc("What makes a tuple (1, 2, 3) different from a list?", null,
            ["It cannot be changed after creation", "It is faster to spell", "It holds only numbers", "It is sorted automatically"]),
          mc("What is the output?", "t = (1, 2, 3)\nprint(t[0])", ["1", "0", "(1)", "Error"]),
          mc("What is the output?", 'print("a" in ["a", "b"])', ["True", "true", "a", "Error"]),
          fill("Check if cat is one of the pets", 'if "cat" ___ pets:', ["in", "of", "inside"]),
          mc("What does a set {1, 2, 2, 3} automatically remove?", null,
            ["Duplicates — it becomes {1, 2, 3}", "The biggest number", "Nothing", "Odd numbers"]),
        ],
      },
    ],
  },
  {
    title: "Unit 10 · Strings & f-strings",
    desc: "Slice, shout and format text",
    lessons: [
      {
        title: "String Methods",
        exercises: [
          typeEx("Type the output of this code", 'print("hi".upper())', "HI"),
          mc("What does \"Hello\".lower() give you?", null, ['"hello"', '"HELLO"', '"Hello"', "An error"]),
          mc("What is the output?", 'print(len("banana"))', ["6", "5", "7", "banana"]),
          fill("SHOUT IT — make it all capitals", 'print("python".___())', ["upper", "loud", "caps"]),
          mc('What does " spam ".strip() do?', null,
            ["Removes the spaces at both ends", "Removes all letters", "Splits it into a list", "Reverses it"]),
        ],
      },
      {
        title: "f-strings & Slices",
        exercises: [
          mc("What is the output?", 'name = "Ada"\nprint(f"Hi {name}")', ["Hi Ada", "Hi {name}", "f Hi Ada", "Error"]),
          fill("Make it an f-string so {score} is filled in", 'print(___"Score: {score}")', ["f", "s", "$"]),
          typeEx("Type the output of this code", 'print("python"[0:3])', "pyt"),
          mc("What is \"code\"[-1]?", null, ['"e"', '"c"', '"d"', "An error"]),
          codeEx("⌨️ Your turn — name holds \"Ada\". Write an f-string line that prints: Hi Ada", 'print(f"Hi {name}")'),
        ],
      },
    ],
  },
  {
    title: "Unit 11 · Input & Loops II",
    desc: "Talk to users, master ranges",
    lessons: [
      {
        title: "Input & Casting",
        exercises: [
          mc("input() ALWAYS returns which type?", null, ["A string", "A number", "A boolean", "Whatever you typed"]),
          fill("Turn the typed text into a number", "age = ___(input())", ["int", "num", "number"]),
          mc("What is int(\"5\") + 2?", null, ["7", '"52"', '"7"', "Error"]),
          mc("What is str(5) + \"!\"?", null, ['"5!"', "6", "5", "Error"]),
          mc("What is round(3.7)?", null, ["4", "3", "3.7", "Error"]),
          codeEx("⌨️ Your turn — type the line that reads the user's typing into a variable called name", "name = input()"),
        ],
      },
      {
        title: "Loops Level 2",
        exercises: [
          mc("What numbers does range(2, 5) give?", null, ["2 3 4", "2 3 4 5", "3 4 5", "2 5"]),
          mc("What is the output?", "for i in range(0, 10, 2):\n    print(i)", ["0 2 4 6 8", "0 1 2 … 9", "2 4 6 8 10", "0 10 2"]),
          fill("Print 1 to 4", "for i in range(1, ___):\n    print(i)", ["5", "4", "1"]),
          mc("What does break do inside a loop?", null,
            ["Exits the loop immediately", "Pauses for a second", "Skips one round", "Restarts the loop"]),
          mc("What does continue do inside a loop?", null,
            ["Skips to the next round of the loop", "Exits the loop", "Repeats the same round", "Does nothing"]),
        ],
      },
    ],
  },
  {
    title: "Unit 12 · Functions II",
    desc: "Defaults, scope and lambdas",
    lessons: [
      {
        title: "Smarter Functions",
        exercises: [
          mc('In def greet(name="friend"), what is "friend"?', null,
            ["A default value, used when no argument is given", "The only allowed value", "A comment", "The function's name"]),
          mc("What is the output?", 'def greet(name="friend"):\n    print("Hi", name)\n\ngreet()', ["Hi friend", "Hi name", "Hi", "Error"]),
          fill("Give exp a default of 2", "def power(base, exp___2):", ["=", "==", ":="]),
          mc("A function with no return statement returns…", null, ["None", "0", "An empty string", "An error"]),
          typeEx("Type the output of this code", "def f():\n    return 3 + 4\n\nprint(f())", "7"),
        ],
      },
      {
        title: "Scope & Lambda",
        exercises: [
          mc("A variable created INSIDE a function is…", null,
            ["Local — it only exists inside that function", "Global forever", "Saved to a file", "Shared with all functions"]),
          mc("What is lambda x: x * 2?", null,
            ["A tiny anonymous function", "A Greek variable", "A loop", "A comment"]),
          mc("What is the output?", "double = lambda x: x * 2\nprint(double(4))", ["8", "4", "x * 2", "Error"]),
          mc("What is the output?", "nums = [1, 2, 3]\nprint([x * 2 for x in nums])", ["[2, 4, 6]", "[1, 2, 3, 1, 2, 3]", "6", "Error"]),
          codeEx("⌨️ Your turn — write the def line for a function add that takes a and b", "def add(a, b):"),
        ],
      },
    ],
  },
  {
    title: "Unit 13 · Errors & try/except",
    desc: "Crash less, recover more",
    lessons: [
      {
        title: "Reading Errors",
        exercises: [
          mc("Which code causes a ZeroDivisionError?", null, ["print(1 / 0)", "print(0 / 1)", "print(0 * 0)", "print(0 + 0)"]),
          mc("A NameError means…", null,
            ["You used a variable that doesn't exist", "Your name is invalid", "The file is unnamed", "Python forgot your name"]),
          mc("What error does \"5\" + 5 raise?", null,
            ["TypeError — can't add str and int", "ValueError", "MathError", "Nothing — it gives 10"]),
          mc("nums = [1, 2]; print(nums[5]) raises…", null,
            ["IndexError — list index out of range", "KeyError", "ValueError", "Nothing — it prints None"]),
          mc("A SyntaxError means…", null,
            ["The code breaks Python's grammar rules", "The logic is wrong", "The computer is slow", "A library is missing"]),
        ],
      },
      {
        title: "try / except",
        exercises: [
          fill("Protect the risky code", '___:\n    risky()\nexcept:\n    print("saved!")', ["try", "test", "catch"]),
          mc("What is the output?", 'try:\n    print(1 / 0)\nexcept ZeroDivisionError:\n    print("oops")', ["oops", "Error", "0", "1"]),
          mc("The except block runs when…", null,
            ["An error happens inside try", "The code succeeds", "The program starts", "You press Ctrl+C"]),
          mc("A finally block…", null,
            ["Always runs — error or not", "Runs only on errors", "Runs only on success", "Ends the program"]),
          codeEx("⌨️ Your turn — write the except line that catches a ValueError", "except ValueError:"),
        ],
      },
    ],
  },
  {
    title: "Unit 14 · Modules & Files",
    desc: "Borrow power, save data",
    lessons: [
      {
        title: "Imports & Modules",
        exercises: [
          mc("What does import math do?", null,
            ["Loads the math module so you can use its functions", "Does your math homework", "Imports all numbers", "Creates a variable called math"]),
          mc("What is the output?", "import math\nprint(math.sqrt(16))", ["4.0", "4", "256", "Error"]),
          fill("Load the random module", "___ random", ["import", "include", "use"]),
          mc("What does from random import randint do?", null,
            ["Imports just the randint function", "Imports everything", "Makes randint random", "Renames random"]),
          mc("random.randint(1, 6) is perfect for…", null,
            ["Rolling a dice — a random whole number from 1 to 6", "Counting to 6", "Rounding to 6", "Making 6 random files"]),
          codeEx("⌨️ Your turn — type the line that imports the random module", "import random"),
        ],
      },
      {
        title: "Working with Files",
        exercises: [
          mc('What does open("notes.txt") do?', null,
            ["Opens the file so you can read it", "Prints the file", "Deletes the file", "Creates a folder"]),
          fill("Open the file the safe, modern way", 'with open("data.txt") ___ f:', ["as", "to", "in"]),
          mc("Why use with open(...) instead of plain open(...)?", null,
            ["The file is closed automatically, even if an error happens", "It opens faster", "It works on more files", "It's just fashion"]),
          mc("f.read() gives you…", null,
            ["The whole file as one string", "One letter", "The file size", "A list of files"]),
          mc('Opening a file with mode "w" will…', null,
            ["Write — and OVERWRITE anything already in it", "Wait for the file", "Make it read-only", "Warn you first"]),
        ],
      },
    ],
  },
  {
    title: "Unit 15 · Python on the Web",
    desc: "Build real websites with Flask",
    lessons: [
      {
        title: "Hello, Flask",
        exercises: [
          mc("Which Python library lets you build websites?", null,
            ["Flask (Django too!)", "math", "random", "websites.py"]),
          mc("How do you install Flask on your computer?", null,
            ["pip install flask", "import flask from internet", "download flask.exe", "flask --install"]),
          mc('What does @app.route("/") mean?', null,
            ["Run this function when someone visits the homepage", "Delete the homepage", "Create a folder called /", "Restart the app"]),
          fill("Make a page at /about", '@app.___("/about")\ndef about():\n    return "About us!"', ["route", "page", "url"]),
          mc("What does app.run(debug=True) do?", null,
            ["Starts your web server (and auto-reloads when you edit code)", "Deletes bugs", "Publishes to the internet", "Runs the tests"]),
        ],
      },
      {
        title: "Color & Images",
        exercises: [
          mc("What does the visitor see?", '@app.route("/")\ndef home():\n    return "<h1 style=\'color: hotpink\'>Hi!</h1>"',
            ["A pink heading saying Hi! — Python can return HTML!", "The text with all the tags shown", "An error — Python can't do HTML", "A blank page"]),
          fill("Make the heading red", "return \"<h1 style='color: ___'>Hello</h1>\"", ["red", "color-red", "#red"]),
          mc("How do you show cat.png on your Flask site?", null,
            ['Put it in the static folder and return \'<img src="/static/cat.png">\'', "Email it to Flask", "print(cat.png)", "Images need PHP"]),
          mc("What is the static folder for?", null,
            ["Files that don't change — images, CSS, downloads", "Broken code", "Old versions", "Secret files"]),
          mc('What does render_template("home.html") do?', null,
            ["Loads a full HTML file from the templates folder", "Draws a picture", "Renders 3D graphics", "Restarts the server"]),
        ],
      },
      {
        title: "Your Web App",
        exercises: [
          mc("What is the output… in your browser?", 'from flask import Flask\napp = Flask(__name__)\n\n@app.route("/")\ndef home():\n    return "Welcome!"\n\napp.run()',
            ["A web page saying Welcome! at localhost:5000", "Welcome! in the terminal only", "An email", "Nothing"]),
          mc("A route like @app.route(\"/shop\") means visitors find it at…", null,
            ["yoursite.com/shop", "yoursite.com", "shop.yoursite.com", "It's hidden"]),
          mc("How does your Python page get CSS styling?", null,
            ["Link a CSS file from the static folder in your HTML", "CSS doesn't work with Python", "pip install css", "Use print(css)"]),
          codeEx("⌨️ Your turn — write the decorator line that makes the function below serve the homepage", '@app.route("/")'),
          mc("Flask + what you learned in the HTML & CSS courses =", null,
            ["Real, styled, working websites 🎉", "Only text pages", "Just math", "Nothing useful"]),
        ],
      },
    ],
  },
];

EXTRA_UNITS.js = [
  {
    title: "Unit 9 · Objects & JSON",
    desc: "Label your data with names",
    lessons: [
      {
        title: "Objects",
        exercises: [
          mc("How do you create an object in JavaScript?", null,
            ['let person = { name: "Ada" };', 'let person = [ name: "Ada" ];', 'object person = name: "Ada";', 'let person = ( name = "Ada" );']),
          mc("What is the output?", 'let person = { name: "Ada", age: 36 };\nconsole.log(person.name);', ["Ada", "name", "36", "undefined"]),
          fill("Print Ada's age", "console.log(person.___);", ["age", '"age"', "(age)"]),
          mc("How do you ADD a new property to an object?", null,
            ['person.city = "London";', 'person.push("city");', 'person.add("city", "London");', "insert person.city"]),
          typeEx("Type the output of this code", "let d = { a: 1, b: 2 };\nconsole.log(d.a);", "1"),
        ],
      },
      {
        title: "JSON & Methods",
        exercises: [
          mc("What is JSON?", null,
            ["A text format for sending and storing data", "A JavaScript-only database", "A type of loop", "A styling language"]),
          mc("What does JSON.stringify({ a: 1 }) give you?", null,
            ['the text \'{"a":1}\'', "a number", "an error", "a copy of the object"]),
          mc("Which puts a FUNCTION inside an object?", null,
            ['{ greet() { console.log("Hi"); } }', "{ greet: loop }", "{ function: greet }", "objects can't hold functions"]),
          mc("Inside an object's method, this refers to…", null,
            ["The object itself", "The whole page", "The function name", "Nothing"]),
          codeEx("⌨️ Your turn — person has a name property. Write the line that prints it", "console.log(person.name);"),
        ],
      },
    ],
  },
  {
    title: "Unit 10 · Strings & Templates",
    desc: "Shape text like a pro",
    lessons: [
      {
        title: "String Methods",
        exercises: [
          typeEx("Type the output of this code", 'console.log("hi".toUpperCase());', "HI"),
          mc('What does "Banana".length give you?', null, ["6", "5", "7", '"Banana"']),
          mc("What is the output?", 'console.log("code"[0]);', ["c", "o", "0", "code"]),
          fill("Check whether the text contains Script", '"JavaScript".___("Script")', ["includes", "contains", "has"]),
          mc('What does "  spam  ".trim() do?', null,
            ["Removes the spaces at both ends", "Removes all letters", "Cuts it in half", "Reverses it"]),
        ],
      },
      {
        title: "Template Literals",
        exercises: [
          mc("What is the output? (note the backticks)", 'let name = "Ada";\nconsole.log(`Hi ${name}`);', ["Hi Ada", "Hi ${name}", "`Hi Ada`", "Error"]),
          fill("Fill the blank inside the template", "console.log(`Score: ${___}`);", ["score", '"score"', "$score"]),
          typeEx("Type the output of this code", 'console.log("js".repeat(2));', "jsjs"),
          mc('What does "a,b,c".split(",") give you?', null,
            ['["a", "b", "c"]', '"abc"', "3", '["a,b,c"]']),
          codeEx("⌨️ Your turn — name holds \"Ada\". Print Hi Ada using a template literal (backticks)",
            "console.log(`Hi ${name}`);", ['console.log("Hi " + name);']),
        ],
      },
    ],
  },
  {
    title: "Unit 11 · The DOM & Events",
    desc: "Make web pages come alive",
    lessons: [
      {
        title: "The DOM",
        exercises: [
          mc("What is the DOM?", null,
            ["JavaScript's live view of the page, which it can read and change", "A database", "A CSS framework", "A browser brand"]),
          mc('What does document.getElementById("title") do?', null,
            ['Finds the element with id="title"', "Creates a new title", "Deletes the title", "Renames the page"]),
          fill("Grab the button by its id", 'document.___("btn")', ["getElementById", "findId", "selectById"]),
          mc('What does el.textContent = "Hi" do?', null,
            ["Changes the element's text to Hi", "Creates a variable", "Logs Hi", "Adds a CSS class"]),
          mc('What does document.querySelector(".card") find?', null,
            ["The FIRST element matching the CSS selector .card", "All cards", "A playing card", "The card's id"]),
        ],
      },
      {
        title: "Events",
        exercises: [
          mc('What does btn.addEventListener("click", handle) do?', null,
            ["Runs handle every time the button is clicked", "Clicks the button once", "Renames the button", "Blocks all clicks"]),
          fill("React to clicks", "btn.addEventListener(___, handle);", ['"click"', "click", "onClick"]),
          mc("Which of these are real browser events?", null,
            ["click, keydown and submit", "jump, spin and dance", "if, else and for", "px, em and rem"]),
          mc("What is () => { … } ?", null,
            ["An arrow function — a short way to write a function", "An emoji", "A comparison", "A comment"]),
          codeEx("⌨️ Your turn — write the line that sets el's text to Hi", 'el.textContent = "Hi";'),
        ],
      },
    ],
  },
  {
    title: "Unit 12 · Fetch & APIs",
    desc: "Talk to the internet",
    lessons: [
      {
        title: "Talking to the Internet",
        exercises: [
          mc("What is an API?", null,
            ["A way for programs to request data from other programs", "A type of beer", "A JavaScript error", "A password"]),
          mc('What does fetch("https://api.example.com/cats") do?', null,
            ["Asks that server for data over the internet", "Downloads a cat", "Opens a new tab", "Prints the URL"]),
          mc("Most web APIs send their answers in which format?", null,
            ["JSON", "Word documents", "MP3", "Handwriting"]),
          fill("Turn the response into usable data", "const res = await fetch(url);\nconst data = await res.___();", ["json", "data", "parse"]),
          mc("What does await do?", null,
            ["Waits for the result before running the next line", "Makes code run twice", "Waits exactly one second", "Stops the program forever"]),
        ],
      },
      {
        title: "Async & Promises",
        exercises: [
          mc("A Promise is…", null,
            ["A value that will arrive later — pending, then fulfilled or rejected", "A guarantee code has no bugs", "A type of loop", "A comment"]),
          fill("Only async functions can use await", '___ function load() {\n  const res = await fetch(url);\n}', ["async", "await", "promise"]),
          mc("Tricky! What is the output ORDER?", 'console.log("a");\nsetTimeout(() => console.log("b"), 0);\nconsole.log("c");', ["a c b", "a b c", "b a c", "c b a"]),
          mc("What does .then(...) do on a promise?", null,
            ["Runs your function once the promise has its value", "Pauses the page", "Repeats the promise", "Cancels it"]),
          codeEx("⌨️ Your turn — write the line that fetches url and awaits the response into res", "const res = await fetch(url);"),
        ],
      },
    ],
  },
];

EXTRA_UNITS.java = [
  {
    title: "Unit 9 · Strings in Depth",
    desc: "Methods, traps and tricks",
    lessons: [
      {
        title: "String Methods",
        exercises: [
          typeEx("Type the output of this code", 'System.out.println("hi".toUpperCase());', "HI"),
          mc('What does "Banana".length() return?', null, ["6", "5", "7", "Banana"]),
          mc("What is the output?", 'System.out.println("Java".charAt(0));', ["J", "a", "0", "Java"]),
          fill("Compare the TEXT of two strings", 'name.___("Ada")', ["equals", "==", "sameAs"]),
          mc("Why use .equals() instead of == for Strings?", null,
            ["== compares references; .equals() compares the actual text", "They are identical", ".equals() is faster", "== only works on numbers"]),
        ],
      },
      {
        title: "Building Strings",
        exercises: [
          mc('What does "Mc" + "Queen" give you?', null, ['"McQueen"', '"Mc Queen"', "An error", '"Mc+Queen"']),
          mc("Careful! What is the output?", 'System.out.println("Ja" + 1 + 1);', ["Ja11", "Ja2", "Ja:2", "Error"]),
          mc("How do you turn the number 42 into a String?", null,
            ['String.valueOf(42)', "(String) 42", "42.toString() directly", 'string(42)']),
          typeEx("Type the output of this code", 'System.out.println("racecar".length());', "7"),
          codeEx("⌨️ Your turn — write one line that prints \"hello\" in CAPITALS using toUpperCase()", 'System.out.println("hello".toUpperCase());'),
        ],
      },
    ],
  },
  {
    title: "Unit 10 · Classes & Objects",
    desc: "Blueprints and the things they build",
    lessons: [
      {
        title: "Your First Class",
        exercises: [
          mc("Which keyword defines a class in Java?", null, ["class", "object", "blueprint", "struct"]),
          mc("How do you CREATE a Dog object?", null,
            ["Dog d = new Dog();", "Dog d = Dog.create();", "make Dog d;", "object d = Dog;"]),
          fill("Fill in the keyword", "Dog d = ___ Dog();", ["new", "make", "create"]),
          codeEx("⌨️ Your turn — type the line that creates a new Dog object stored in d", "Dog d = new Dog();"),
          mc("A class is a … and an object is a …", null,
            ["blueprint / thing built from it", "thing / blueprint", "loop / variable", "file / folder"]),
          mc("What is the output?", 'class Dog {\n    String name = "Rex";\n}\n// later…\nDog d = new Dog();\nSystem.out.println(d.name);', ["Rex", "name", "Dog", "null"]),
        ],
      },
      {
        title: "Methods & Constructors",
        exercises: [
          mc("Fields of a class are…", null,
            ["Variables that belong to each object", "Grass areas", "Static files", "Loop counters"]),
          mc("What is the output?", 'class Dog {\n    void bark() {\n        System.out.println("Woof!");\n    }\n}\n// later…\nnew Dog().bark();', ["Woof!", "bark", "Dog", "Nothing"]),
          fill("This method returns nothing", "public ___ bark() {\n    System.out.println(\"Woof!\");\n}", ["void", "null", "none"]),
          mc("A constructor is…", null,
            ["A special method, named like the class, that runs when an object is created", "A builder robot", "A loop inside a class", "The first field"]),
          mc("Inside a method, this refers to…", null,
            ["The current object", "The parent class", "The main method", "The compiler"]),
        ],
      },
    ],
  },
  {
    title: "Unit 11 · ArrayList & Switch",
    desc: "Growable lists and many-way choices",
    lessons: [
      {
        title: "ArrayList",
        exercises: [
          mc("Why use an ArrayList instead of an array?", null,
            ["It grows and shrinks as you add and remove items", "It is spelled cooler", "It only holds Strings", "Arrays are deprecated"]),
          fill('Add "apple" to the list', 'list.___("apple");', ["add", "push", "append"]),
          mc("What is the output?", 'ArrayList<String> l = new ArrayList<>();\nl.add("a");\nl.add("b");\nSystem.out.println(l.size());', ["2", "1", "b", "Error"]),
          typeEx("Type the output of this code", 'ArrayList<String> l = new ArrayList<>();\nl.add("hi");\nSystem.out.println(l.get(0));', "hi"),
          mc("list.get(0) returns…", null, ["The first element", "The last element", "The list size", "Nothing"]),
          codeEx('⌨️ Your turn — type the line that adds "apple" to list', 'list.add("apple");'),
        ],
      },
      {
        title: "Switch & Casting",
        exercises: [
          mc("A switch statement…", null,
            ["Picks ONE case to run from many options", "Turns the program off", "Loops forever", "Swaps two variables"]),
          fill("Fill in the keyword", '___ (day) {\n    case 1:\n        System.out.println("Mon");\n        break;\n}', ["switch", "select", "match"]),
          mc("What does break do at the end of a case?", null,
            ["Stops fall-through into the next case", "Crashes the switch", "Restarts the switch", "Nothing"]),
          mc("What is the output? (casting chops off decimals)", "int x = (int) 3.9;\nSystem.out.println(x);", ["3", "4", "3.9", "Error"]),
          mc("final int MAX = 10; means…", null,
            ["MAX can never be reassigned", "MAX is the last variable", "MAX is private", "MAX is checked at the end"]),
        ],
      },
    ],
  },
];

/* =====================================================================
 * The catalog
 * =================================================================== */
const COURSES = [
  { id: "js", name: "JavaScript", badge: "JS", color: "#f7df1e", colorDark: "#b8a410",
    tagline: "The language of the web", difficulty: "Beginner", units: JS_UNITS },
  { id: "python", name: "Python", badge: "Py", color: "#4b9fd5", colorDark: "#36719a",
    tagline: "Data, AI & automation", difficulty: "Beginner" },
  { id: "html", name: "HTML", badge: "<>", color: "#e34c26", colorDark: "#b03a1d",
    tagline: "The skeleton of every page", difficulty: "Beginner", units: HTML_UNITS },
  { id: "css", name: "CSS", badge: "{}", color: "#2965f1", colorDark: "#1d49ad",
    tagline: "Make the web beautiful", difficulty: "Beginner", units: CSS_UNITS },
  { id: "sql", name: "SQL", badge: "DB", color: "#e38c00", colorDark: "#a86800",
    tagline: "Talk to databases", difficulty: "Beginner", units: SQL_UNITS },
  { id: "typescript", name: "TypeScript", badge: "TS", color: "#3178c6", colorDark: "#235a93",
    tagline: "JavaScript with seatbelts", difficulty: "Intermediate" },
  { id: "java", name: "Java", badge: "Jv", color: "#ec722c", colorDark: "#b35420",
    tagline: "Android & enterprise", difficulty: "Intermediate" },
  { id: "csharp", name: "C#", badge: "C#", color: "#9b4f96", colorDark: "#71386d",
    tagline: "Windows, web & Unity games", difficulty: "Intermediate" },
  { id: "cpp", name: "C++", badge: "C+", color: "#659ad2", colorDark: "#48729c",
    tagline: "Games & high performance", difficulty: "Advanced" },
  { id: "c", name: "C", badge: "C", color: "#5c8dbc", colorDark: "#42688c",
    tagline: "Close to the metal", difficulty: "Advanced" },
  { id: "go", name: "Go", badge: "Go", color: "#00add8", colorDark: "#007fa0",
    tagline: "Cloud & backend services", difficulty: "Intermediate" },
  { id: "rust", name: "Rust", badge: "Rs", color: "#d6705c", colorDark: "#a05344",
    tagline: "Fast and fearless", difficulty: "Advanced" },
  { id: "php", name: "PHP", badge: "Php", color: "#777bb3", colorDark: "#575a85",
    tagline: "Powers most of the web", difficulty: "Beginner" },
  { id: "ruby", name: "Ruby", badge: "Rb", color: "#cc342d", colorDark: "#962621",
    tagline: "Optimized for happiness", difficulty: "Beginner" },
  { id: "swift", name: "Swift", badge: "Sw", color: "#f05138", colorDark: "#b53c29",
    tagline: "Apps for Apple devices", difficulty: "Intermediate" },
  { id: "kotlin", name: "Kotlin", badge: "Kt", color: "#a97bff", colorDark: "#7c59c2",
    tagline: "Modern Android", difficulty: "Intermediate" },
  { id: "dart", name: "Dart", badge: "Da", color: "#0175c2", colorDark: "#015590",
    tagline: "Flutter apps everywhere", difficulty: "Intermediate" },
  { id: "bash", name: "Bash", badge: ">_", color: "#4eaa25", colorDark: "#397c1b",
    tagline: "Command the terminal", difficulty: "Beginner" },
  { id: "lua", name: "Lua", badge: "Lu", color: "#5b6cd9", colorDark: "#4350a1",
    tagline: "Script games like Roblox", difficulty: "Beginner" },
  { id: "r", name: "R", badge: "R", color: "#276dc3", colorDark: "#1c4f8e",
    tagline: "Statistics & data viz", difficulty: "Intermediate" },
  { id: "perl", name: "Perl", badge: "Pl", color: "#39457e", colorDark: "#28315c",
    tagline: "The text-wrangling classic", difficulty: "Intermediate" },
  { id: "scala", name: "Scala", badge: "Sc", color: "#de3423", colorDark: "#a32115",
    tagline: "Big data & JVM power", difficulty: "Advanced" },
  { id: "haskell", name: "Haskell", badge: "λ", color: "#8576b8", colorDark: "#5e5086",
    tagline: "Pure functional thinking", difficulty: "Advanced" },
  { id: "julia", name: "Julia", badge: "Jl", color: "#9558b2", colorDark: "#6f4187",
    tagline: "Math at warp speed", difficulty: "Intermediate" },
  { id: "elixir", name: "Elixir", badge: "Ex", color: "#8c6bb1", colorDark: "#6e4a7e",
    tagline: "Resilient real-time apps", difficulty: "Advanced" },
  { id: "pascal", name: "Pascal", badge: "Pa", color: "#3b82c4", colorDark: "#2b5f90",
    tagline: "The classic teaching language", difficulty: "Beginner" },
  { id: "matlab", name: "MATLAB", badge: "ML", color: "#e16737", colorDark: "#a84c28",
    tagline: "Engineering & simulations", difficulty: "Intermediate" },
  { id: "objc", name: "Objective-C", badge: "[ ]", color: "#438eff", colorDark: "#3168bd",
    tagline: "Classic Apple development", difficulty: "Advanced" },
  { id: "vb", name: "Visual Basic", badge: "VB", color: "#0e7490", colorDark: "#0a5568",
    tagline: "Friendly Windows apps", difficulty: "Beginner" },
].map((meta) => {
  if (meta.units) {
    const all = [...meta.units, ...(EXTRA_UNITS[meta.id] || [])];
    if (NUM_WRAP[meta.id]) all.push(numbersUnit(NUM_WRAP[meta.id], all.length + 1));
    return { ...meta, units: withReviewUnits(all, all.length + 1) };
  }
  return buildCourse(meta, SPEC[meta.id], { ...EXT[meta.id], ...EXT2[meta.id] });
});
