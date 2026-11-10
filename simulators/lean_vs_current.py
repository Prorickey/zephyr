"""
Max lean angle the LQR from rwps_lqr.py can recover from, against how much current the flywheel motor may draw
from the battery. Same scooter, motor, flywheel and controller as rwps_lqr.py.

    python lean_vs_current.py      # writes results/lean_vs_current.png, lean_vs_battery_current.png and lean_vs_current.csv

Two ways of limiting current are swept:
    battery limit   the battery (ESC input) current is capped at I_batt, i.e. battery_max_power = V_pack I_batt.
                    The motor's own winding current is left at its 100 A rating.
    motor limit     the motor's winding current is capped (motor_max_current, what changing MOTOR in
                    rwps_lqr.py does) and the battery is uncapped. Each run records the peak current it
                    actually pulled from the battery, which places it on the same axis.

They differ because the ESC is a buck converter: at low wheel speed the motor needs only a few volts, so 30 A in
the windings can be ~2 A from the pack. Battery current only rises as the wheel spins up and back-EMF grows.

The recovery test starts the scooter at rest at lean theta_0 with the wheel stopped and runs the LQR (clipped to
the pack voltage, held between samples) with no push. It counts as recovered if the scooter is back within
SETTLED_DEG of upright at the end of RECOVERY_TIME without having fallen.
"""
import csv
import math
import os
from concurrent.futures import ProcessPoolExecutor

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from rwps_lqr import LQRSimulation, LOOP_PERIOD, SCOOTER_PACK_VOLTAGE, SCOOTER_PACK_POWER

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")

MOTOR_RATED_CURRENT = 100.0                       # (A) Flipsky 7070 KV110 max, used when only the battery is limited
BATTERY_LIMITS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14.6, 17, 20, 22.5, 25, 27.5, 30, 35, 40, 45, 50, 60]   # (A) 14.6 A = the 525 W cap
BATTERY_LABELS = (5, 10, 14.6, 20, 30)            # (A) points labeled with their angle on the battery-only chart
MOTOR_LIMITS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100]                     # (A)
RECOVERY_TIME = 6.0                               # (s)
SETTLED_DEG = 1.0                                 # (deg)
BISECTIONS = 14                                   # ~0.005 deg resolution on [0, 90]

INK, INK_MUTED, GRID = "#1f1f1e", "#6b6a66", "#e6e5e0"
SERIES_1, SERIES_2 = "#2a78d6", "#eb6834"         # categorical slots 1 and 2 of the dataviz reference palette


def make_sim(motor_current, battery_power):
    "An LQRSimulation with the limits swapped in. K doesn't depend on them: the doc's linear model has no clamps"
    lqr_sim = LQRSimulation()
    lqr_sim.sim.motor_max_current = motor_current
    lqr_sim.sim.battery_max_power = battery_power
    return lqr_sim


def battery_current(sim, voltage, phi_dot):
    """
    (A) Current drawn from the pack. The motor takes (K_e phi_dot + i R) i watts; an ideal ESC draws that from
    the pack at V_pack. Negative while regenerating.
    """
    i = sim.motor_torque(voltage, phi_dot) / sim.motor_kt
    return (sim.motor_ke * phi_dot + i * sim.motor_resistance) * i / sim.nominal_voltage


def recover(lqr_sim, theta_0):
    "(recovered, peak battery current in A, peak winding current in A) for one start at lean theta_0"
    lqr_sim.reset()
    sim = lqr_sim.sim
    sim.Y[0] = theta_0
    peak_battery = peak_motor = 0.0
    for _ in range(int(RECOVERY_TIME / LOOP_PERIOD)):
        lqr_sim.control_step(0.0)
        if lqr_sim.fallen:
            return False, peak_battery, peak_motor
        peak_battery = max(peak_battery, battery_current(sim, lqr_sim.voltage, sim.Y[2]))
        peak_motor = max(peak_motor, abs(lqr_sim.motor_current()))
    return abs(sim.Y[0]) < math.radians(SETTLED_DEG), peak_battery, peak_motor


