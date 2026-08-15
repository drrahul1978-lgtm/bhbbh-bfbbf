/* voice.js — hearing and seeing at the same time.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ONE HONEST CAVEAT IN THIS PROJECT
 *
 * Everything else EVE does runs on your machine. Speech recognition does not,
 * and cannot: turning sound into words needs an acoustic model trained on
 * thousands of hours of speech, which is not something that can be written
 * from scratch here or trained on a Raspberry Pi.
 *
 * So this uses the browser's own speech recognition, and in Chrome and Edge
 * that sends your audio to the browser vendor's servers. It is the only part
 * of her that leaves the device.
 *
 * Because of that it is OFF until you switch it on, the page says plainly what
 * happens when you do, and everything works exactly as well by typing. Her
 * camera is different — that never leaves the machine, because seeing is done
 * by code in this repository.
 * ────────────────────────────────────────────────────────────────────────────
 */
(function (root) {
  "use strict";

  const SpeechRecognition = root.SpeechRecognition || root.webkitSpeechRecognition || null;

  /**
   * Her ears.
   *
   * `onHeard` fires with a finished sentence; `onPartial` with the words so far
   * so the page can show her hearing you in real time.
   */
  class Ears {
    constructor({ onHeard, onPartial, onState, lang } = {}) {
      this.onHeard = onHeard || (() => {});
      this.onPartial = onPartial || (() => {});
      this.onState = onState || (() => {});
      this.listening = false;
      this.wanted = false;          // whether the user asked to be listening
      this.recognition = null;
      this.lang = lang || root.navigator?.language || "en-GB";
    }

    static get available() { return !!SpeechRecognition; }

    /** Why it is unavailable, in words worth showing someone. */
    static get reason() {
      if (SpeechRecognition) return null;
      if (!root.isSecureContext) {
        return "Listening needs a secure page. Use localhost, or start her with --https.";
      }
      return "This browser has no speech recognition. Chrome and Edge have it; " +
             "Firefox and Safari do not. Typing works everywhere.";
    }

    start() {
      if (!SpeechRecognition) throw new Error(Ears.reason);
      if (this.listening) return;

      const r = new SpeechRecognition();
      r.lang = this.lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;

      r.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript.trim();
          if (!text) continue;
          if (result.isFinal) this.onHeard(text, result[0].confidence);
          else this.onPartial(text);
        }
      };

      r.onerror = (event) => {
        /* "no-speech" and "aborted" are ordinary silence, not failures worth
         * showing anyone. Everything else is worth saying out loud. */
        if (event.error === "no-speech" || event.error === "aborted") return;
        this.onState({
          listening: false,
          error: event.error === "not-allowed"
            ? "The microphone was refused. Allow it in the address bar and try again."
            : `Listening stopped: ${event.error}`,
        });
      };

      /* Chrome ends the session on its own after a pause. If the user still
       * wants to be listening, start it again — otherwise she goes deaf after
       * the first silence and nobody knows why. */
      r.onend = () => {
        this.listening = false;
        if (this.wanted) {
          try { r.start(); this.listening = true; }
          catch { this.onState({ listening: false }); }
        } else {
          this.onState({ listening: false });
        }
      };

      this.recognition = r;
      this.wanted = true;
      r.start();
      this.listening = true;
      this.onState({ listening: true });
    }

    stop() {
      this.wanted = false;
      if (this.recognition) {
        try { this.recognition.stop(); } catch { /* already stopped */ }
      }
      this.listening = false;
      this.onState({ listening: false });
    }

    toggle() { this.wanted ? this.stop() : this.start(); }
  }

  /**
   * Her voice.
   *
   * Speech *synthesis* is local in every current browser — unlike recognition,
   * nothing is uploaded to read a sentence aloud.
   */
  class Voice {
    constructor() {
      this.enabled = false;
      this.synth = root.speechSynthesis || null;
    }

    static get available() { return !!root.speechSynthesis; }

    say(text) {
      if (!this.enabled || !this.synth || !text) return;
      // Cut it off mid-sentence if something newer arrives; stale speech is worse
      // than silence when she is answering live.
      this.synth.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 300));
      utterance.lang = root.navigator?.language || "en-GB";
      utterance.rate = 1.05;
      this.synth.speak(utterance);
    }

    stop() { if (this.synth) this.synth.cancel(); }
  }

  /**
   * Her eye, running alongside her ears.
   *
   * Holds the camera open and describes what it sees on a timer. Deliberately
   * slow — a Pi should not spend its cores describing a still room thirty times
   * a second, and nothing in a room changes that fast.
   */
  class Watching {
    constructor({ video, canvas, onScene, everyMs = 1500 } = {}) {
      this.video = video;
      this.canvas = canvas;
      this.onScene = onScene || (() => {});
      this.everyMs = everyMs;
      this.stream = null;
      this.timer = null;
      this.previous = null;
    }

    async start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser will not give a page the camera here. On another machine, start her with --https.");
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.timer = setInterval(() => this.look(), this.everyMs);
      this.look();
    }

    look() {
      const { video, canvas } = this;
      if (!video.videoWidth) return;
      const w = 160;
      const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);

      const Scene = root.Scene;
      if (!Scene) return;
      const scene = Scene.describe(image, this.previous);
      this.previous = scene;
      this.onScene(scene, Scene.report(scene));
    }

    stop() {
      clearInterval(this.timer);
      this.timer = null;
      for (const track of this.stream?.getTracks() || []) track.stop();
      this.stream = null;
      this.video.srcObject = null;
      this.previous = null;
    }

    get running() { return !!this.stream; }
  }

  const VoiceKit = { Ears, Voice, Watching };
  root.VoiceKit = VoiceKit;
  if (typeof module !== "undefined" && module.exports) module.exports = VoiceKit;
})(typeof self !== "undefined" ? self : globalThis);
