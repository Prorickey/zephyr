"""
Compares every scooter in scooters.json against every flywheel motor in motors.json using the reaction-wheel
pendulum simulator, and reports the max lean angle each pairing can recover from.

    python compare.py            # writes results/<flywheel>/*.png, recovery_matrix.csv and top_combinations.json

Two cases are simulated for each pairing:
    pack-limited   the flywheel motor runs off the scooter's own battery, capped at the pack's peak power
    uncapped       the flywheel motor has its own battery that can supply whatever the motor draws
"""
import csv
import json
import math
import os
from concurrent.futures import ProcessPoolExecutor

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

from rwps_v2 import ScooterReversePendulumReactionWheel

HERE = os.path.dirname(os.path.abspath(__file__))

# Flywheel bolted to motors that aren't their own flywheel (hub motors are). The simulator's own default is a
# 1 kg solid disk (mass 1.0, shape 0.5).
FLYWHEEL_MASS = 3.0          # (kg)
FLYWHEEL_RADIUS = 0.15       # (m)
FLYWHEEL_SHAPE = 0.9         # I_w = shape * m * r^2. 0.5 is a solid disk, ~0.9 a rim-weighted ring with a light hub
REACTION_WHEEL_HEIGHT = 0.3  # (m) L_2
FLYWHEEL_KIND = "disk" if FLYWHEEL_SHAPE == 0.5 else "rim" if FLYWHEEL_SHAPE >= 0.8 else f"shape {FLYWHEEL_SHAPE:g}"
FLYWHEEL_LABEL = f"{FLYWHEEL_MASS:g} kg {FLYWHEEL_KIND}, r = {FLYWHEEL_RADIUS:g} m"

# Each flywheel gets its own folder so runs can be compared
RESULTS = os.path.join(HERE, "results", f"flywheel_{FLYWHEEL_MASS:g}kg_shape{FLYWHEEL_SHAPE:g}_r{FLYWHEEL_RADIUS:g}")

# Scooter mass model. Manufacturers publish total weight and overall height only, so every scooter gets the
# same split: handlebars, a stem/fork rod, the battery, and everything else lumped just above the axles.
HANDLEBAR_MASS = 2.0         # (kg)
STEM_MASS_FRACTION = 0.19    # stem, fork and folding joint as a share of net weight
PACK_WH_PER_KG = 140.0       # pack-level energy density of a commuter scooter battery
STEM_BATTERY_HEIGHT = 0.6    # (m) center of a battery carried inside the stem
PEAK_POWER_FALLBACK = 1.5    # pack peak power = this * rated drive power when no peak is published

