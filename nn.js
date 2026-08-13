/* nn.js — a neural network written from scratch. No libraries, no API calls.
 *
 * A plain feed-forward net (multi-layer perceptron):
 *   input features → [hidden layers, ReLU] → output layer, sigmoid
 * trained by backpropagation with the Adam optimiser and mean-squared error.
 *
 * Everything lives in flat Float32Arrays so it stays fast enough to train
 * a few hundred epochs inside a browser tab.
 *
 * Runs in the browser (global `NN`) and in Node (module.exports) so the maths
 * can be unit-tested — see test/nn.test.js. */
(function (root) {
  "use strict";

  /** Small, fast, seedable PRNG so training runs are reproducible. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Standard normal via Box-Muller, used for weight initialisation. */
  function randn(rand) {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }

  const ACTIVATIONS = {
    relu: {
      apply: (z) => (z > 0 ? z : 0),
      // derivative expressed in terms of the pre-activation z
      grad: (z) => (z > 0 ? 1 : 0),
    },
    sigmoid: {
      apply: (z) => 1 / (1 + Math.exp(-z)),
      grad: (z) => {
        const s = 1 / (1 + Math.exp(-z));
        return s * (1 - s);
      },
    },
    linear: { apply: (z) => z, grad: () => 1 },
  };

  /** One fully-connected layer: a = act(W·x + b). */
  class Dense {
    constructor(inN, outN, act, rand) {
      this.inN = inN;
      this.outN = outN;
      this.act = act;
      this.W = new Float32Array(outN * inN);
      this.b = new Float32Array(outN);

      // He initialisation for ReLU, Xavier for the saturating output layer.
      const scale = act === "relu" ? Math.sqrt(2 / inN) : Math.sqrt(1 / inN);
      for (let i = 0; i < this.W.length; i++) this.W[i] = randn(rand) * scale;

      // Caches reused every forward/backward pass (no per-sample allocation).
      this.z = new Float32Array(outN);
      this.a = new Float32Array(outN);
      this.x = null; // input to this layer, kept for the weight gradient
      this.dW = new Float32Array(outN * inN);
      this.db = new Float32Array(outN);
      this.dx = new Float32Array(inN);

      // Adam moment estimates.
      this.mW = new Float32Array(outN * inN);
      this.vW = new Float32Array(outN * inN);
      this.mb = new Float32Array(outN);
      this.vb = new Float32Array(outN);
    }

    forward(x) {
      const { W, b, z, a, inN, outN } = this;
      const fn = ACTIVATIONS[this.act].apply;
      this.x = x;
      for (let o = 0; o < outN; o++) {
        const row = o * inN;
        let sum = b[o];
        for (let i = 0; i < inN; i++) sum += W[row + i] * x[i];
        z[o] = sum;
        a[o] = fn(sum);
      }
      return a;
    }

    /** Takes dL/da for this layer, accumulates dL/dW & dL/db, returns dL/dx. */
    backward(da) {
      const { W, z, x, dW, db, dx, inN, outN } = this;
      const dfn = ACTIVATIONS[this.act].grad;
      dx.fill(0);
      for (let o = 0; o < outN; o++) {
        const dz = da[o] * dfn(z[o]);
        if (dz === 0) continue;
        const row = o * inN;
        db[o] += dz;
        for (let i = 0; i < inN; i++) {
          dW[row + i] += dz * x[i];
          dx[i] += dz * W[row + i];
        }
      }
      return dx;
    }

    zeroGrad() {
      this.dW.fill(0);
      this.db.fill(0);
    }

    /** Adam update. `scale` averages the gradients accumulated over a batch. */
    step(lr, t, scale, weightDecay) {
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      const c1 = 1 - Math.pow(b1, t);
      const c2 = 1 - Math.pow(b2, t);
      const { W, b, dW, db, mW, vW, mb, vb } = this;
      for (let i = 0; i < W.length; i++) {
        const g = dW[i] * scale + weightDecay * W[i];
        mW[i] = b1 * mW[i] + (1 - b1) * g;
        vW[i] = b2 * vW[i] + (1 - b2) * g * g;
        W[i] -= (lr * (mW[i] / c1)) / (Math.sqrt(vW[i] / c2) + eps);
      }
      for (let o = 0; o < b.length; o++) {
        const g = db[o] * scale;
        mb[o] = b1 * mb[o] + (1 - b1) * g;
        vb[o] = b2 * vb[o] + (1 - b2) * g * g;
        b[o] -= (lr * (mb[o] / c1)) / (Math.sqrt(vb[o] / c2) + eps);
      }
    }
  }

  /**
   * A stack of Dense layers.
   *   sizes: [inputs, hidden…, outputs] e.g. [188, 48, 24, 4]
   * Hidden layers use ReLU; the output layer is a sigmoid, so every prediction
   * lands in 0…1, which is what a classifier's confidences need to be.
   */
  class Net {
    constructor(sizes, opts = {}) {
      if (!Array.isArray(sizes) || sizes.length < 2) {
        throw new Error("Net needs at least an input and an output size");
      }
      this.sizes = sizes.slice();
      this.outputAct = opts.outputAct || "sigmoid";
      this.weightDecay = opts.weightDecay ?? 1e-5;
      this.t = 0; // Adam timestep
      const rand = mulberry32(opts.seed ?? 1337);
      this.layers = [];
      for (let i = 0; i < sizes.length - 1; i++) {
        const isLast = i === sizes.length - 2;
        this.layers.push(new Dense(sizes[i], sizes[i + 1], isLast ? this.outputAct : "relu", rand));
      }
    }

    predict(x) {
      let a = x;
      for (const layer of this.layers) a = layer.forward(a);
      return a;
    }

    /** Mean-squared error of one sample; also seeds the backward pass. */
    lossAndBackward(x, y) {
      const out = this.predict(x);
      const n = out.length;
      const da = new Float32Array(n);
      let loss = 0;
      for (let i = 0; i < n; i++) {
        const diff = out[i] - y[i];
        loss += diff * diff;
        da[i] = (2 * diff) / n; // d(MSE)/d(out)
      }
      // Each layer owns its own dx buffer, so the gradient can be handed
      // straight down the stack without copying.
      let grad = da;
      for (let i = this.layers.length - 1; i >= 0; i--) grad = this.layers[i].backward(grad);
      return loss / n;
    }

    zeroGrad() {
      for (const layer of this.layers) layer.zeroGrad();
    }

    step(lr, batchSize) {
      this.t++;
      for (const layer of this.layers) {
        layer.step(lr, this.t, 1 / batchSize, this.weightDecay);
      }
    }

    /**
     * One pass over the data in shuffled mini-batches.
     * xs/ys are arrays of Float32Array. Returns the mean training loss.
     */
    trainEpoch(xs, ys, { lr = 0.01, batchSize = 16, rand = Math.random } = {}) {
      const order = xs.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      let total = 0;
      for (let start = 0; start < order.length; start += batchSize) {
        const batch = order.slice(start, start + batchSize);
        this.zeroGrad();
        for (const idx of batch) total += this.lossAndBackward(xs[idx], ys[idx]);
        this.step(lr, batch.length);
      }
      return total / xs.length;
    }

    /** Mean-squared error over a dataset, without touching the weights. */
    evaluate(xs, ys) {
      let total = 0;
      for (let i = 0; i < xs.length; i++) {
        const out = this.predict(xs[i]);
        let loss = 0;
        for (let k = 0; k < out.length; k++) {
          const d = out[k] - ys[i][k];
          loss += d * d;
        }
        total += loss / out.length;
      }
      return xs.length ? total / xs.length : 0;
    }

    toJSON() {
      return {
        format: "gmc-net-1",
        sizes: this.sizes,
        outputAct: this.outputAct,
        layers: this.layers.map((l) => ({ W: Array.from(l.W), b: Array.from(l.b) })),
      };
    }

    static fromJSON(obj) {
      if (!obj || obj.format !== "gmc-net-1") throw new Error("Unrecognised model file");
      const net = new Net(obj.sizes, { outputAct: obj.outputAct });
      obj.layers.forEach((saved, i) => {
        net.layers[i].W.set(saved.W);
        net.layers[i].b.set(saved.b);
      });
      return net;
    }
  }

  const NN = { Net, Dense, mulberry32, randn, ACTIVATIONS };
  root.NN = NN;
  if (typeof module !== "undefined" && module.exports) module.exports = NN;
})(typeof self !== "undefined" ? self : globalThis);
