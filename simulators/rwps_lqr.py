"""
Live reaction-wheel pendulum with the LQR from the Zephyr Physics doc, on a VOLPAM 350W scooter with a
Flipsky 7070 KV110 flywheel motor. Hold the arrow keys to push the handlebars and watch the controller react.

    python rwps_lqr.py

Controls (click the window first so it has keyboard focus):
    left / right   hold to push the handlebars left / right
    up / down      push strength +/- PUSH_STEP
    space          pause / resume
    r              reset to upright

The plant is ScooterReversePendulumReactionWheel from rwps_v2.py (exact sin(theta), current clamp, battery
power cap), with an external horizontal force added at the handlebars. The controller only sees the doc's
linear, forward-Euler model and runs every LOOP_PERIOD seconds with its output held in between.
"""
import math
import time
from collections import deque

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Circle

from rwps_v2 import ScooterReversePendulumReactionWheel

# VOLPAM Electric Scooter, 350W/500W Motor, 21/28/40 Miles Long Range (Amazon B0DQQ2B6DZ, 350 W variant).
# Listings disagree and none publish a full spec sheet: 8.5 in solid tires, 36 V pack, 26-33 lb (30 lb used),
# ~44 in (1.118 m) unfolded height from the VOLPAM Q1 manual, 280.8 Wh pack from a VOLPAM 36 V 7.8 Ah listing.
# The mass split is compare.py's scooter_kwargs() model for those numbers: 2.0 kg handlebars at L_1, a stem/fork
# rod of 19% of net weight, a 2.0 kg deck battery, and the rest lumped just above the axles.
SCOOTER = dict(
    handlebar_mass=2.0, body_mass=11.6, stem_length=1.088, body_com_height=0.226,
    frame_moment=4.801,      # (kg*m) m_a h_a
    frame_inertia=3.581,     # (kg*m^2) I_a
    reaction_wheel_height=0.3,
)
SCOOTER_PACK_VOLTAGE = 36.0     # (V) 10S
SCOOTER_PACK_POWER = 1.5 * 350  # (W) no peak power is published; compare.py's 1.5x rated drive power fallback

# Flipsky 7070 Battle Hardened KV110 (motors.json flipsky_7070_110kv): K_t = 60 / (2 pi 110), 0.055 ohm as
# published (phase vs line-to-line unstated), 100 A max, 1.08 kg, rated 6-18S. It isn't its own flywheel, so it
# drives compare.py's current flywheel: 3 kg rim-weighted, r = 0.15 m, I_w = 0.9 m r^2.
MOTOR = dict(
    motor_kt=0.08681, motor_resistance=0.055, motor_max_current=30.0, motor_mass=1.08,
    reaction_wheel_mass=3.0, reaction_wheel_radius=0.15, reaction_wheel_inertia=0.9 * 3.0 * 0.15**2,
)

# Controller
LOOP_PERIOD = 0.005             # (s) T = 1 / f_loop, the controller's sample period
SIM_SUBSTEPS = 5                # plant RK4 steps per controller step
# Q and R by Bryson's rule: 1 / (largest acceptable value)^2 for each state and the input
Q_THETA = 1 / math.radians(2)**2     # 2 degrees of lean
Q_THETA_DOT = 1 / 0.5**2             # 0.5 rad/s of lean rate
Q_PHI = 1 / (2 * math.pi * 20)**2    # 20 turns of wheel angle drift
Q_OMEGA = 1 / 300.0**2               # 300 rad/s of wheel speed
R_V = 1 / 6.0**2                     # 6 V of command. At 0.055 ohm, 100 A is reached by only ~5.5 V over back-EMF

# Disturbance
PUSH_FORCE = 4.0                # (N) starting push strength, applied horizontally at the handlebars. Holding
                                # ~5 N or more beats the 8.7 Nm motor (5 N * L_1 = 5.4 Nm plus the lean it causes)
PUSH_STEP = 2.0                 # (N) change per up/down press
PLOT_WINDOW = 10.0              # (s) history shown in the strip charts


