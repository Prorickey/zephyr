# Reaction Flywheel CAD Spec (Zephyr scooter balancer)

Context: a reaction wheel balances an electric scooter (VOLPAM 350 W, 36 V) side to side, like an inverted pendulum.
A Flipsky 7070 KV110 outrunner drives the wheel. The wheel will be **waterjet cut**. All targets below come from the
LQR simulation (`simulators/rwps_lqr.py`), which builds on the plant in `rwps_v2.py`.

## Design targets

| Parameter | Target | Tolerance / sensitivity |
|---|---|---|
| Spin-axis moment of inertia I_w | **0.0608 kg·m²** (sim uses 0.9·m·r², i.e. rim-weighted) | Main performance driver. 0.05–0.08 is fine. Below ~0.04 it degrades quickly. Err high. |
| Total rotating mass | **≤ 3.0 kg** (rim + hub + spokes + fasteners) | Lighter is better: mass sits at 0.3 m height and adds gravity torque. |
| Outer radius | **150 mm (Ø300 mm)** | Matters through I_w and clearance at full lean. |
| Mount height above tire axles | 0.3 m | Fixed by the frame. |
| Max speed | **3,960 rpm** (414.7 rad/s, 66 Hz) | No-load speed of the motor at 36 V. Design for this. |
| Rim speed at max | ~62 m/s | |
| Stored energy at max | ~5.2 kJ | Needs a guard or shroud. |

Sim sensitivity (max recoverable lean from rest, wheel stopped):

- I_w: 0.02 → 5.23°, 0.04 → 6.17°, **0.0608 → 6.66°**, 0.08 → 6.94°, 0.12 → 7.29°
- Mass at I_w = 0.0608: 2 kg → 6.99°, **3 kg → 6.66°**, 4 kg → 6.36°, 5 kg → 6.08°
- Hard ceiling: 8.25° (where peak motor torque, 8.48 Nm, equals the gravity torque)

## Starting geometry (hand calc, verify with CAD mass properties)

- Material: **steel** (ρ ≈ 7850 kg/m³). Aluminum needs about 3× the thickness for the same inertia.
- Annulus inertia: I = ½·ρ·π·t·(r_o⁴ − r_i⁴), with mass m = ρ·π·t·(r_o² − r_i²).
- With t = 25.4 mm (e.g. 2 × 1/2" stacked plates): a rim from r_i ≈ 134 mm to r_o = 150 mm gives about 0.058 kg·m² and 2.86 kg.
- That leaves about 0.15–0.3 kg for the hub and spokes. Keep the spokes minimal: they add mass but little inertia.

## Manufacturing and safety constraints

- Hoop stress is ~30 MPa in steel (ρv²), so there's plenty of margin. Still, give spoke roots and inside corners generous fillets, because waterjet edges taper and leave micro-notches.
- Keep the design rotationally symmetric. At 66 Hz, imbalance shakes the frame and adds noise to the IMU. Plan for dynamic balancing.
- Waterjet tolerance is about ±0.1–0.25 mm. Cut the hub bore and bolt holes **undersized**, then ream or machine them to final size so the wheel runs concentric.
- Motor interface: Flipsky 7070 outrunner (1.08 kg, spinning can). **Take the bolt pattern and pilot diameter from the datasheet or caliper measurement** (not yet known).
- Plates that are stacked need alignment features (dowels or a bolt circle) so they stay concentric.

## After CAD

Put the CAD's actual mass, I_w, and radius into `MOTOR` in `simulators/rwps_lqr.py`
(`reaction_wheel_mass`, `reaction_wheel_inertia`, `reaction_wheel_radius`) and rerun. The LQR gains K are computed from I_w,
so firmware gains must come from the as-built values. The motor's spinning can adds a little inertia on top (small next to 0.06).
