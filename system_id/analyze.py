"""
Turns the system_id.ino test logs into the constants the LQR needs.

    python analyze.py                 reads system_id/data/ (the capture.py output, or Serial Monitor pastes saved as .txt)
    python analyze.py --data DIR      reads another folder
    python analyze.py --no-plots

Writes plots and results.json to system_id/results/ and prints a summary next to the values rwps_lqr.py assumes.

With current as the input, the linear model the LQR is designed on only needs three ratios:
    a  = Mg / J      (1/s^2)          fall test:   theta_ddot = a sin(theta - theta0) - (b/J) theta_dot - (K_t/J) i
    bJ = K_t / J     (rad/s^2 per A)  fall test with current pulses
    bW = K_t / I_w   (rad/s^2 per A)  wheel test:  I_w d(omega_abs)/dt = K_t i - friction
The static tip test gives Mg itself (N m, the doc's M g: total mass x g x center of mass height), and then
J = Mg / a, K_t = bJ J and I_w = K_t / bW.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter, savgol_filter, welch

HERE = Path(__file__).resolve().parent
G = 9.81


# ------------------------------------------------------------------ parsing ------------------------------------------
def parse_meta(line):
    return dict(kv.split("=", 1) for kv in line.split()[1:] if "=" in kv)


def load(data_dir):
    "All #BEGIN/#END runs and #STATIC lines in data_dir, de-duplicated (a run can be in a .csv and a pasted .txt)"
    runs, statics, seen = [], [], set()
    files = sorted(p for p in Path(data_dir).glob("*") if p.suffix in (".csv", ".txt", ".log")
                   and not p.name.startswith("session_"))
    for path in files:
        block = None
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line.startswith("#BEGIN"):
                block = [line]
            elif block is not None:
                block.append(line)
                if line.startswith("#END"):
                    digest = hashlib.sha1("\n".join(block).encode()).hexdigest()
                    if digest not in seen:
                        seen.add(digest)
                        run = parse_run(block, path.name)
                        if run is not None:
                            runs.append(run)
                    block = None
            elif line.startswith("#STATIC") and line not in seen:
                seen.add(line)
                m = parse_meta(line)
                statics.append(dict(grams=float(m["grams"]), L_cm=float(m["L_cm"]), lean_deg=float(m["lean_deg"]),
                                    lean_std_deg=float(m.get("lean_std_deg", 0)), source=path.name))
    return runs, statics


def parse_run(block, source):
    meta = parse_meta(block[0])
    rows = []
    for line in block[1:]:
        if not line or line.startswith("#"):
            continue
        try:
            rows.append([float(v) for v in line.split(",")])
        except ValueError:
            pass   # a line garbled in transit
    if len(rows) < 20:
        return None
    lengths = [len(r) for r in rows]
    ncol = max(set(lengths), key=lengths.count)   # 8 with the tachometer column, 7 without
    d = np.array([r for r in rows if len(r) == ncol])
    t_us = d[:, 0].astype(np.int64)
    steps = np.diff(t_us)
    steps[steps < 0] += 2**32
    t = np.concatenate([[0], np.cumsum(steps)]) * 1e-6
    return dict(test=meta.get("test"), run=meta.get("run"), meta=meta, source=source, t=t,
                rate=np.radians(d[:, 1]), acc=np.radians(d[:, 2]), omega=d[:, 3], icmd=d[:, 4], iq=d[:, 5],
                phase=d[:, 6].astype(int), tach=d[:, 7] if ncol >= 8 else None, label=f"{meta.get('test')} run {meta.get('run')} ({source})")


# ------------------------------------------------------------------ helpers ------------------------------------------
def odd(n):
    n = max(5, int(n))
    return n if n % 2 else n + 1


def derivative(x, dt, window_s=0.05, order=3):
    return savgol_filter(x, odd(window_s / dt), order, deriv=1, delta=dt)


def current_lag(icmd, iq, dt, max_s=0.03):
    "Samples by which the measured current trails the command (VESC loop + UART + telemetry one tick late)"
    if np.ptp(icmd) < 1e-3:
        return 0
    best, best_k = -np.inf, 0
    for k in range(0, int(max_s / dt) + 1):
        a, b = icmd[: len(icmd) - k], iq[k:]
        c = np.dot(a - a.mean(), b - b.mean())
        if c > best:
            best, best_k = c, k
    return best_k


def shift_back(x, k):
    "x(t + k samples): the value the delayed reading will show, moved back to when it really happened"
    return x if k == 0 else np.concatenate([x[k:], np.full(k, x[-1])])


def lstsq(X, y):
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ coef
    r2 = 1 - resid.var() / y.var() if y.var() > 0 else float("nan")
    return coef, r2, resid.std()


def spread(values):
    v = np.array([x for x in values if np.isfinite(x)])
    return (float(v.mean()), float(v.std(ddof=1)) if len(v) > 1 else float("nan"), len(v))


def fmt(mean, sd, n, digits=4):
    return f"{mean:.{digits}g}" + (f" +/- {sd:.2g} (n={n})" if np.isfinite(sd) else f" (n={n})")


# ------------------------------------------------------------------ model reference ----------------------------------
def model_reference():
    "What rwps_lqr.py currently assumes, so the results can be compared"
    sys.path.insert(0, str(HERE.parent / "simulators"))
    try:
        import rwps_lqr
        s = rwps_lqr.LQRSimulation()
    except Exception as e:   # noqa: BLE001 (report and carry on without the comparison)
        print(f"(couldn't load simulators/rwps_lqr.py for comparison: {e})")
        return None
    sim = s.sim
    mg = sim.gravitational_moment * sim.gravity
    return dict(Mg=mg, J=sim.total_inertia, Iw=sim.reaction_wheel_inertia, Kt=sim.motor_kt, R=sim.motor_resistance,
                a=mg / sim.total_inertia, bJ=sim.motor_kt / sim.total_inertia, bW=sim.motor_kt / sim.reaction_wheel_inertia,
                K=s.K.ravel().tolist(), wheel_motor_mass=sim.reaction_wheel_mass + sim.motor_mass,
                wheel_height=sim.reaction_wheel_height)


# ------------------------------------------------------------------ noise --------------------------------------------
def analyze_noise(runs, ref, plots):
    if not runs:
        return None
    amps_per_dps = abs(ref["K"][1]) * math.radians(1) / ref["R"] if ref else 15.3
    print("\n=== NOISE (frame still) ===")
    print(f"Through the current LQR, every 1 deg/s of rate noise is {amps_per_dps:.1f} A of motor current noise.")
    print(f"{'run':38s} {'wheel rpm':>9s} {'rate std':>9s} {'acc std':>8s}  rate std after a 2nd-order low-pass at"
          f"\n{'':38s} {'':>9s} {'(deg/s)':>9s} {'(deg)':>8s}   50 Hz   30 Hz   20 Hz   10 Hz   peaks (Hz)")
    out = []
    fig = None
    if plots:
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(9, 5))
    for r in runs:
        dt = np.median(np.diff(r["t"]))
        fs = 1 / dt
        rate = np.degrees(r["rate"] - r["rate"].mean())
        acc = np.degrees(r["acc"] - r["acc"].mean())
        rpm = np.mean(r["omega"]) * 60 / (2 * math.pi)
        filtered = {}
        for fc in (50, 30, 20, 10):
            if fc < fs / 2:
                b, a = butter(2, fc, fs=fs)
                filtered[fc] = float(lfilter(b, a, rate)[int(0.2 * fs):].std())
        f, psd = welch(rate, fs=fs, nperseg=min(1024, len(rate)))
        mask = f > 3
        peaks = f[mask][np.argsort(psd[mask])[-3:][::-1]]
        print(f"{r['label'][:38]:38s} {rpm:9.0f} {rate.std():9.3f} {acc.std():8.3f}  "
              + "  ".join(f"{filtered.get(fc, float('nan')):6.3f}" for fc in (50, 30, 20, 10))
              + "   " + ", ".join(f"{p:.0f}" for p in peaks))
        out.append(dict(run=r["label"], wheel_rpm=rpm, rate_std_dps=float(rate.std()), acc_std_deg=float(acc.std()),
                        rate_std_lowpass_dps=filtered, psd_peaks_hz=peaks.tolist()))
        if fig:
            ax.semilogy(f, psd, label=f"{rpm:.0f} rpm ({r['run']})", lw=1)
    if fig:
        ax.set_xlabel("Hz"); ax.set_ylabel("lean-rate PSD ((deg/s)^2/Hz)"); ax.grid(True, alpha=0.4); ax.legend()
        ax.set_title("Gyro lean-rate noise, frame still")
        fig.tight_layout(); fig.savefig(HERE / "results" / "noise_psd.png", dpi=120)
    print("A peak at the wheel's rotation frequency (rpm/60) is imbalance. Pick the lowest low-pass cutoff that still")
    print("sits well above the ~1-2 Hz balance dynamics (15-25 Hz is typical) and kills most of the noise.")
    return out


# ------------------------------------------------------------------ wheel --------------------------------------------
def analyze_wheel(runs, plots):
    if not runs:
        return None
    print("\n=== WHEEL (frame held, current steps) ===")
    rows, X_all, y_all, per_run = [], [], [], []
    if plots:
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(len(runs), 1, figsize=(10, 3 * len(runs)), squeeze=False)
    for n, r in enumerate(runs):
        dt = np.median(np.diff(r["t"]))
        lag = current_lag(r["icmd"], r["iq"], dt)
        i_act = shift_back(r["iq"], lag)
        w = r["omega"] + r["rate"]            # absolute wheel speed: relative speed + frame rate
        wdot = derivative(w, dt, window_s=0.1, order=2)
        drive = (r["phase"] >= 1) & (r["phase"] <= 5)
        change = np.flatnonzero(np.diff(r["icmd"]) != 0)
        near = np.zeros(len(w), bool)
        for c in change:
            near[max(0, c - int(0.06 / dt)): c + int(0.12 / dt)] = True
        use = drive & ~near
        sgn = np.sign(w) * (np.abs(w) > 1.0)
        X = np.column_stack([i_act, -sgn, -w])[use]
        y = wdot[use]
        coef, r2, sd = lstsq(X, y)
        X_all.append(X); y_all.append(y)
        # current tracking in the steady part of each nonzero segment
        track = [np.mean(i_act[use & (r["icmd"] == v)]) / v for v in np.unique(r["icmd"][drive]) if v != 0
                 and np.any(use & (r["icmd"] == v))]
        print(f"{r['label']}: K_t/I_w = {coef[0]:.3f} rad/s^2/A, Coulomb friction {coef[1]:.3f} rad/s^2, viscous "
              f"{coef[2]:.4f} 1/s, R^2 {r2:.3f}; current lags the command by {lag * dt * 1000:.0f} ms and reaches "
              + ", ".join(f"{x * 100:.0f}%" for x in track) + " of it")
        if np.max(np.abs(r["iq"])) < 0.5:
            print("   WARNING: iq is ~0 the whole run. Is the VESC reporting iq (FOC mode)?")
        per_run.append(dict(run=r["label"], bW=coef[0], coulomb=coef[1], viscous=coef[2], r2=r2, lag_ms=lag * dt * 1e3,
                            tracking=track))
        if plots:
            ax = axes[n, 0]
            fit = np.cumsum(np.column_stack([i_act, -sgn, -w]) @ coef) * dt
            ax.plot(r["t"], w, label="wheel speed (abs)")
            ax.plot(r["t"], w[0] + fit, "--", label="fitted model")
            ax2 = ax.twinx(); ax2.plot(r["t"], r["icmd"], "k:", lw=1); ax2.plot(r["t"], r["iq"], "r", lw=0.6, alpha=0.6)
            ax2.set_ylabel("A"); ax.set_ylabel("rad/s"); ax.set_title(r["label"], fontsize=9); ax.legend(fontsize=8)
    pooled, r2, _ = lstsq(np.vstack(X_all), np.concatenate(y_all))
    m, s, k = spread([p["bW"] for p in per_run])
    print(f"K_t/I_w per run: {fmt(m, s, k)}   pooled: {pooled[0]:.4f} rad/s^2/A")
    if plots:
        fig.tight_layout(); fig.savefig(HERE / "results" / "wheel.png", dpi=120)
    return dict(bW=float(pooled[0]), bW_spread=s, coulomb=float(pooled[1]), viscous=float(pooled[2]), runs=per_run)


# ------------------------------------------------------------------ fall ---------------------------------------------
def fall_segment(r):
    "theta (absolute, rad) from the gyro, anchored to the accelerometer while it was held still, and the free part"
    dt = np.median(np.diff(r["t"]))
    theta = np.concatenate([[0], np.cumsum((r["rate"][1:] + r["rate"][:-1]) / 2 * np.diff(r["t"]))])
    hold = np.flatnonzero(r["phase"] == 0)
    if len(hold) < 20:
        return None
    hold = hold[-int(0.3 / dt):]
    theta += np.mean(r["acc"][hold] - theta[hold])
    free = np.flatnonzero(r["phase"] == 1)
    if len(free) < 40:
        return None
    start = free[0] + int(0.25 / dt)   # skip the moment the hand lets go
    # End before it reaches the stops: past stop_deg, or once the lean rate stops growing (it hit something)
    stop = math.radians(float(r["meta"].get("stop_deg", 12)))
    end = free[-1]
    past = free[np.abs(theta[free]) > stop]
    if len(past):
        end = min(end, past[0])
    peak = free[0] + int(np.argmax(np.abs(r["rate"][free])))
    end = min(end, peak - int(0.02 / dt))
    seg = np.arange(start, end + 1)
    if len(seg) < 30:
        return None
    return dt, theta, seg


def check_gyro_sign(runs):
    """
    In a fall the accelerometer lean and the integrated gyro must move the same way. Returns -1 if they move
    opposite ways in most runs (LEAN_GYRO_SIGN or LEAN_ACCEL_SIGN is wrong in the firmware), else +1.
    """
    votes = []
    for r in runs:
        free = np.flatnonzero(r["phase"] == 1)
        if len(free) < 40:
            continue
        t, acc = r["t"], r["acc"]
        g = np.concatenate([[0], np.cumsum((r["rate"][1:] + r["rate"][:-1]) / 2 * np.diff(t))])
        sel = free[np.abs(acc[free] - acc[free[0]]) < math.radians(10)]   # before the stops and big tangential accel
        if len(sel) < 20 or np.ptp(g[sel]) < math.radians(1):
            continue
        votes.append(np.sign(np.polyfit(g[sel] - g[sel][0], acc[sel] - acc[sel][0], 1)[0]))
    if votes and sum(votes) < 0:
        print("\n" + "!" * 78)
        print(f"GYRO AND ACCELEROMETER DISAGREE ON THE LEAN DIRECTION in {votes.count(-1)} of {len(votes)} falls.")
        print("LEAN_GYRO_SIGN or LEAN_ACCEL_SIGN is wrong in system_id.ino AND lqr_balance.ino. Check which with 'p':")
        print("lean the scooter LEFT (viewed from behind): acc and rate must both go positive. Flip the one that doesn't.")
        print("!" * 78)
        return -1
    return 1


def analyze_fall(runs, plots):
    if not runs:
        return None
    print("\n=== FALL (frame free) ===")
    prepared, per_run = [], []
    for r in runs:
        got = fall_segment(r)
        if got is None:
            print(f"{r['label']}: too little free-fall data (did it fall before the LED went solid?), skipped")
            continue
        dt, theta, seg = got
        tdd = derivative(r["rate"], dt, 0.05, 3)
        lag = current_lag(r["icmd"], r["iq"], dt)
        i_act = shift_back(r["iq"], lag) if np.ptp(r["icmd"]) > 0 else np.zeros_like(r["iq"])
        has_current = np.ptp(i_act[seg]) > 1.0
        # No pivot-damping term: while it falls theta_dot ~ lambda (theta - theta0), so damping and Mg/J are almost
        # perfectly collinear and a fall only pins down their combination. Tire-pivot damping is small, so it's left out
        # and a is the effective value (the growth rate is what the LQR needs to beat anyway).
        cols = [np.sin(theta), np.cos(theta)] + ([-i_act] if has_current else [])
        X = np.column_stack(cols)[seg]
        y = tdd[seg]
        coef, r2, sd = lstsq(X, y)
        a = math.hypot(coef[0], coef[1])
        theta0 = math.atan2(-coef[1], coef[0])
        bJ = coef[2] if has_current else float("nan")
        side = "left" if np.mean(theta[seg]) > theta0 else "right"
        print(f"{r['label']}: falls {side}, a = Mg/J {a:.2f} 1/s^2 (lambda {math.sqrt(max(a, 0)):.2f} 1/s), "
              f"balance point {math.degrees(theta0):+.2f} deg"
              + (f", K_t/J {bJ:.4f} rad/s^2/A (lag {lag * dt * 1e3:.0f} ms)" if has_current else "")
              + f", R^2 {r2:.3f}")
        per_run.append(dict(run=r["label"], a=a, theta0_deg=math.degrees(theta0), bJ=bJ, r2=r2,
                            side=side, lean_offset_saved_deg=float(r["meta"].get("lean_offset_deg", "nan"))))
        prepared.append(dict(r=r, dt=dt, theta=theta, seg=seg, tdd=tdd, i_act=i_act, has_current=has_current))
    if not prepared:
        return None

    # Pooled: one a, b/J and K_t/J for every run, but each run keeps its own small angle offset (the hand-held start
    # angle from the accelerometer is only good to ~0.1 deg)
    nrun = len(prepared)
    rows, ys = [], []
    for k, p in enumerate(prepared):
        s = p["seg"]
        off = np.zeros((len(s), nrun)); off[:, k] = np.cos(p["theta"][s])
        rows.append(np.column_stack([np.sin(p["theta"][s]), -p["i_act"][s], off]))
        ys.append(p["tdd"][s])
    X, y = np.vstack(rows), np.concatenate(ys)
    any_current = any(p["has_current"] for p in prepared)
    if not any_current:
        X = np.delete(X, 1, axis=1)
    coef, r2, _ = lstsq(X, y)
    a_pooled = coef[0]
    bJ_pooled = coef[1] if any_current else float("nan")
    offsets = coef[2:] if any_current else coef[1:]
    theta0s = np.degrees(np.arctan2(-offsets, a_pooled))

    am, asd, an = spread([p["a"] for p in per_run])
    print(f"Mg/J per run: {fmt(am, asd, an)} 1/s^2   pooled: {a_pooled:.3f} 1/s^2  "
          f"(falls with a {1 / math.sqrt(a_pooled):.3f} s time constant)")
    if any_current:
        bm, bsd, bn = spread([p["bJ"] for p in per_run])
        print(f"K_t/J per run:  {fmt(bm, bsd, bn)} rad/s^2/A   pooled: {bJ_pooled:.4f} rad/s^2/A")
    else:
        print("K_t/J: no runs with current pulses yet. Run 'f 10' a few times each way to measure it.")
    t0m, t0sd, t0n = spread(theta0s)
    sides = {p["side"] for p in per_run}
    print(f"Balance point (accelerometer frame): {fmt(t0m, t0sd, t0n, 3)} deg; lqr_balance's saved zero is "
          f"{per_run[0]['lean_offset_saved_deg']:+.2f} deg")
    if sides != {"left", "right"}:
        print("  (all falls went the same way. Falls to both sides pin down the balance point much better)")

    if plots:
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(nrun, 1, figsize=(9, 2.6 * nrun), squeeze=False)
        for k, p in enumerate(prepared):
            r, s, dt = p["r"], p["seg"], p["dt"]
            th, thd = p["theta"][s[0]], r["rate"][s[0]]
            sim = []
            th0 = math.radians(theta0s[k])
            restart = int(0.25 / dt)
            for n, j in enumerate(s):
                # Re-simulate with the pooled fit and the measured current, restarting from the measured state every
                # 0.25 s: the fall is unstable, so one long simulation drifts off from tiny errors even when the fit
                # is good. Each 0.25 s piece should follow the measurement.
                if n % restart == 0:
                    th, thd = p["theta"][j], r["rate"][j]
                    sim.append(np.nan)
                    continue
                sim.append(th)
                acc = a_pooled * math.sin(th - th0) - (bJ_pooled * p["i_act"][j] if any_current else 0)
                thd += acc * dt; th += thd * dt
            ax = axes[k, 0]
            ax.plot(r["t"], np.degrees(p["theta"]), label="measured (gyro)")
            ax.plot(r["t"][s], np.degrees(sim), "--", label="pooled model, restarted every 0.25 s")
            ax.plot(r["t"], np.degrees(r["acc"]), lw=0.5, alpha=0.5, label="accelerometer")
            ax.set_ylabel("lean (deg)"); ax.set_title(r["label"], fontsize=9); ax.legend(fontsize=7); ax.grid(alpha=0.3)
        fig.tight_layout(); fig.savefig(HERE / "results" / "fall.png", dpi=120)
    return dict(a=float(a_pooled), a_spread=asd, bJ=float(bJ_pooled), bJ_spread=(bsd if any_current else float("nan")),
                theta0_deg=t0m, theta0_spread_deg=t0sd, runs=per_run)


# ------------------------------------------------------------------ static -------------------------------------------
def analyze_static(statics, theta0_deg):
    if not statics:
        return None
    print("\n=== STATIC TIP TEST ===")
    th0 = math.radians(theta0_deg if theta0_deg is not None and np.isfinite(theta0_deg) else 0.0)
    if theta0_deg is None:
        print("(no fall runs, so the balance point is taken as 0 deg; average left and right leans to cancel it)")
    vals = {"left": [], "right": []}
    for s in statics:
        th = math.radians(s["lean_deg"])
        if abs(th) < math.radians(15):
            print(f"  {s['grams']:.0f} g at {s['lean_deg']:.1f} deg: lean it further (30-45 deg), skipped")
            continue
        F = s["grams"] / 1000 * G
        mg = F * s["L_cm"] / 100 * math.sin(th) / math.sin(th - th0)
        side = "left" if th > 0 else "right"
        vals[side].append(mg)
        print(f"  {side:5s} {s['lean_deg']:+6.1f} deg  {s['grams']:7.0f} g at L = {s['L_cm']:.1f} cm  ->  Mg = {mg:.2f} N m")
    allv = vals["left"] + vals["right"]
    if not allv:
        return None
    if vals["left"] and vals["right"]:
        mg = (np.mean(vals["left"]) + np.mean(vals["right"])) / 2
    else:
        mg = float(np.mean(allv))
    m, s, n = spread(allv)
    print(f"Mg = {mg:.2f} N m (spread {s:.2g} over {n}); that is m*h = {mg / G:.3f} kg m")
    return dict(Mg=float(mg), Mg_spread=s, left=vals["left"], right=vals["right"])


# ------------------------------------------------------------------ drop ---------------------------------------------
def analyze_drop(runs, plots):
    """
    A mass m on a string at radius r spins the unpowered wheel up. While it falls:
        m r (g - r alpha) = I_w alpha + tau_f
    The left side is known from each run's alpha, so a line through runs with different masses gives I_w (slope)
    and the friction torque tau_f (intercept). No motor constant is involved.
    """
    if not runs:
        return None
    print("\n=== DROP (hanging mass spins the unpowered wheel) ===")
    pts = []
    if plots:
        import matplotlib.pyplot as plt
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))
    for r in runs:
        m, rad = float(r["meta"]["a"]) / 1000, float(r["meta"]["b"]) / 1000
        dt = np.median(np.diff(r["t"]))
        t = r["t"]
        w_int = np.concatenate([[0], np.cumsum((r["omega"][1:] + r["omega"][:-1]) / 2 * np.diff(t))])
        phi, source = w_int, "integrated RPM"
        if r["tach"] is not None and np.ptp(r["tach"]) > 20:
            # VESC tachometer: 6 counts per electrical revolution. Check its scale against the RPM before using it
            phi_t = r["tach"] * 2 * math.pi / (6 * float(r["meta"].get("pole_pairs", 7)))
            moving = np.abs(r["omega"]) > 2
            if moving.sum() > 20:
                scale = np.polyfit(w_int[moving], phi_t[moving], 1)[0]
                if abs(abs(scale) - 1) < 0.1:
                    phi, source = phi_t * np.sign(scale), "tachometer"
                else:
                    print(f"   {r['label']}: tachometer disagrees with the RPM by {abs(scale):.2f}x, using RPM")
        if np.mean(phi[-10:]) < np.mean(phi[:10]):   # the string can turn it either way
            phi = -phi
        w = derivative(phi, dt, 0.1, 2)
        moving = np.flatnonzero(np.abs(phi - phi[0]) > 0.15)
        if len(moving) < 10:
            print(f"{r['label']}: the wheel hardly moved, skipped")
            continue
        i0 = moving[0]
        # End of spin-up: the first time the speed reaches 95% of its peak. (The argmax itself can land anywhere in
        # a slow coast-down after the mass lands, since the speed barely drops there.)
        w_smooth = derivative(phi, dt, 0.2, 2)
        ipk = i0 + int(np.argmax(w_smooth[i0:] >= 0.95 * w_smooth[i0:].max()))
        a_idx = np.arange(i0 + int(0.1 / dt), ipk - int(0.08 / dt))
        if len(a_idx) < int(0.3 / dt):
            print(f"{r['label']}: under 0.3 s of clean spin-up (more drop height or a lighter mass), skipped")
            continue
        tt = t[a_idx] - t[a_idx[0]]
        c = np.polyfit(tt, phi[a_idx], 2)
        alpha = 2 * c[0]
        fit_resid = phi[a_idx] - np.polyval(c, tt)
        # coast after the mass lands or the string comes off, if the wheel kept turning
        coast = np.arange(ipk + int(0.15 / dt), len(w))
        coast = coast[w[coast] > 0.3 * w[ipk]]
        alpha_c = np.polyfit(t[coast], w[coast], 1)[0] if len(coast) > int(0.5 / dt) else float("nan")
        y = m * rad * (G - rad * alpha)
        pts.append(dict(run=r["label"], grams=m * 1000, r_mm=rad * 1000, alpha=alpha, y=y, coast_alpha=alpha_c,
                        peak_rpm=w[ipk] * 60 / (2 * math.pi), source=source))
        print(f"{r['label']}: {m * 1000:.0f} g at r = {rad * 1000:.1f} mm, spin-up {alpha:.3f} rad/s^2 over "
              f"{tt[-1]:.2f} s ({source}, fit residual {np.degrees(fit_resid.std()):.1f} deg), up to "
              f"{w[ipk] * 60 / (2 * math.pi):.0f} rpm" + (f", coast {alpha_c:.3f} rad/s^2" if np.isfinite(alpha_c) else ""))
        if plots:
            ax1.plot(t, w, label=f"{m * 1000:.0f} g ({r['run']})")
            ax1.plot(t[a_idx], np.polyval(np.polyder(c), tt), "k--", lw=1)
    if not pts:
        return None
    x = np.array([p["alpha"] for p in pts])
    y = np.array([p["y"] for p in pts])
    masses = {round(p["grams"]) for p in pts}
    coasts = [p["coast_alpha"] for p in pts if np.isfinite(p["coast_alpha"])]
    sd = float("nan")
    if len(masses) >= 2 and np.ptp(x) > 0.2 * np.mean(x):
        if len(pts) > 2:
            (iw, tau_f), cov = np.polyfit(x, y, 1, cov=True)
            sd = math.sqrt(cov[0, 0])
        else:
            iw, tau_f = np.polyfit(x, y, 1)
        how = f"line through {len(pts)} runs, {len(masses)} masses"
    elif coasts:
        ac = abs(np.mean(coasts))   # one mass: friction from the coast-down instead (tau_f = I_w |alpha_coast|)
        each = y / (x + ac)
        iw, tau_f = float(each.mean()), float(each.mean() * ac)
        sd = float(each.std(ddof=1)) if len(each) > 1 else sd
        how = f"one mass, friction from the coast-down ({ac:.3f} rad/s^2)"
    else:
        each = y / x
        iw, tau_f = float(each.mean()), 0.0
        sd = float(each.std(ddof=1)) if len(each) > 1 else sd
        how = "one mass and no coast-down, so friction is IGNORED and I_w comes out high. Add a second mass"
    print(f"I_w = {iw:.5f} kg m^2" + (f" +/- {sd:.2g}" if np.isfinite(sd) else "")
          + f", friction torque {tau_f:.4f} N m  [{how}]")
    if plots:
        ax1.set_xlabel("s"); ax1.set_ylabel("wheel speed (rad/s)"); ax1.legend(fontsize=8); ax1.grid(alpha=0.3)
        ax2.plot(x, y, "o")
        xs = np.linspace(0, x.max() * 1.1, 10)
        ax2.plot(xs, iw * xs + tau_f, "--", label=f"I_w = {iw:.4f}, tau_f = {tau_f:.3f}")
        ax2.set_xlabel("alpha (rad/s^2)"); ax2.set_ylabel("m r (g - r alpha)  (N m)"); ax2.legend(); ax2.grid(alpha=0.3)
        fig.tight_layout(); fig.savefig(HERE / "results" / "drop.png", dpi=120)
    return dict(Iw=float(iw), Iw_sd=sd, friction_torque=float(tau_f), method=how, runs=pts)


# ------------------------------------------------------------------ summary ------------------------------------------
def summary(ref, fall, wheel, static, drop, kt_flux):
    """
    The three ratios come from the fall and wheel tests. Any ONE absolute measurement then fixes everything:
        drop test  I_w -> K_t = I_w bW,   J = K_t / bJ,  Mg = a J
        VESC flux  K_t -> I_w = K_t / bW, J = K_t / bJ,  Mg = a J
        static     Mg  -> J = Mg / a,     K_t = bJ J,    I_w = K_t / bW
    They should agree. The final values use the drop test if there is one, else the flux linkage, else the static test.
    """
    print("\n" + "=" * 78)
    print("SUMMARY (model = what rwps_lqr.py assumes now)")
    nan = float("nan")
    a = fall["a"] if fall else nan
    bJ = fall["bJ"] if fall else nan
    bW = wheel["bW"] if wheel else nan
    routes = {}
    if drop:
        iw = drop["Iw"]; kt = iw * bW; J = kt / bJ
        routes["drop test I_w"] = dict(Iw=iw, Kt=kt, J=J, Mg=a * J)
    if kt_flux:
        J = kt_flux / bJ
        routes["VESC flux K_t"] = dict(Iw=kt_flux / bW, Kt=kt_flux, J=J, Mg=a * J)
    if static:
        J = static["Mg"] / a; kt = bJ * J
        routes["static Mg"] = dict(Iw=kt / bW, Kt=kt, J=J, Mg=static["Mg"])

    print(f"{'ratio':22s} {'measured':>10s} {'model':>10s} {'meas/model':>11s}")
    for name, key in (("Mg/J (1/s^2)", "a"), ("K_t/J (rad/s^2/A)", "bJ"), ("K_t/I_w (rad/s^2/A)", "bW")):
        v = dict(a=a, bJ=bJ, bW=bW)[key]
        mv = ref[key] if ref else nan
        print(f"{name:22s} {v:10.4g} {mv:10.4g} {v / mv:11.2f}")
    if routes:
        names = list(routes)
        print(f"\n{'anchored on:':22s}" + "".join(f"{n:>16s}" for n in names) + f"{'model':>10s}")
        for key, label in (("Iw", "I_w (kg m^2)"), ("Kt", "K_t (N m/A)"), ("J", "J (kg m^2)"), ("Mg", "Mg (N m)")):
            print(f"{label:22s}" + "".join(f"{routes[n][key]:16.4g}" for n in names)
                  + f"{(ref[key] if ref else nan):10.4g}")
        kts = [routes[n]["Kt"] for n in names if np.isfinite(routes[n]["Kt"])]
        if len(kts) > 1:
            print(f"The anchors agree to within {100 * (max(kts) / min(kts) - 1):.0f}% "
                  "(under ~15% is good; more means one of the tests needs a redo)")
    if fall:
        print(f"\nbalance point: {fall['theta0_deg']:+.2f} deg (accelerometer frame)")
    missing = [n for n, v in (("fall test (f 0)", a), ("fall test with pulses (f 10)", bJ), ("wheel test (w)", bW))
               if not np.isfinite(v)]
    if missing:
        print("Still needed: " + ", ".join(missing))
    res = dict(a=a, bJ=bJ, bW=bW, Kt_flux=kt_flux, routes=routes)
    final = next((routes[n] for n in ("drop test I_w", "VESC flux K_t", "static Mg") if n in routes), None)
    if final and ref and all(np.isfinite(list(final.values()))):
        res.update(final)
        mw, L2 = ref["wheel_motor_mass"], ref["wheel_height"]
        print("\nFor simulators/rwps_lqr.py (keeps its wheel + motor mass and height, absorbs the rest into the frame):")
        print(f"    frame_moment = {final['Mg'] / G - mw * L2:.4f}        # (kg m) was {ref['Mg'] / G - mw * L2:.4f}")
        print(f"    frame_inertia = {final['J'] - mw * L2**2:.4f}       # (kg m^2) was {ref['J'] - mw * L2**2:.4f}")
        print(f"    reaction_wheel_inertia = {final['Iw']:.5f}")
        print(f"    motor_kt = {final['Kt']:.5f}             # also MOTOR_KE in lqr_balance.ino")
    return res


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(HERE / "data"))
    parser.add_argument("--no-plots", action="store_true")
    # VESC Tool FOC detection (2026-11-21): R 26.10 mOhm, L 42.72 uH, flux linkage 6.96 mWb, hall sensors.
    # VESC torque per amp of its current command (iq) is 1.5 * pole_pairs * flux_linkage.
    parser.add_argument("--flux-mwb", type=float, default=6.96, help="VESC FOC detection flux linkage (mWb), 0 to ignore")
    parser.add_argument("--pole-pairs", type=float, default=7)
    args = parser.parse_args()
    plots = not args.no_plots
    if plots:
        import matplotlib
        matplotlib.use("Agg")
    (HERE / "results").mkdir(exist_ok=True)

    runs, statics = load(args.data)
    if not runs and not statics:
        print(f"No test data in {args.data}")
        return
    by_test = {}
    for r in runs:
        by_test.setdefault(r["test"], []).append(r)
    print("Found: " + ", ".join(f"{len(v)} {k}" for k, v in by_test.items())
          + (f", {len(statics)} static" if statics else ""))
    for r in runs:
        if r["meta"].get("aborted") == "yes":
            print(f"  note: {r['label']} was aborted early")

    ref = model_reference()
    results = {}
    # Runs logged before 2026-11-21's fix used LEAN_GYRO_SIGN = +1, which the fall tests and the 'p' check showed is
    # backwards (their logs have no lean_gyro_sign field). Flip their gyro so old and new runs can be pooled.
    old = [r for r in runs if "lean_gyro_sign" not in r["meta"]]
    for r in old:
        r["rate"] = -r["rate"]
    if old:
        print(f"({len(old)} runs from before the gyro sign fix had their gyro flipped)")
    results["old_runs_gyro_flipped"] = len(old)
    check_gyro_sign(by_test.get("fall", []))   # warns if the signs disagree again
    results["noise"] = analyze_noise(by_test.get("noise", []), ref, plots)
    results["wheel"] = analyze_wheel(by_test.get("wheel", []), plots)
    results["fall"] = analyze_fall(by_test.get("fall", []), plots)
    results["static"] = analyze_static(statics, results["fall"]["theta0_deg"] if results["fall"] else None)
    kt_flux = 1.5 * args.pole_pairs * args.flux_mwb * 1e-3 if args.flux_mwb > 0 else None
    if kt_flux:
        print(f"K_t from the VESC flux linkage: 1.5 x {args.pole_pairs:.0f} x {args.flux_mwb} mWb = {kt_flux:.4f} N m/A")
    results["drop"] = analyze_drop(by_test.get("drop", []), plots)
    results["summary"] = summary(ref, results["fall"], results["wheel"], results["static"], results["drop"], kt_flux)
    results["model"] = ref

    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.floating, float)):
            return None if not np.isfinite(o) else float(o)
        if isinstance(o, np.integer):
            return int(o)
        return o

    (HERE / "results" / "results.json").write_text(json.dumps(clean(results), indent=2))
    print(f"\nWrote {HERE / 'results' / 'results.json'}" + (" and plots" if plots else ""))


if __name__ == "__main__":
    main()
