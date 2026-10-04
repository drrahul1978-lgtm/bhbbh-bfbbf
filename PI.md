# EVE on a Raspberry Pi 4

For a Pi 4 Model B with 4GB and a 32GB card. Nothing to compile, no GPIO
library, no dependencies at all.

---

## 1. Get her onto the Pi

```bash
sudo apt update
sudo apt install -y nodejs git
git clone -b claude/custom-ai-training-jhlq2v https://github.com/drrahul1978-lgtm/bhbbh-bfbbf.git eve
cd eve
npm test                 # everything should pass before you trust anything
npm run whereami         # she should say she is on a Raspberry Pi
```

`npm run whereami` is worth doing. If she does not identify the Pi, she will
size her work for an ordinary computer and be slower than she needs to be.

---

## 2. Wire the status light

Three LEDs and three resistors on a breadboard. **The resistors are not
optional** — a bare LED across a GPIO pin draws more current than the pin is
rated for and will damage the pin, the LED, or both.

| Colour | Means | GPIO (BCM) | Physical pin |
|---|---|---|---|
| 🔴 Red | Something is wrong with her | **17** | 11 |
| 🟡 Yellow | She needs you | **27** | 13 |
| 🟢 Green | She is fine | **22** | 15 |
| — | Ground, shared by all three | — | **9** (or 6, 14, 20, 25, 30, 34, 39) |

Those three were chosen because they have no second job. Many pins also carry
I2C, SPI or serial, and an LED on one of those fights whatever else wants it.

### Each LED, three times over

```
GPIO pin ──[ 330Ω ]──▶|── GND
                 long leg  short leg
                 (anode)   (cathode)
```

- **Resistor: 220Ω to 470Ω.** 330Ω is the usual choice. Anything in that range
  is fine; the exact value only changes how bright it is.
- **The LED only works one way round.** The long leg goes towards the GPIO pin,
  the short leg towards ground. Backwards it simply never lights — it is not
  damaged, so if one stays dark, turn it round first.
- The resistor can go on either leg. It does the same job in either place.

Physical pins 11, 13 and 15 are three in a row on the outer edge of the header,
which makes this easier to get right than the numbers suggest. Pin 9 is the
ground two rows back on the inner edge.

### One of the two tools she needs

She drives the pins by asking the system to, rather than through a native
library that would need a compiler. Install whichever you prefer:

```bash
sudo apt install raspi-utils     # gives her 'pinctrl'  (Pi OS Bookworm and later)
sudo apt install libgpiod-bin    # gives her 'gpioset'  (works on any Pi OS)
```

She finds whichever is there. With neither she still runs and still tracks her
state — the light simply does not light, and she says so at startup instead of
failing silently.

### Check the wiring before trusting it

```bash
node eve-pi.js --test
```

Red, then yellow, then green, two seconds each. Any that stays dark is that
LED, its resistor, or its direction — not her.

---

## 3. Run her

```bash
node eve-pi.js --serve      # drives the light, and listens on port 8099
node eve-proxy.js --open    # her pages, on port 8080
```

Two commands because they do genuinely different things: one watches her health
and owns the pins, the other serves her to a browser. Run the first on boot and
the second when you want to look at her.

To start the light on boot:

```bash
sudo tee /etc/systemd/system/eve-light.service >/dev/null <<'UNIT'
[Unit]
Description=EVE status light
After=network.target

[Service]
ExecStart=/usr/bin/node /home/pi/eve/eve-pi.js --serve
WorkingDirectory=/home/pi/eve
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl enable --now eve-light
```

---

## 4. What turns the light yellow

Yellow means she has hit something she will not guess at:

- **She saw an object she was never taught.** Point the camera at your phone
  before teaching her what a phone is, and the light goes yellow with the
  reason *"I can see an object I have never been taught, and I do not know what
  to do with it."*
- **She could not work out something you asked.**

It goes back to green the moment you tell her. A question she stops seeing
expires after thirty seconds, so the light does not sit yellow all evening
because something crossed the frame once.

**Red is different and more serious:** too hot, no disk space, the board being
throttled or under-volted, or her mind file unreadable. Red means fix something;
yellow means tell her something.

---

## 5. Teaching her your objects

She cannot name an object nobody has shown her — that needs a network trained on
millions of labelled photographs, which cannot be built from scratch or trained
on a Pi. What she does instead is learn **yours**, which for a device in your
house is the more useful half anyway.

Two ways, both in **👁️ See & teach**:

1. **Hold it up and name it.** Press *Take 8* and move it between shots. Five or
   six views is enough to start.
2. **Point her at a folder of photos.** Drop images into
   `training-images/<object>/` and she learns every folder at once. 30–40 photos
   per object is the sweet spot; 20 is the minimum worth having.

Photos taken in real rooms beat studio stock images, and it is not close — she
reads colour and edge layout, so a picture on a white background teaches her
"object on white" and then fails on your desk.

---

## 6. What she costs on a Pi 4

Measured, with the timings estimated at 8× this build machine. The memory
figure is a range because it varies between runs — quoting the lowest one I
saw would be the sort of number that is true once and misleading afterwards:

| | |
|---|---|
| Memory, peak across everything | **80–105MB** of a 400MB budget |
| Start up, mind loaded | under a second |
| Understand a sentence | ~4ms |
| One training round | ~3s |
| Written to the card, busy session | 0.85MB |
| Dependencies to install | **none** |

```bash
npm run test:pi      # re-measure it yourself
```

Writes are batched deliberately: an SD card wears out from writes, and she only
saves when a training round is actually kept.

---

## 7. Improve her overnight

```bash
node eve-learn.js --watch
```

She detects the Pi and sizes each round to it — 25 epochs rather than the 80 a
fast desktop gets. Rounds are kept only when they beat her best, so leaving this
running overnight can only improve her or leave her where she was.

Her mind is one file, `eve-intent.json`. Train her on a fast computer, copy that
file to the Pi, and she is as good there — the architecture is identical on every
machine, only the effort differs.
