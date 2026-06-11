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
        { title: "Review I", exercises: sample(pool.slice(0, half), 6, 0) },
        { title: "Review II", exercises: sample(pool.slice(half), 6, 1) },
      ],
    },
    {
      title: `Unit ${startNum + 1} · Mastery`,
      desc: "Prove you've mastered it all",
      lessons: [
        { title: "Mastery Exam A", exercises: sample(pool, 7, 2) },
        { title: "Mastery Exam B", exercises: sample(pool, 7, 5) },
      ],
    },
  ];
}

/* ---------- generated course builder (10 units per language) ---------- */
function buildCourse(meta, g, x) {
  const N = meta.name;
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
            typeEx("Type the output of this code", g.hello.code, g.hello.ans),
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
          title: "Comparisons",
          exercises: [
            mc(g.eqQ.q || `Which operator checks equality in ${N}?`, null, g.eqQ.choices),
            mc(x.neq.q || `Which means NOT equal in ${N}?`, null, x.neq.choices),
            mc("What is the output?", x.cmp.code, [x.cmp.out, ...x.cmp.wrong]),
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
          ],
        },
        {
          title: "Else & Branches",
          exercises: [
            G.elseRuns(),
            G.elseChain(),
            mc("What is the output?", g.ifQ.code, [g.ifQ.out, ...g.ifQ.wrong]),
            fill("Fill in the keyword", g.ifFill.code, g.ifFill.choices),
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
          ],
        },
      ],
    },
  ];
  return { ...meta, units: withReviewUnits(units, 9) };
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
].map((meta) =>
  meta.units
    ? { ...meta, units: withReviewUnits(meta.units, meta.units.length + 1) }
    : buildCourse(meta, SPEC[meta.id], EXT[meta.id])
);
