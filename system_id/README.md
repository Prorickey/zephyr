# System identification

Measures the physical constants behind the LQR in `simulators/rwps_lqr.py`, on the real scooter.

| File | What it is |
|---|---|
| `system_id.ino` | ESP32 firmware. Same wiring as `lqr_balance`. Runs one test per command and prints each run as a CSV block. |
| `capture.py` | Serial console that saves each run to `data/` (`pip install pyserial`, then `python capture.py COM5`). |
| `analyze.py` | Reads `data/`, fits everything, writes plots and `results.json` to `results/`, and prints values to paste into `rwps_lqr.py`. |

If you'd rather use the Arduino Serial Monitor, copy its output into any `.txt` file in `data/`. `analyze.py` finds the
`#BEGIN ... #END` blocks and `#STATIC` lines in it, and it skips runs it has already seen in another file.

## What gets measured

With current as the input, the linear model only needs three ratios:

| Ratio | Meaning | Test |
|---|---|---|
| `a = Mg/J` | how fast it falls (λ = √a) | fall, `f 0` |
| `K_t/J` | frame acceleration per amp | fall with current pulses, `f 10` |
| `K_t/I_w` | wheel acceleration per amp | wheel, `w` |

Any **one** absolute measurement turns those into `I_w`, `K_t`, `J` and `Mg`. There are three independent ones, and
they should agree with each other:

* **drop test** (`d`): `I_w` from a falling mass. Uses no motor constants at all.
* **VESC FOC detection**: `K_t = 1.5 × pole pairs × flux linkage`. The detection you ran on 2026-11-21 gave
  6.96 mWb, so `K_t` = 0.0731 N·m/A. That's the default in `analyze.py` (`--flux-mwb`).
* **static tip test** (`s`): `Mg` with a kitchen scale.

The fall test also gives the **balance point** (the zero to save with `z` in `lqr_balance`), and the noise test shows
how much gyro noise the controller is amplifying and what low-pass cutoff to use.

## Procedure

Flash `system_id.ino` and keep the scooter still for the first ~3 s (gyro calibration). The sign constants at the top
must match `lqr_balance.ino`. In the VESC Tool, keep the motor current limit at or above 30 A and the UART timeout short.

1. **`b`**: gyro bias, scooter untouched. Repeat whenever the lean drifts while it's still.
2. **Noise**: frame propped or firmly held. Run `n 0`, `n 500`, `n 1500`.
3. **Wheel**: hold the frame upright and still, wheel stopped. Run `w 15` 2–3 times.
4. **Drop**, for flywheel inertia: frame held upright.
   - Tape a string to the rim, wind 1–2 m of it on, and hang a known mass. The string can sit in a groove or on tape
     at the rim, or on a hub of known radius.
   - Measure `r` to the *center* of the string.
   - Hold the wheel, send `d <grams> <r_mm>`, and let go when the LED goes solid. The motor stays off.
   - Use **2–3 different masses** (for example 250 g, 500 g and 1000 g), 2 drops each. Fitting a line through the
     different masses is what separates inertia from bearing and cogging friction.
   - Aim for at least about 0.5 s of spin-up per drop: more drop height or a lighter mass if it's shorter. Let the
     mass land on something soft, or let the string slip off the end, so the wheel coasts afterward.
5. **Fall**: **put soft stops at about ±15° first** (boxes, straps or a spotter).
   - Hold it near upright and still, send `f 0`, and let go cleanly when the LED goes solid. It stops logging at 12°.
   - Do 3+ falls each way. Then do `f 10` 3+ times each way. Those fire 120 ms current pulses that push back toward
     upright while it falls, which is what measures `K_t/J`.
6. **Static**: motor off. Lean the scooter to 30–45° with the wheels on the floor and not sliding. Rest the top of the
   stem, at its centerline, on a kitchen scale sitting on a box.
   - `L_cm` is the height of that support point above the floor when the scooter is upright.
   - Send `s <grams> <L_cm>`. Do 2–3 each side.
7. `python analyze.py`, then look at the plots in `results/`. In `fall.png` the dashed model should track the measured
   lean; if it doesn't for a run, that run is bad (usually the hand didn't let go cleanly). Delete the run's file
   and rerun the analysis.

Press `x`, space or the BOOT button to abort a test at any time.

## Off-scooter check for the flywheel (optional, no electronics)

Hang the wheel and motor rotor from three equal strings of length `L`, spaced evenly at radius `R` from the axle
(a trifilar pendulum). Twist it slightly and time 20 oscillations to get the period `T`. Then
`I = m g R² T² / (4 π² L)`. This should match the drop test, minus the motor can if that wasn't hung with it.
