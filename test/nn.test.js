/* Checks the from-scratch maths in nn.js: backprop gradients against finite
 * differences, that training actually reduces loss, and that a saved model
 * reloads bit-for-bit. Run with:  node test/nn.test.js  */
const assert = require("assert");
const NN = require("../nn.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✔ ${name}`);
}

test("backprop gradients match finite differences", () => {
  const net = new NN.Net([5, 6, 4, 3], { seed: 7, weightDecay: 0 });
  const rand = NN.mulberry32(99);
  const x = Float32Array.from({ length: 5 }, () => rand() * 2 - 1);
  const y = Float32Array.from({ length: 3 }, () => rand());

  net.zeroGrad();
  net.lossAndBackward(x, y);

  const lossOnly = () => {
    const out = net.predict(x);
    let l = 0;
    for (let i = 0; i < out.length; i++) l += (out[i] - y[i]) ** 2;
    return l / out.length;
  };

  const eps = 1e-3;
  let checks = 0;
  for (let li = 0; li < net.layers.length; li++) {
    const layer = net.layers[li];
    for (const wi of [0, 3, layer.W.length - 1]) {
      const original = layer.W[wi];
      layer.W[wi] = original + eps;
      const up = lossOnly();
      layer.W[wi] = original - eps;
      const down = lossOnly();
      layer.W[wi] = original;

      const numeric = (up - down) / (2 * eps);
      const analytic = layer.dW[wi];
      const scale = Math.max(1e-4, Math.abs(numeric) + Math.abs(analytic));
      assert.ok(
        Math.abs(numeric - analytic) / scale < 2e-2,
        `layer ${li} weight ${wi}: analytic ${analytic} vs numeric ${numeric}`
      );
      checks++;
    }
    // …and a bias term per layer.
    const bi = 0;
    const ob = layer.b[bi];
    layer.b[bi] = ob + eps;
    const up = lossOnly();
    layer.b[bi] = ob - eps;
    const down = lossOnly();
    layer.b[bi] = ob;
    const numericB = (up - down) / (2 * eps);
    const scaleB = Math.max(1e-4, Math.abs(numericB) + Math.abs(layer.db[bi]));
    assert.ok(
      Math.abs(numericB - layer.db[bi]) / scaleB < 2e-2,
      `layer ${li} bias: analytic ${layer.db[bi]} vs numeric ${numericB}`
    );
    checks++;
  }
  assert.ok(checks >= 12, "expected several gradient checks");
});

test("training drives loss down on a learnable function", () => {
  // Target: two outputs that are simple non-linear functions of the inputs.
  const rand = NN.mulberry32(4);
  const xs = [];
  const ys = [];
  for (let i = 0; i < 400; i++) {
    const a = rand(), b = rand(), c = rand();
    xs.push(Float32Array.from([a, b, c, a * b]));
    ys.push(Float32Array.from([Math.abs(a - b), (a + c) / 2]));
  }
  const net = new NN.Net([4, 16, 8, 2], { seed: 11 });
  const before = net.evaluate(xs, ys);
  const trainRand = NN.mulberry32(5);
  for (let e = 0; e < 60; e++) net.trainEpoch(xs, ys, { lr: 0.02, batchSize: 16, rand: trainRand });
  const after = net.evaluate(xs, ys);

  assert.ok(after < before * 0.2, `loss should collapse: ${before} → ${after}`);
  assert.ok(after < 0.005, `expected a good fit, got MSE ${after}`);
});

test("mini-batch gradients equal the mean of single-sample gradients", () => {
  const mk = () => new NN.Net([3, 4, 2], { seed: 21, weightDecay: 0 });
  const rand = NN.mulberry32(33);
  const xs = [0, 1, 2, 3].map(() => Float32Array.from({ length: 3 }, () => rand()));
  const ys = [0, 1, 2, 3].map(() => Float32Array.from({ length: 2 }, () => rand()));

  const batched = mk();
  batched.zeroGrad();
  for (let i = 0; i < xs.length; i++) batched.lossAndBackward(xs[i], ys[i]);

  const summed = mk();
  const accum = summed.layers.map((l) => new Float32Array(l.W.length));
  for (let i = 0; i < xs.length; i++) {
    summed.zeroGrad();
    summed.lossAndBackward(xs[i], ys[i]);
    summed.layers.forEach((l, li) => {
      for (let k = 0; k < l.dW.length; k++) accum[li][k] += l.dW[k];
    });
  }
  batched.layers.forEach((l, li) => {
    for (let k = 0; k < l.dW.length; k++) {
      assert.ok(Math.abs(l.dW[k] - accum[li][k]) < 1e-4, `layer ${li} weight ${k} mismatch`);
    }
  });
});

test("sigmoid outputs stay inside 0…1", () => {
  const net = new NN.Net([4, 8, 3], { seed: 2 });
  const rand = NN.mulberry32(8);
  for (let i = 0; i < 50; i++) {
    const x = Float32Array.from({ length: 4 }, () => rand() * 200 - 100);
    for (const v of net.predict(x)) assert.ok(v >= 0 && v <= 1, `output out of range: ${v}`);
  }
});

test("a saved model reloads and predicts identically", () => {
  const net = new NN.Net([4, 6, 2], { seed: 3 });
  const rand = NN.mulberry32(12);
  const xs = [0, 1, 2].map(() => Float32Array.from({ length: 4 }, () => rand()));
  const ys = [0, 1, 2].map(() => Float32Array.from({ length: 2 }, () => rand()));
  for (let e = 0; e < 5; e++) net.trainEpoch(xs, ys, { lr: 0.05, batchSize: 2 });

  const clone = NN.Net.fromJSON(JSON.parse(JSON.stringify(net.toJSON())));
  for (const x of xs) {
    const a = Array.from(net.predict(x));
    const b = Array.from(clone.predict(x));
    a.forEach((v, i) => assert.strictEqual(v, b[i], "reloaded model must match exactly"));
  }
  assert.throws(() => NN.Net.fromJSON({ format: "nope" }), /Unrecognised model/);
});

console.log(`\nnn.js: ${passed} tests passed`);