def max_lean(limits):
    "Runs in a worker: (motor_current, battery_power) -> largest recoverable lean and what it drew to get there"
    motor_current, battery_power = limits
    lqr_sim = make_sim(motor_current, battery_power)
    low, high = 0.0, math.pi / 2
    peaks = (0.0, 0.0)
    for _ in range(BISECTIONS):
        mid = (low + high) / 2
        ok, peak_battery, peak_motor = recover(lqr_sim, mid)
        if ok:
            low, peaks = mid, (peak_battery, peak_motor)
        else:
            high = mid
    best = lqr_sim.sim.max_recovery_angle()   # bang-bang physical limit for the same plant, for reference
    return dict(motor_limit_a=motor_current,
                battery_limit_a=None if battery_power is None else battery_power / SCOOTER_PACK_VOLTAGE,
                lqr_max_lean_deg=math.degrees(low), physical_max_lean_deg=math.degrees(best),
                peak_battery_a=peaks[0], peak_motor_a=peaks[1])


def style(ax):
    ax.tick_params(labelsize=8, colors=INK_MUTED, length=0)
    ax.grid(color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)


def plot(battery_runs, motor_runs, path):
    fig, (left, right) = plt.subplots(1, 2, figsize=(13, 5.2), gridspec_kw=dict(wspace=0.22))

    # Left: everything on the battery-current axis
    left.plot([r["battery_limit_a"] for r in battery_runs], [r["lqr_max_lean_deg"] for r in battery_runs],
              "-o", lw=2, ms=6, color=SERIES_1, mec="white", mew=1.2, label="battery current capped (motor at 100 A)")
    left.plot([r["peak_battery_a"] for r in motor_runs], [r["lqr_max_lean_deg"] for r in motor_runs],
              "-o", lw=2, ms=6, color=SERIES_2, mec="white", mew=1.2,
              label="motor current capped, plotted at the peak battery current it drew")
    for r in motor_runs:
        if r["motor_limit_a"] in (10, 30, 60, 100):
            left.annotate(f'{r["motor_limit_a"]:g} A motor', (r["peak_battery_a"], r["lqr_max_lean_deg"]),
                          xytext=(6, -12), textcoords="offset points", fontsize=7.5, color=INK)
    cap = SCOOTER_PACK_POWER / SCOOTER_PACK_VOLTAGE
    left.axvline(cap, color=INK_MUTED, lw=1, ls="--")
    left.text(cap, 0.02, f"  pack cap in rwps_lqr.py\n  ({SCOOTER_PACK_POWER:.0f} W = {cap:.1f} A)",
              transform=left.get_xaxis_transform(), fontsize=7.5, color=INK_MUTED, va="bottom")
    left.set_xlim(0, None)
    left.set_ylim(0, None)
    left.set_xlabel("battery current (A)", fontsize=8, color=INK_MUTED)
    left.set_ylabel("max lean angle recovered (degrees)", fontsize=8, color=INK_MUTED)
    left.set_title("Max lean angle vs battery current", fontsize=11, color=INK, loc="left", pad=40)
    left.legend(loc="lower left", bbox_to_anchor=(0, 1.0), fontsize=8, frameon=False, borderaxespad=0.2)
    style(left)

    # Right: the experiment as run in rwps_lqr.py, x = motor_max_current
    right.plot([r["motor_limit_a"] for r in motor_runs], [r["lqr_max_lean_deg"] for r in motor_runs],
               "-o", lw=2, ms=6, color=SERIES_2, mec="white", mew=1.2)
    for r in motor_runs:
        if r["motor_limit_a"] in (10, 30, 60, 100):
            right.annotate(f'{r["peak_battery_a"]:.1f} A from pack', (r["motor_limit_a"], r["lqr_max_lean_deg"]),
                           xytext=(6, -12), textcoords="offset points", fontsize=7.5, color=INK)
    right.set_xlim(0, 118)
    right.set_ylim(0, left.get_ylim()[1])
    right.set_xlabel("motor_max_current (A)", fontsize=8, color=INK_MUTED)
    right.set_title("Max lean angle vs motor current limit (battery uncapped)", fontsize=11, color=INK, loc="left", pad=40)
    style(right)

    fig.text(0.125, -0.02, "VOLPAM 350W + Flipsky 7070 KV110, 3 kg rim flywheel r = 0.15 m, 36 V pack, LQR from "
             f"rwps_lqr.py. Recovered = back within {SETTLED_DEG:g}° of upright after {RECOVERY_TIME:g} s, "
             "starting at rest with the wheel stopped.", fontsize=7.5, color=INK_MUTED)
    fig.savefig(path, dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def plot_battery(battery_runs, uncapped_draw, path):
    "Max lean against the battery discharge limit alone, motor held at its 100 A rating"
    fig, ax = plt.subplots(figsize=(9, 5.4))
    limits = [r["battery_limit_a"] for r in battery_runs]
    angles = [r["lqr_max_lean_deg"] for r in battery_runs]
    ax.plot(limits, angles, "-o", lw=2, ms=6, color=SERIES_1, mec="white", mew=1.2)
    for r in battery_runs:
        if round(r["battery_limit_a"], 1) in BATTERY_LABELS:
            ax.annotate(f'{r["lqr_max_lean_deg"]:.1f}°', (r["battery_limit_a"], r["lqr_max_lean_deg"]),
                        xytext=(7, -13), textcoords="offset points", fontsize=8, color=INK)

    cap = SCOOTER_PACK_POWER / SCOOTER_PACK_VOLTAGE
    for x, text in ((cap, f"pack cap in rwps_lqr.py\n{SCOOTER_PACK_POWER:.0f} W = {cap:.1f} A"),
                    (uncapped_draw, f"most it ever draws\nuncapped: {uncapped_draw:.1f} A")):
        ax.axvline(x, color=INK_MUTED, lw=1, ls="--")
        ax.text(x + 0.6, 0.03, text, transform=ax.get_xaxis_transform(), fontsize=7.5, color=INK_MUTED, va="bottom")

    ax.set_xlim(0, max(limits) + 2)
    ax.set_ylim(0, max(angles) * 1.12)
    ax.set_xlabel("max battery discharge current (A)", fontsize=8, color=INK_MUTED)
    ax.set_ylabel("max lean angle recovered (degrees)", fontsize=8, color=INK_MUTED)
    ax.set_title("Max lean angle vs max battery discharge current (motor limit fixed at 100 A)",
                 fontsize=11, color=INK, loc="left", pad=10)
    style(ax)
    fig.text(0.125, -0.03, f"VOLPAM 350W + Flipsky 7070 KV110, 3 kg rim flywheel r = 0.15 m, {SCOOTER_PACK_VOLTAGE:g} V "
             f"pack, LQR from rwps_lqr.py, lossless ESC.\nRecovered = back within {SETTLED_DEG:g}° of upright after "
             f"{RECOVERY_TIME:g} s, starting at rest with the wheel stopped.", fontsize=7.5, color=INK_MUTED)
    fig.savefig(path, dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main():
    os.makedirs(RESULTS, exist_ok=True)
    jobs = ([(MOTOR_RATED_CURRENT, SCOOTER_PACK_VOLTAGE * i) for i in BATTERY_LIMITS]
            + [(i, None) for i in MOTOR_LIMITS])
    with ProcessPoolExecutor() as pool:
        runs = list(pool.map(max_lean, jobs))
    battery_runs, motor_runs = runs[:len(BATTERY_LIMITS)], runs[len(BATTERY_LIMITS):]

    with open(os.path.join(RESULTS, "lean_vs_current.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["sweep"] + list(runs[0]))
        writer.writeheader()
        writer.writerows([dict(sweep="battery_limit", **r) for r in battery_runs]
                         + [dict(sweep="motor_limit", **r) for r in motor_runs])
    plot(battery_runs, motor_runs, os.path.join(RESULTS, "lean_vs_current.png"))
    plot_battery(battery_runs, motor_runs[-1]["peak_battery_a"], os.path.join(RESULTS, "lean_vs_battery_current.png"))

    print(f"{'sweep':>8s} {'limit A':>8s} {'LQR deg':>8s} {'best deg':>9s} {'pack A':>7s} {'motor A':>8s}")
    for name, rows, key in (("battery", battery_runs, "battery_limit_a"), ("motor", motor_runs, "motor_limit_a")):
        for r in rows:
            print(f"{name:>8s} {r[key]:8.1f} {r['lqr_max_lean_deg']:8.2f} {r['physical_max_lean_deg']:9.2f} "
                  f"{r['peak_battery_a']:7.1f} {r['peak_motor_a']:8.1f}")


if __name__ == "__main__":
    main()