class PushableScooter(ScooterReversePendulumReactionWheel):
    """
    The rwps_v2 scooter with a horizontal force at the handlebars. push_force is in N, positive to the right as
    viewed from behind. The handlebars sit at (-L_1 sin(theta), L_1 cos(theta)), so the torque about the pivot
    is -F L_1 cos(theta): pushing right leans the scooter right (clockwise, negative theta).
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.push_force = 0.0

    def push_torque(self, theta):
        "(Nm) torque about the pivot from push_force"
        return -self.push_force * self.stem_length * math.cos(theta)

    def frame_acceleration(self, voltage, theta, theta_dot, phi_dot):
        "theta_ddot = (M g sin(theta) - tau_m - b theta_dot + tau_push) / J. The wheel sees it through theta_ddot"
        return super().frame_acceleration(voltage, theta, theta_dot, phi_dot) + self.push_torque(theta) / self.total_inertia


def discrete_model(sim, T):
    """
    A and B of x_{k+1} = A x_k + B u_k with x = (theta, theta_dot, phi, omega) and u = V: the doc's forward-Euler
    rows. M and J come from the sim, so they include the motor's stator mass at L_2.

    This whole function just defines A and B. If this stuff doesn't make sense to you, just check the overleaf document
    and scroll down to the definition of A and B. 

    TLDR: A represents the physics of the system and how the state changes between timesteps and B represents how our input,
    u (volts) impacts the state of the system too. 
    """
    J = sim.total_inertia
    Iw = sim.reaction_wheel_inertia
    Mg = sim.gravitational_moment * sim.gravity
    b = sim.friction
    kt, ke, R = sim.motor_kt, sim.motor_ke, sim.motor_resistance
    A = np.array([
        [1,           T,               0, 0],
        [T * Mg / J,  1 - T * b / J,   0, T * kt * ke / (R * J)], 
        [0,           0,               1, T], 
        [-T * Mg / J, T * b / J,       0, 1 - T * kt * ke * (Iw + J) / (R * Iw * J)],
    ])
    B = np.array([[0], [-T * kt / (R * J)], [0], [T * kt * (Iw + J) / (R * Iw * J)]])
    return A, B


def lqr(A, B, Q, R, tolerance = 1e-10, max_iterations = 200000):
    """
    Iterates P = Q + A'PA - A'PB (R + B'PB)^-1 B'PA until it stops changing, then K = (R + B'PB)^-1 B'PA.
    Returns K and P. If this equation and variables don't make sense to you, check the overleaf document again.

    K is our motor gain, which essentially projects the state to a motor voltage. Think of it like a ML layer 
    projecting one type of thing to another. 
    """
    P = Q.copy()
    for _ in range(max_iterations):
        S = R + B.T @ P @ B
        P_next = Q + A.T @ P @ A - A.T @ P @ B @ np.linalg.solve(S, B.T @ P @ A)
        if np.max(np.abs(P_next - P)) <= tolerance * max(1.0, np.max(np.abs(P))):
            P = P_next
            break
        P = P_next
    else:
        raise RuntimeError("Riccati iteration did not converge")
    K = np.linalg.solve(R + B.T @ P @ B, B.T @ P @ A)
    return K, P


class LQRSimulation:
    "The plant, the controller and the push, stepped one controller period at a time"

    def __init__(self):
        self.sim = PushableScooter(**SCOOTER, **MOTOR, nominal_voltage=SCOOTER_PACK_VOLTAGE,
                                   battery_max_power=SCOOTER_PACK_POWER, dt=LOOP_PERIOD / SIM_SUBSTEPS)
        self.A, self.B = discrete_model(self.sim, LOOP_PERIOD)
        self.Q = np.diag([Q_THETA, Q_THETA_DOT, Q_PHI, Q_OMEGA])
        self.R = np.array([[R_V]])
        self.K, self.P = lqr(self.A, self.B, self.Q, self.R)
        self.reset()

    def reset(self):
        self.sim.Y = np.array([0.0, 0.0, 0.0])
        self.phi = 0.0
        self.voltage = 0.0
        self.t = 0.0
        self.fallen = False

    def state(self):
        "x = (theta, theta_dot, phi, omega)"
        theta, theta_dot, phi_dot = self.sim.Y
        return np.array([theta, theta_dot, self.phi, phi_dot])

    def control_step(self, push_force):
        "One controller period: u = -K x, clipped to the pack voltage and held while the plant runs"
        self.sim.push_force = push_force
        u = -(self.K @ self.state()).item()
        self.voltage = max(-self.sim.nominal_voltage, min(self.sim.nominal_voltage, u))
        for _ in range(SIM_SUBSTEPS):
            phi_dot_before = self.sim.Y[2]
            self.sim.Y = self.sim.rk4_step(self.voltage, self.sim.Y, self.sim.dt)
            self.phi += self.sim.dt * (phi_dot_before + self.sim.Y[2]) / 2
        self.t += LOOP_PERIOD
        if abs(self.sim.Y[0]) > math.pi / 2:
            self.fallen = True

    def motor_current(self):
        "(A) winding current after the clamps"
        return self.sim.motor_torque(self.voltage, self.sim.Y[2]) / self.sim.motor_kt

    def summary(self):
        controllability = np.hstack([np.linalg.matrix_power(self.A, i) @ self.B for i in range(4)])
        poles = np.linalg.eigvals(self.A - self.B @ self.K)
        k = self.K.ravel()
        return (f"K = [{k[0]:.1f} V/rad, {k[1]:.2f} V/(rad/s), {k[2]:.4f} V/rad, {k[3]:.4f} V/(rad/s)]\n"
                f"controllability rank {np.linalg.matrix_rank(controllability)} of 4, "
                f"closed-loop |poles| {', '.join(f'{abs(p):.4f}' for p in poles)}\n"
                f"peak torque {self.sim.peak_torque():.2f} Nm, "
                f"static holding angle {math.degrees(self.sim.static_holding_angle()):.1f} deg, "
                f"no-load wheel speed {self.sim.nominal_voltage / self.sim.motor_ke * 60 / (2 * math.pi):.0f} rpm")


class KeyboardPush:
    """
    Turns arrow key presses into a push force. Holding a key on Windows/Tk sends repeated press/release pairs,
    so a release only counts once no press follows it within RELEASE_GRACE seconds.
    """
    RELEASE_GRACE = 0.06

    def __init__(self):
        self.strength = PUSH_FORCE
        self.pressed = {}   # key -> wall time of its last release, or None while held

    def press(self, key):
        self.pressed[key] = None

    def release(self, key):
        if key in self.pressed:
            self.pressed[key] = time.perf_counter()

    def held(self, key):
        if key not in self.pressed:
            return False
        released = self.pressed[key]
        if released is not None and time.perf_counter() - released > self.RELEASE_GRACE:
            del self.pressed[key]
            return False
        return True

    def force(self):
        "(N) positive pushes right"
        return self.strength * (self.held("right") - self.held("left"))


def run():
    # Free the arrow keys and 'r' from matplotlib's navigation shortcuts
    for name in ("keymap.back", "keymap.forward", "keymap.home"):
        plt.rcParams[name] = [k for k in plt.rcParams[name] if k not in ("left", "right", "r")]

    lqr_sim = LQRSimulation()
    sim = lqr_sim.sim
    print(lqr_sim.summary())
    keys = KeyboardPush()
    paused = [False]

    fig = plt.figure(figsize=(13, 7.5))
    grid = fig.add_gridspec(4, 2, width_ratios=(1.1, 1), hspace=0.35, left=0.06, right=0.97, top=0.84, bottom=0.1)
    left = grid[:, 0].subgridspec(2, 1, height_ratios=(1, 5), hspace=0.05)
    panel = fig.add_subplot(left[0])   # readouts, kept off the scooter view
    panel.axis("off")
    ax = fig.add_subplot(left[1])
    strips = [fig.add_subplot(grid[i, 1]) for i in range(4)]
    fig.suptitle("VOLPAM 350W + Flipsky 7070 KV110, LQR balance (viewed from behind)", fontsize=13, y=0.98)
    fig.text(0.06, 0.87, lqr_sim.summary(), fontsize=8, family="monospace", va="bottom")

    # Scooter view
    reach = sim.stem_length * 1.25
    ax.set_xlim(-reach, reach)
    ax.set_ylim(-0.15, reach)
    ax.set_aspect("equal")
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.axhline(0, color="#6b6a66", lw=2)
    stem, = ax.plot([], [], "o-", lw=3, color="#1f77b4", markersize=8)
    body_marker, = ax.plot([], [], "s", color="#8c564b", markersize=10, label="Body center of mass")
    wheel = Circle((0, 0), sim.reaction_wheel_radius, fill=False, lw=2, color="#2ca02c", label="Reaction wheel")
    ax.add_patch(wheel)
    spoke, = ax.plot([], [], "-", lw=2, color="#2ca02c")
    arrows = ax.quiver([0, 0], [0, 0], [0, 0], [0, 0], color=["#d62728", "#ff7f0e"],
                       angles="xy", scale_units="xy", scale=1, zorder=5, width=0.008)
    ax.plot([], [], color="#d62728", lw=2, label="Push on handlebars")
    ax.plot([], [], color="#ff7f0e", lw=2, label="Motor reaction on frame")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.07), ncol=2, fontsize=8, frameon=False)
    panel.add_patch(plt.Rectangle((0, 0), 1, 1, transform=panel.transAxes, facecolor="white",
                                  edgecolor="#c4c3be", lw=1, clip_on=False))
    info = [panel.text(x, 0.5, "", transform=panel.transAxes, va="center", family="monospace", fontsize=9)
            for x in (0.03, 0.36, 0.68)]
    banner = ax.text(0.5, 0.55, "", transform=ax.transAxes, ha="center", fontsize=16, color="#d62728", weight="bold")
    fig.text(0.29, 0.015, "hold left/right to push   up/down strength   space pause   r reset",
             ha="center", fontsize=9, color="#6b6a66")
    force_scale = 0.4 * sim.stem_length / 20.0                    # 20 N drawn at 0.4 L_1
    torque_scale = 0.4 * sim.stem_length / sim.peak_torque()      # peak torque drawn at 0.4 L_1

    # Strip charts, plotted against seconds ago so the axes never move
    history_length = int(PLOT_WINDOW / LOOP_PERIOD)
    ages = np.linspace(-PLOT_WINDOW, 0, history_length)
    no_load_rpm = sim.nominal_voltage / sim.motor_ke * 60 / (2 * math.pi)
    channels = [("lean (deg)", 15, "#1f77b4"), ("wheel (rpm)", no_load_rpm, "#2ca02c"),
                ("motor (V)", sim.nominal_voltage, "#ff7f0e"), ("push (N)", 25, "#d62728")]
    histories = [deque([0.0] * history_length, maxlen=history_length) for _ in channels]
    lines = []
    for strip, (label, limit, color) in zip(strips, channels):
        strip.set_xlim(-PLOT_WINDOW, 0)
        strip.set_ylim(-limit * 1.05, limit * 1.05)
        strip.set_ylabel(label, fontsize=9)
        strip.axhline(0, color="#c4c3be", lw=1)
        strip.grid(True, linestyle="--", alpha=0.4)
        strip.tick_params(labelsize=8)
        lines.append(strip.plot(ages, histories[len(lines)], lw=1.5, color=color)[0])
    strips[-1].set_xlabel("seconds ago", fontsize=9)
    for strip in strips[:-1]:
        strip.tick_params(labelbottom=False)

    def on_press(event):
        if event.key in ("left", "right"):
            keys.press(event.key)
        elif event.key == "up":
            keys.strength += PUSH_STEP
        elif event.key == "down":
            keys.strength = max(0.0, keys.strength - PUSH_STEP)
        elif event.key == " ":
            paused[0] = not paused[0]
        elif event.key == "r":
            lqr_sim.reset()
            for history in histories:
                history.extend([0.0] * history_length)

    def on_release(event):
        if event.key in ("left", "right"):
            keys.release(event.key)

    fig.canvas.mpl_connect("key_press_event", on_press)
    fig.canvas.mpl_connect("key_release_event", on_release)

    clock = [time.perf_counter(), 0.0]   # last wall time, simulated time owed

    def update():
        now = time.perf_counter()
        owed = min(clock[1] + now - clock[0], 0.1)   # don't try to catch up after a stall
        clock[0] = now
        push = keys.force()
        if paused[0] or lqr_sim.fallen:
            owed = 0.0
        while owed >= LOOP_PERIOD:
            lqr_sim.control_step(push)
            owed -= LOOP_PERIOD
            theta, _, phi_dot = sim.Y
            for history, value in zip(histories, (math.degrees(theta), phi_dot * 60 / (2 * math.pi),
                                                  lqr_sim.voltage, push)):
                history.append(value)
            if lqr_sim.fallen:
                break
        clock[1] = owed

        theta, theta_dot, phi_dot = sim.Y
        s, c = math.sin(theta), math.cos(theta)
        bar = (-sim.stem_length * s, sim.stem_length * c)
        body = (-sim.body_com_height * s, sim.body_com_height * c)
        hub = (-sim.reaction_wheel_height * s, sim.reaction_wheel_height * c)
        stem.set_data([0, bar[0]], [0, bar[1]])
        body_marker.set_data([body[0]], [body[1]])
        wheel.center = hub
        spin = theta + lqr_sim.phi   # the wheel's absolute angle
        spoke.set_data([hub[0], hub[0] - sim.reaction_wheel_radius * math.sin(spin)],
                       [hub[1], hub[1] + sim.reaction_wheel_radius * math.cos(spin)])

        # The frame feels -tau_m, drawn as a tangential force at the wheel hub like rwps_v2's show_plot
        torque_motor = sim.motor_torque(lqr_sim.voltage, phi_dot)
        motor_arrow = torque_motor * torque_scale
        arrows.set_offsets([bar, hub])
        arrows.set_UVC([push * force_scale, motor_arrow * c], [0.0, motor_arrow * s])

        info[0].set_text(
            f"t      {lqr_sim.t:8.2f} s\n"
            f"theta  {math.degrees(theta):8.2f} deg\n"
            f"theta' {math.degrees(theta_dot):8.1f} deg/s"
        )
        info[1].set_text(
            f"phi    {lqr_sim.phi / (2 * math.pi):8.2f} turns\n"
            f"wheel  {phi_dot * 60 / (2 * math.pi):8.0f} rpm\n"
            f"push   {push:8.1f} N  ({keys.strength:.0f})"
        )
        info[2].set_text(
            f"V       {lqr_sim.voltage:7.2f} V\n"
            f"current {lqr_sim.motor_current():7.1f} A\n"
            f"motor   {torque_motor:7.2f} Nm"
        )
        banner.set_text("FELL OVER - press r" if lqr_sim.fallen else "PAUSED" if paused[0] else "")
        for line, history in zip(lines, histories):
            line.set_ydata(history)
        return [stem, body_marker, wheel, spoke, arrows, *info, banner, *lines]

    # Blitting by hand: a full redraw takes ~140 ms, so each tick only redraws the moving artists over a saved
    # background. FuncAnimation isn't used because it restarts its timer on redraws, so a frame could still fire
    # into the torn-down canvas after the window's X was clicked.
    canvas = fig.canvas
    animated = update()
    for artist in animated:
        artist.set_animated(True)
    background = [None]
    closed = [False]

    def on_draw(_event):
        "Full redraws (first show, resize) leave out the animated artists, so save that as the background"
        background[0] = canvas.copy_from_bbox(fig.bbox)
        for artist in animated:
            fig.draw_artist(artist)

    def tick():
        if closed[0] or fig.canvas is not canvas or background[0] is None:
            return
        update()
        canvas.restore_region(background[0])
        for artist in animated:
            fig.draw_artist(artist)
        canvas.blit(fig.bbox)
        canvas.flush_events()

    timer = canvas.new_timer(interval=15)
    timer.add_callback(tick)

    def on_close(_event = None):
        if not closed[0]:
            closed[0] = True
            timer.stop()
            plt.close(fig)

    canvas.mpl_connect("draw_event", on_draw)
    canvas.mpl_connect("close_event", on_close)
    window = getattr(canvas.manager, "window", None)
    if hasattr(window, "protocol"):   # Tk: stop before the window's X button tears the canvas down
        window.protocol("WM_DELETE_WINDOW", on_close)
    timer.start()
    plt.show()


if __name__ == "__main__":
    run()