# Sequential blue ramp, light -> dark
BLUES = LinearSegmentedColormap.from_list("blues", ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"])
INK, INK_MUTED, HIGHLIGHT, CONTEXT = "#1f1f1e", "#6b6a66", "#2a78d6", "#c4c3be"


SCOOTER_NEEDS = ("price_usd", "net_weight_kg", "overall_height_m", "tire_diameter_in", "battery_voltage_v", "battery_wh")
MOTOR_NEEDS = ("price_usd", "kt_nm_per_a", "resistance_ohm_line_to_line", "max_current_a", "mass_kg")


def resolve(entry, needs):
    """
    Copy of a JSON entry with nulls filled from its sim_assumptions block (values nobody publishes, each with
    a reason in the file). Returns None when something the simulator needs is still missing.
    """
    entry = dict(entry)
    for key, value in entry.get("sim_assumptions", {}).items():
        if key != "reason" and entry.get(key) is None:
            entry[key] = value
    return None if any(entry.get(key) is None for key in needs) else entry


def scooter_kwargs(scooter):
    "Simulator keyword arguments for one scooters.json entry"
    net = scooter["net_weight_kg"]
    stem_length = scooter["overall_height_m"] - 0.03                 # L_1: bar center sits just under the top
    low_height = scooter["tire_diameter_in"] * 0.0254 / 2 + 0.013     # deck lump, just above the axles
    stem_mass = STEM_MASS_FRACTION * net
    stem_bottom, stem_top = 0.15, stem_length - 0.05
    stem_center, stem_span = (stem_bottom + stem_top) / 2, stem_top - stem_bottom
    battery_mass = scooter["battery_wh"] / PACK_WH_PER_KG
    battery_height = STEM_BATTERY_HEIGHT if scooter.get("battery_location") == "stem" else low_height
    low_mass = net - HANDLEBAR_MASS - stem_mass - battery_mass

    frame_moment = (HANDLEBAR_MASS * stem_length + stem_mass * stem_center
                    + battery_mass * battery_height + low_mass * low_height)
    frame_inertia = (HANDLEBAR_MASS * stem_length**2 + stem_mass * (stem_center**2 + stem_span**2 / 12)
                     + battery_mass * battery_height**2 + low_mass * low_height**2)
    body_mass = net - HANDLEBAR_MASS
    return dict(handlebar_mass=HANDLEBAR_MASS, body_mass=body_mass, stem_length=stem_length,
                body_com_height=(frame_moment - HANDLEBAR_MASS * stem_length) / body_mass,
                frame_moment=frame_moment, frame_inertia=frame_inertia,
                reaction_wheel_height=REACTION_WHEEL_HEIGHT)


def motor_kwargs(motor):
    """
    Simulator keyword arguments for one motors.json entry. Geared actuators list motor-side constants, so the
    output sees gear_ratio times the torque per amp (and back-EMF per rad/s). Gearbox losses, backlash and the
    rotor's reflected inertia are left out.
    """
    kwargs = dict(motor_kt=motor["kt_nm_per_a"] * motor.get("gear_ratio", 1.0),
                  motor_resistance=motor["resistance_ohm_line_to_line"], motor_max_current=motor["max_current_a"])
    if motor.get("is_own_flywheel"):
        kwargs.update(reaction_wheel_mass=motor["rotor_mass_kg"], reaction_wheel_radius=motor["rotor_radius_m"],
                      reaction_wheel_inertia=motor["rotor_inertia_kg_m2"],
                      motor_mass=motor["mass_kg"] - motor["rotor_mass_kg"])
    else:
        kwargs.update(reaction_wheel_mass=FLYWHEEL_MASS, reaction_wheel_radius=FLYWHEEL_RADIUS,
                      reaction_wheel_inertia=FLYWHEEL_SHAPE * FLYWHEEL_MASS * FLYWHEEL_RADIUS**2,
                      motor_mass=motor["mass_kg"])
    return kwargs


def pack_peak_power(scooter):
    "(W) what the scooter's battery and BMS are known to deliver: the drive motor's peak power"
    return scooter.get("drive_motor_peak_w") or PEAK_POWER_FALLBACK * scooter["drive_motor_rated_w"]


def evaluate(pair):
    "Runs in a worker process: one scooter and motor pairing"
    scooter, motor = pair
    # The controller can always PWM the pack down to the motor's rated voltage, never up
    voltage = min(scooter["battery_voltage_v"], motor.get("rated_voltage_max_v") or math.inf)
    kwargs = dict(scooter_kwargs(scooter), **motor_kwargs(motor), nominal_voltage=voltage)
    uncapped = ScooterReversePendulumReactionWheel(**kwargs)
    limited = ScooterReversePendulumReactionWheel(battery_max_power=pack_peak_power(scooter), **kwargs)
    return dict(
        scooter=scooter["id"], motor=motor["id"], voltage=voltage,
        pack_limited_deg=math.degrees(limited.max_recovery_angle()),
        uncapped_deg=math.degrees(uncapped.max_recovery_angle()),
        static_deg=math.degrees(uncapped.static_holding_angle()),
        peak_torque_nm=uncapped.peak_torque(),
        wheel_momentum_nms=uncapped.reaction_wheel_inertia * voltage / uncapped.motor_ke,
        pack_peak_power_w=pack_peak_power(scooter),
        cost_usd=scooter["price_usd"] + motor["price_usd"],
    )


def plot_matrix(results, scooters, motors, key, title, path):
    "Heatmap of scooters (rows) against motors (columns), best of each toward the top left"
    value = {(r["scooter"], r["motor"]): r[key] for r in results}
    rows = sorted(scooters, key=lambda s: -max(value[s["id"], m["id"]] for m in motors))
    cols = sorted(motors, key=lambda m: -sum(value[s["id"], m["id"]] for s in scooters))
    grid = [[value[s["id"], m["id"]] for m in cols] for s in rows]
    top = max(max(row) for row in grid)

    fig, ax = plt.subplots(figsize=(1.0 + 0.95 * len(cols), 1.6 + 0.42 * len(rows)))
    image = ax.imshow(grid, cmap=BLUES, vmin=0, vmax=top, aspect="auto")
    for i, row in enumerate(grid):
        for j, angle in enumerate(row):
            ax.text(j, i, f"{angle:.1f}", ha="center", va="center", fontsize=8,
                    color="white" if angle > 0.55 * top else INK)
    ax.set_xticks(range(len(cols)), [m["short_name"] for m in cols], rotation=40, ha="right", fontsize=8, color=INK)
    ax.set_yticks(range(len(rows)), [f'{s["short_name"]}  ${s["price_usd"]:.0f}' for s in rows], fontsize=8, color=INK)
    ax.set_xticks([x - 0.5 for x in range(1, len(cols))], minor=True)
    ax.set_yticks([y - 0.5 for y in range(1, len(rows))], minor=True)
    ax.grid(which="minor", color="white", linewidth=2)      # surface gap between cells
    ax.tick_params(which="both", length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_title(title, fontsize=11, color=INK, loc="left", pad=12)
    bar = fig.colorbar(image, ax=ax, fraction=0.025, pad=0.02)
    bar.set_label("max lean angle recovered (degrees)", fontsize=8, color=INK_MUTED)
    bar.ax.tick_params(labelsize=8, colors=INK_MUTED, length=0)
    bar.outline.set_visible(False)
    fig.savefig(path, dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def plot_top(top, names, path):
    "Horizontal bars: pack-limited angle, with the uncapped angle as a tick on the same axis"
    labels = [f'{names[r["scooter"]]}  +  {names[r["motor"]]}' for r in top]
    fig, ax = plt.subplots(figsize=(9, 0.5 * len(top) + 1.4))
    y = range(len(top))
    ax.barh(y, [r["pack_limited_deg"] for r in top], height=0.55, color=HIGHLIGHT, label="on the scooter's own pack")
    ax.scatter([r["uncapped_deg"] for r in top], y, marker="|", s=260, linewidths=2, color=INK,
               label="with a dedicated flywheel battery", zorder=3)
    for i, r in enumerate(top):
        ax.text(r["uncapped_deg"] + 0.15, i, f'{r["pack_limited_deg"]:.1f}° / {r["uncapped_deg"]:.1f}°   ${r["cost_usd"]:.0f}',
                va="center", fontsize=8, color=INK)
    ax.set_yticks(y, labels, fontsize=8, color=INK)
    ax.invert_yaxis()
    ax.set_xlim(0, max(r["uncapped_deg"] for r in top) * 1.35)
    ax.set_xlabel("max lean angle recovered (degrees)", fontsize=8, color=INK_MUTED)
    ax.tick_params(axis="x", labelsize=8, colors=INK_MUTED, length=0)
    ax.tick_params(axis="y", length=0)
    ax.grid(axis="x", color="#e6e5e0", linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_title(f"Best scooter and flywheel motor combinations ({FLYWHEEL_LABEL} flywheel)", fontsize=11, color=INK, loc="left", pad=26)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2, fontsize=8, frameon=False, borderaxespad=0.2)
    fig.savefig(path, dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def plot_cost(results, top, names, path):
    "Every pairing by total cost, top combinations highlighted"
    picked = {(r["scooter"], r["motor"]) for r in top}
    rest = [r for r in results if (r["scooter"], r["motor"]) not in picked]
    fig, ax = plt.subplots(figsize=(9, 5.5))
    ax.scatter([r["cost_usd"] for r in rest], [r["pack_limited_deg"] for r in rest], s=22, color=CONTEXT,
               edgecolors="white", linewidths=0.6, label="all other pairings")
    ax.scatter([r["cost_usd"] for r in top], [r["pack_limited_deg"] for r in top], s=60, color=HIGHLIGHT,
               edgecolors="white", linewidths=1.2, label="top combinations", zorder=3)
    # Top picks cluster, so points carry only their rank and the names go in a key beside the plot
    for rank, r in enumerate(top, 1):
        ax.annotate(str(rank), (r["cost_usd"], r["pack_limited_deg"]), fontsize=8, color=INK, ha="center", va="center",
                    xytext=(9 if rank % 2 else -9, 8 if rank % 4 < 2 else -8), textcoords="offset points")
    key = "\n".join(f'{rank}. {names[r["scooter"]]} + {names[r["motor"]]}   {r["pack_limited_deg"]:.1f}°  ${r["cost_usd"]:.0f}'
                    for rank, r in enumerate(top, 1))
    ax.text(1.02, 1.0, key, transform=ax.transAxes, fontsize=8, color=INK, va="top", linespacing=1.6)
    ax.set_xlabel("scooter + motor price (USD)", fontsize=8, color=INK_MUTED)
    ax.set_ylabel("max lean angle recovered on the scooter's pack (degrees)", fontsize=8, color=INK_MUTED)
    ax.tick_params(labelsize=8, colors=INK_MUTED, length=0)
    ax.grid(color="#e6e5e0", linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_title(f"Recovery angle against cost, every pairing ({FLYWHEEL_LABEL} flywheel)", fontsize=11, color=INK, loc="left", pad=10)
    ax.legend(loc="upper left", fontsize=8, frameon=False)
    fig.savefig(path, dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main(top_count = 5):
    with open(os.path.join(HERE, "scooters.json"), encoding="utf-8") as f:
        all_scooters = json.load(f)
    with open(os.path.join(HERE, "motors.json"), encoding="utf-8") as f:
        all_motors = json.load(f)
    os.makedirs(RESULTS, exist_ok=True)

    scooters = [r for r in (resolve(s, SCOOTER_NEEDS) for s in all_scooters) if r]
    motors = [r for r in (resolve(m, MOTOR_NEEDS) for m in all_motors) if r]
    skipped = [x["name"] for x in all_scooters if not resolve(x, SCOOTER_NEEDS)]             + [x["name"] for x in all_motors if not resolve(x, MOTOR_NEEDS)]
    if skipped:
        print("Skipped, missing specs the simulator needs: " + ", ".join(skipped))

    pairs = [(s, m) for s in scooters for m in motors]
    with ProcessPoolExecutor() as pool:
        results = list(pool.map(evaluate, pairs, chunksize=4))

    names = {x["id"]: x["short_name"] for x in scooters + motors}
    ranked = sorted(results, key=lambda r: (-round(r["pack_limited_deg"], 2), r["cost_usd"]))
    top = ranked[:top_count]

    with open(os.path.join(RESULTS, "recovery_matrix.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(ranked)
    with open(os.path.join(RESULTS, "top_combinations.json"), "w", encoding="utf-8") as f:
        json.dump(top, f, indent=2)

    plot_matrix(results, scooters, motors, "pack_limited_deg",
                f"Max lean angle recovered, flywheel motor on the scooter's own pack ({FLYWHEEL_LABEL} flywheel)", os.path.join(RESULTS, "matrix_pack_limited.png"))
    plot_matrix(results, scooters, motors, "uncapped_deg",
                f"Max lean angle recovered, flywheel motor on a dedicated battery ({FLYWHEEL_LABEL} flywheel)", os.path.join(RESULTS, "matrix_uncapped.png"))
    plot_top(ranked[:max(top_count, 10)], names, os.path.join(RESULTS, "top_combinations.png"))
    plot_cost(results, top, names, os.path.join(RESULTS, "angle_vs_cost.png"))

    print(f"{len(scooters)} scooters x {len(motors)} motors = {len(results)} pairings, {FLYWHEEL_LABEL} flywheel\n")
    print(f"{'#':>2s}  {'scooter':30s} {'motor':34s} {'V':>5s} {'pack':>6s} {'uncap':>6s} {'static':>6s} {'cost':>6s}")
    for rank, r in enumerate(ranked[:max(top_count, 10)], 1):
        print(f"{rank:2d}  {names[r['scooter']][:30]:30s} {names[r['motor']][:34]:34s} {r['voltage']:5.1f} "
              f"{r['pack_limited_deg']:6.2f} {r['uncapped_deg']:6.2f} {r['static_deg']:6.2f} {r['cost_usd']:6.0f}")


if __name__ == "__main__":
    main()
