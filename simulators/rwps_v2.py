import math
import matplotlib.pyplot as plt
import numpy as np
import matplotlib.animation as animation
from matplotlib.widgets import Slider, Button

class ScooterReversePendulumReactionWheel():
    """
    Simulates the scooter as an inverted pendulum about the pivot (the line through the tire contact
    patches), balanced by a reaction wheel driven by a DC motor. The input is the motor voltage V.

    Equations (see the Zephyr Physics doc):
        tau_m      = (K_t / R) * (V - K_e * phi_dot)          torque the motor applies to the wheel
        theta_ddot = (M g sin(theta) - tau_m - b theta_dot) / J
        phi_ddot   = tau_m / I_w - theta_ddot
    with
        M = m_h L_1 + m_b h_b + (m_w + m_s) L_2   gravitational moment
        J = I_a + (m_w + m_s) L_2^2               total inertia about the pivot
    where m_s is the motor's non-spinning mass (stator, mount), bolted to the frame at the wheel.

    Conventions: theta = 0 is upright. Positive rotation is counterclockwise when viewed from behind
    the scooter; theta, phi, tau_m and V all use this convention. phi is the wheel's angle relative
    to the frame.

    Simulation state: (theta, theta_dot, phi_dot)

    Default parameters are placeholders drawn from published specs:
      - Body/handlebar masses and geometry: Segway Ninebot Max G30 (18.7 kg total, 4.5 kg battery,
        8 cm deck clearance, 102 cm deck-to-handlebar).
      - Motor: T-Motor U8 II KV190 (K_t = 60 / (2 pi 190) = 0.0503 Nm/A, R = 48 mOhm, 6S LiPo,
        43.7 A peak for 180 s). With R this low the unclamped stall current at 6S would be ~460 A,
        so motor_max_current caps the winding current at the rated peak. Pass None to disable and
        match the pure (K_t / R)(V - K_e phi_dot) model in the physics doc.
    """

    def __init__(self, handlebar_mass = 2.0, body_mass = 17.0, reaction_wheel_mass = 1.0,
                 stem_length = 1.1, body_com_height = 0.2, reaction_wheel_height = 0.3,
                 reaction_wheel_radius = 0.15, motor_kt = 0.0503, motor_ke = None, motor_resistance = 0.048,
                 motor_max_current = 43.7, nominal_voltage = 22.2, friction = 0.0, starting_angle = 0.0,
                 dt = 0.01, gravity = 9.81, frame_inertia = None, frame_moment = None, reaction_wheel_inertia = None,
                 motor_mass = 0.0, battery_max_power = None):
        """
        handlebar_mass = 2.0 # (kg) m_h, mass of the handlebars (bar, grips, display, levers). Estimate\n
        body_mass = 17.0 # (kg) m_b, mass of the body (deck, fork, stem, battery, electronics). Ninebot Max G30 is 18.7 kg total, less the handlebars\n
        reaction_wheel_mass = 1.0 # (kg) m_w, mass of the reaction wheel including the motor's rotor\n
        stem_length = 1.1 # (m) L_1, distance from the pivot to the handlebars. G30: 8 cm deck clearance + 102 cm deck-to-handlebar\n
        body_com_height = 0.2 # (m) h_b, height of the body's center of mass above the pivot. Roughly 13 kg of deck/battery/wheels at 0.1 m plus 4 kg of stem/fork at 0.55 m\n
        reaction_wheel_height = 0.3 # (m) L_2, distance from the pivot to the center of the reaction wheel\n
        reaction_wheel_radius = 0.15 # (m) r_w, radius of the reaction wheel\n
        motor_kt = 0.0503 # (Nm/A) K_t, motor torque constant. T-Motor U8 II KV190: 60 / (2 pi KV)\n
        motor_ke = None # (V*s/rad) K_e, back-EMF constant. Defaults to K_t (numerically equal in SI units)\n
        motor_resistance = 0.048 # (ohm) R, motor winding resistance. T-Motor U8 II KV190: 48 +/- 3 mOhm\n
        motor_max_current = 43.7 # (A) winding current clamp. T-Motor U8 II KV190 peak current (180 s). None disables the clamp\n
        nominal_voltage = 22.2 # (V) battery pack nominal voltage, the full-throttle V for this motor. 6S LiPo for the U8 II\n
        friction = 0.0 # (Nm*s/rad) b, viscous friction at the pivot, tau_f = -b * theta_dot\n
        starting_angle = 0.0 # (rad) initial lean angle, 0 is upright\n
        dt = 0.01 # (s) time step for sim\n
        gravity = 9.81 # (m/s^2) gravity\n
        frame_inertia = None # (kg*m^2) I_a, measured frame inertia about the pivot. Overrides the point-mass estimate\n
        frame_moment = None # (kg*m) m_a * h_a, measured frame gravitational moment. Overrides the point-mass estimate\n
        reaction_wheel_inertia = None # (kg*m^2) I_w, measured wheel inertia about its axle. Overrides the solid-disk estimate\n
        motor_mass = 0.0 # (kg) m_s, non-spinning motor mass (stator, mount) at L_2. Adds to M and J but not to I_w\n
        battery_max_power = None # (W) most the battery can deliver to the flywheel motor. None means unlimited. Regen is never limited
        """

        self.handlebar_mass = handlebar_mass
        self.body_mass = body_mass
        self.reaction_wheel_mass = reaction_wheel_mass
        self.stem_length = stem_length
        self.body_com_height = body_com_height
        self.reaction_wheel_height = reaction_wheel_height
        self.reaction_wheel_radius = reaction_wheel_radius
        self.motor_kt = motor_kt
        self.motor_ke = motor_kt if motor_ke is None else motor_ke
        self.motor_resistance = motor_resistance
        self.motor_max_current = motor_max_current
        self.nominal_voltage = nominal_voltage
        self.friction = friction
        self.starting_angle = starting_angle
        self.dt = dt
        self.gravity = gravity
        self.motor_mass = motor_mass
        self.battery_max_power = battery_max_power

        # I_a: frame inertia about the pivot. Placeholder: handlebars and body modeled as point masses,
        # I_a ~= m_h L_1^2 + m_b h_b^2. Replace with a measured value once the scooter is built.
        if frame_inertia is None:
            frame_inertia = handlebar_mass * stem_length**2 + body_mass * body_com_height**2
        self.frame_inertia = frame_inertia

        # m_a h_a: frame gravitational moment, using the same point-mass model as I_a.
        if frame_moment is None:
            frame_moment = handlebar_mass * stem_length + body_mass * body_com_height
        self.frame_moment = frame_moment

        # I_w: wheel inertia about its own axle. Placeholder: solid disk, I_w ~= 1/2 m_w r_w^2.
        if reaction_wheel_inertia is None:
            reaction_wheel_inertia = 0.5 * reaction_wheel_mass * reaction_wheel_radius**2
        self.reaction_wheel_inertia = reaction_wheel_inertia

        # M = m_a h_a + (m_w + m_s) L_2: gravitational moment of everything about the pivot
        self.gravitational_moment = self.frame_moment + (reaction_wheel_mass + motor_mass) * reaction_wheel_height

        # J = I_a + (m_w + m_s) L_2^2: total inertia about the pivot (the wheel's spin is handled separately by I_w)
        self.total_inertia = self.frame_inertia + (reaction_wheel_mass + motor_mass) * reaction_wheel_height**2

        self.x_history = []
        self.y_history = []
        self.theta_history = []
        self.w_history = []
        self.accel_history = []
        self.voltage_history = []
        self.body_x_history = []
        self.body_y_history = []
        self.rw_x_history = []
        self.rw_y_history = []
        self.rw_w_history = []
        self.rw_accel_history = []
        self.motor_torque_history = []
        self.motor_force_history = []          # (fx, fy) in N, motor reaction on the frame as a tangential force at the wheel
        self.handlebar_gravity_history = []    # (fx, fy) in N
        self.body_gravity_history = []         # (fx, fy) in N
        self.rw_gravity_history = []           # (fx, fy) in N

        self.steps = 0

        # state = [theta (rad), theta_dot (rad/s), phi_dot (rad/s)]
        self.Y = np.array([starting_angle, 0.0, 0.0])

    def motor_torque(self, voltage, phi_dot):
        """
        tau_m = (K_t / R) * (V - K_e * phi_dot): the torque the motor applies to the wheel.
        Back-EMF uses phi_dot, the wheel's speed relative to the frame, since the stator is bolted
        to the frame. The frame feels -tau_m. The winding current (V - K_e phi_dot) / R is clamped
        to +/- motor_max_current when a limit is set, and then to what battery_max_power can feed:
        the motor draws (K_e phi_dot + i R) i, so i <= (-e + sqrt(e^2 + 4 R P)) / (2 R) with e the
        back-EMF along the current. Power flowing back into the battery (braking) is not limited.
        """
        back_emf = self.motor_ke * phi_dot
        current = (voltage - back_emf) / self.motor_resistance
        if self.motor_max_current is not None:
            current = max(-self.motor_max_current, min(self.motor_max_current, current))
        if self.battery_max_power is not None and current != 0.0:
            direction = math.copysign(1.0, current)
            emf_along = direction * back_emf
            limit = (-emf_along + math.sqrt(emf_along**2 + 4 * self.motor_resistance * self.battery_max_power)) / (2 * self.motor_resistance)
            current = direction * min(abs(current), limit)
        return self.motor_kt * current

    def peak_torque(self):
        "(Nm) Motor torque at stall with full voltage, after the current clamp and the battery power cap."
        return self.motor_torque(self.nominal_voltage, 0.0)

    def frame_acceleration(self, voltage, theta, theta_dot, phi_dot):
        "theta_ddot = (M g sin(theta) - tau_m - b theta_dot) / J"
        torque_gravity = self.gravitational_moment * self.gravity * math.sin(theta)
        torque_motor = self.motor_torque(voltage, phi_dot)   # reversed on the frame by Newton's third law
        torque_friction = -self.friction * theta_dot
        return (torque_gravity - torque_motor + torque_friction) / self.total_inertia

    def reaction_wheel_acceleration(self, voltage, theta_ddot, phi_dot):
        "I_w (theta_ddot + phi_ddot) = tau_m  =>  phi_ddot = tau_m / I_w - theta_ddot"
        return self.motor_torque(voltage, phi_dot) / self.reaction_wheel_inertia - theta_ddot

    def derivatives(self, voltage, state):
        "Return d/dt of the state [theta, theta_dot, phi_dot]"
        theta, theta_dot, phi_dot = state
        theta_ddot = self.frame_acceleration(voltage, theta, theta_dot, phi_dot)
        phi_ddot = self.reaction_wheel_acceleration(voltage, theta_ddot, phi_dot)
        return np.array([theta_dot, theta_ddot, phi_ddot])

    def step(self, voltage = 0.0):
        self.Y = self.rk4_step(voltage, self.Y, self.dt)

        theta, theta_dot, phi_dot = self.Y
        _, theta_ddot, phi_ddot = self.derivatives(voltage, self.Y)
        torque_motor = self.motor_torque(voltage, phi_dot)

        # Positions as viewed from behind: theta = 0 is upright, positive theta leans left (counterclockwise)
        self.x_history.append(-self.stem_length * math.sin(theta))
        self.y_history.append(self.stem_length * math.cos(theta))
        self.theta_history.append(theta)
        self.w_history.append(theta_dot)
        self.accel_history.append(theta_ddot)
        self.voltage_history.append(voltage)

        self.body_x_history.append(-self.body_com_height * math.sin(theta))
        self.body_y_history.append(self.body_com_height * math.cos(theta))
        self.rw_x_history.append(-self.reaction_wheel_height * math.sin(theta))
        self.rw_y_history.append(self.reaction_wheel_height * math.cos(theta))
        self.rw_w_history.append(phi_dot)
        self.rw_accel_history.append(phi_ddot)

        # The frame feels -tau_m. Drawn as an equivalent tangential force at the wheel (F = -tau_m / L_2)
        # along the counterclockwise tangent (-cos(theta), -sin(theta)).
        motor_force = torque_motor / self.reaction_wheel_height
        self.motor_torque_history.append(torque_motor)
        self.motor_force_history.append((motor_force * math.cos(theta), motor_force * math.sin(theta)))
        self.handlebar_gravity_history.append((0.0, -self.handlebar_mass * self.gravity))
        self.body_gravity_history.append((0.0, -self.body_mass * self.gravity))
        self.rw_gravity_history.append((0.0, -(self.reaction_wheel_mass + self.motor_mass) * self.gravity))

        self.steps += 1

        return theta, theta_dot, theta_ddot

    def rk4_step(self, voltage, Y, h):
        "Fourth Order Runge-Kutta Integration of the coupled state [theta, theta_dot, phi_dot]"
        k1 = self.derivatives(voltage, Y)
        k2 = self.derivatives(voltage, Y + h/2 * k1)
        k3 = self.derivatives(voltage, Y + h/2 * k2)
        k4 = self.derivatives(voltage, Y + h*k3)

        return Y + (h/6)*(k1+(2*k2)+(2*k3)+k4)

    def recovers_from(self, theta_0, max_time = 8.0):
        """
        True if the scooter can get back to upright from rest at lean theta_0 with the wheel initially stopped.
        Applies full voltage and succeeds once the frame has enough energy to coast to upright,
        1/2 J theta_dot^2 >= M g (1 - cos(theta)); the catch afterwards only needs braking torque, which this
        model always has because the supply is an ideal sink (a real pack needs a brake resistor to absorb it).
        Fails if the wheel runs out of speed (back-EMF) or torque first. This is the best any controller can do;
        a saturated LQR lands within ~0.1 degrees of it. Pivot friction is ignored during the coast.
        """
        Y = np.array([abs(theta_0), 0.0, 0.0])
        potential = self.gravitational_moment * self.gravity
        for _ in range(int(max_time / self.dt)):
            Y = self.rk4_step(self.nominal_voltage, Y, self.dt)
            theta, theta_dot, _ = Y
            if theta <= 0 or (theta_dot < 0 and 0.5 * self.total_inertia * theta_dot**2 >= potential * (1 - math.cos(theta))):
                return True
            if theta > math.pi / 2:
                return False
        return False

    def max_recovery_angle(self):
        "(rad) Largest lean angle recovers_from() succeeds at, by bisection."
        low, high = 0.0, math.pi / 2
        for _ in range(22):
            mid = (low + high) / 2
            low, high = (mid, high) if self.recovers_from(mid) else (low, mid)
        return low

    def static_holding_angle(self):
        "(rad) Lean angle where peak motor torque equals the gravity torque. Upper bound on the recovery angle."
        return math.asin(min(1.0, self.peak_torque() / (self.gravitational_moment * self.gravity)))

    def show_plot(self):
        # Set up the Matplotlib Figure and Axis
        fig, ax = plt.subplots(figsize=(6, 7))
        fig.subplots_adjust(bottom=0.18)
        ax.set_xlim(-self.stem_length * 1.5, self.stem_length * 1.5)
        ax.set_ylim(-self.stem_length * 1.5, self.stem_length * 1.5)
        ax.set_aspect('equal')
        ax.grid(True, linestyle='--', alpha=0.5)
        ax.set_title("Scooter Simulation (viewed from behind)", fontsize=14)

        # Arrow length scale: the largest recorded force is drawn at half the stem length
        all_forces = (self.handlebar_gravity_history + self.body_gravity_history
                      + self.rw_gravity_history + self.motor_force_history)
        arrow_scale = 0.5 * self.stem_length / max(math.hypot(fx, fy) for fx, fy in all_forces)

        # Create the visual elements that will be updated each frame
        line, = ax.plot([], [], 'o-', lw=3, color='#1f77b4', markersize=8)  # Stem and handlebars
        trace, = ax.plot([], [], '-', lw=1, color='orange', alpha=0.6)      # Trace path of the handlebars
        body_marker, = ax.plot([], [], 's', color='#8c564b', markersize=10, label='Body center of mass')
        rw_marker, = ax.plot([], [], 'o', color='#2ca02c', markersize=12, label='Reaction wheel')
        force_arrows = ax.quiver(
            [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0],
            color=['#d62728', '#e377c2', '#9467bd', '#ff7f0e'], angles='xy', scale_units='xy', scale=1, zorder=5
        )
        ax.plot([], [], color='#d62728', lw=2, label='Gravity, handlebars')
        ax.plot([], [], color='#e377c2', lw=2, label='Gravity, body')
        ax.plot([], [], color='#9467bd', lw=2, label='Gravity, reaction wheel')
        ax.plot([], [], color='#ff7f0e', lw=2, label='Motor reaction on frame')
        ax.legend(loc='lower left', fontsize=8)

        info_box = ax.text(
            0.98, 0.98, "", transform=ax.transAxes, ha='right', va='top', family='monospace',
            fontsize=9, bbox=dict(boxstyle='round', facecolor='white', alpha=0.85)
        )

        def draw_frame(i):
            x, y = self.x_history[i], self.y_history[i]
            body_x, body_y = self.body_x_history[i], self.body_y_history[i]
            rw_x, rw_y = self.rw_x_history[i], self.rw_y_history[i]

            line.set_data([0, x], [0, y])
            trace.set_data(self.x_history[:i + 1], self.y_history[:i + 1])
            body_marker.set_data([body_x], [body_y])
            rw_marker.set_data([rw_x], [rw_y])

            forces = [self.handlebar_gravity_history[i], self.body_gravity_history[i],
                      self.rw_gravity_history[i], self.motor_force_history[i]]
            force_arrows.set_offsets([[x, y], [body_x, body_y], [rw_x, rw_y], [rw_x, rw_y]])
            force_arrows.set_UVC([fx * arrow_scale for fx, _ in forces],
                                 [fy * arrow_scale for _, fy in forces])

            info_box.set_text(
                f"V       = {self.voltage_history[i]:8.2f} V\n"
                f"motor   = {self.motor_torque_history[i]:8.2f} Nm\n"
                f"phi_dot = {self.rw_w_history[i]:8.2f} rad/s\n"
                f"accel   = {self.accel_history[i]:8.2f} rad/s^2\n"
                f"omega   = {self.w_history[i]:8.2f} rad/s\n"
                f"theta   = {self.theta_history[i]:8.2f} rad"
            )
            fig.canvas.draw_idle()

        # Frame slider and play/pause button
        slider = Slider(fig.add_axes([0.15, 0.06, 0.58, 0.03]), 'Frame', 0, self.steps - 1,
                        valinit=0, valstep=1)
        button = Button(fig.add_axes([0.8, 0.05, 0.1, 0.05]), 'Pause')
        playing = [True]

        def toggle(_event):
            playing[0] = not playing[0]
            button.label.set_text('Pause' if playing[0] else 'Play')

        def advance(_frame):
            if playing[0]:
                slider.set_val((int(slider.val) + 1) % self.steps)

        slider.on_changed(lambda val: draw_frame(int(val)))
        button.on_clicked(toggle)
        draw_frame(0)

        # Keep a reference so the animation isn't garbage collected
        anim = animation.FuncAnimation(fig, advance, interval=self.dt*1000, cache_frame_data=False)

        plt.show()


# Motor presets: keyword arguments for ScooterReversePendulumReactionWheel. K_t = 60 / (2 pi KV) and K_e = K_t.
# Resistances are the manufacturers' line-to-line "internal resistance" figures. Peak torque = K_t * motor_max_current.
# This is the DC-equivalent convention (bus voltage, supply-side amps), not ODrive's 8.27 / KV per phase-amp.
# For the outrunners motor_mass is the whole motor and the rotor's own inertia is left out of I_w, which is
# conservative: a 0.8 kg rotor at r = 0.07 m would add about a third to the 1 kg disk's inertia.
MOTORS = {
    # Drone outrunner driving a separate 1 kg, 0.15 m flywheel. Peak 2.2 Nm, ~0.27 kg. store.tmotor.com U8 II KV190 datasheet.
    "tmotor_u8_ii_kv190": dict(
        motor_kt=0.0503, motor_resistance=0.048, motor_max_current=43.7, nominal_voltage=22.2,   # 6S
        motor_mass=0.27,
    ),
    # 6.5" hoverboard hub motor (36 V, 350 W class, 30 mm stator). The spinning outer shell and tire are the
    # reaction wheel, so the preset also sets the wheel. KV ~16 and 0.18 ohm phase resistance from the ODrive
    # hoverboard guide; peak ~15 Nm from ffbeast.github.io. No current rating is published, so 25 A is an
    # assumed supply-side limit chosen to give that 15 Nm. Rotor mass and inertia are estimates: ~1.8 kg of
    # the 2.9 kg wheel rotates, rim-weighted between r = 0.06 and 0.083 m.
    "hoverboard_6p5in": dict(
        motor_kt=0.6, motor_resistance=0.36, motor_max_current=25.0, nominal_voltage=36.0,      # 10S
        reaction_wheel_mass=1.8, reaction_wheel_radius=0.083, reaction_wheel_inertia=0.0095,
        motor_mass=1.1,   # the non-rotating 1.1 kg of the 2.9 kg wheel (stator, axle)
    ),
    # Heavy-lift drone outrunner driving a separate 1 kg, 0.15 m flywheel. Peak 17 Nm, 1.74 kg, 8.6 kW.
    # store.tmotor.com U15 II KV80 datasheet.
    "tmotor_u15_ii_kv80": dict(
        motor_kt=0.119, motor_resistance=0.017, motor_max_current=143.0, nominal_voltage=36.0,  # 10S, the KS4 Pro pack. Datasheet rating is 12S (44.4 V) and up
        motor_mass=1.74,
    ),
}

# Scooter presets: keyword arguments for ScooterReversePendulumReactionWheel.
SCOOTERS = {
    # Segway Ninebot Max G30, the class defaults. 18.7 kg total.
    "ninebot_max_g30": dict(handlebar_mass=2.0, body_mass=17.0, stem_length=1.1, body_com_height=0.2),
    # Hiboy KS4 Pro (hiboy.com): 18.4 kg net, 1.224 m (48.2 in) overall height, 10 in solid tires, 36 V 11.6 Ah pack,
    # 500 W (750 W peak) rear hub motor. The mass split is an estimate: 2.0 kg handlebars at 1.20 m, 12.9 kg of
    # deck/battery/wheels/hub motor at 0.14 m, 3.5 kg of stem and fork as a 1.0 m rod centered at 0.65 m.
    # frame_moment and frame_inertia are those three lumps, which the single body point mass can't represent.
    "hiboy_ks4_pro": dict(
        handlebar_mass=2.0, body_mass=16.4, stem_length=1.20, body_com_height=0.249,
        frame_moment=2.0*1.20 + 12.9*0.14 + 3.5*0.65,                            # 6.48 kg*m
        frame_inertia=2.0*1.20**2 + 12.9*0.14**2 + 3.5*(0.65**2 + 1.0**2/12),    # 4.90 kg*m^2
    ),
}


def print_recovery_table(voltages = (22.2, 36.0, 44.4)):
    "Max recovery angle (degrees) for every scooter, motor and pack voltage. Skips voltages below a motor's preset voltage."
    print(f"{'scooter':16s} {'motor':20s} {'V':>5s} {'peak Nm':>8s} {'H Nms':>6s} {'static':>7s} {'recovery':>9s}")
    for scooter_name, scooter in SCOOTERS.items():
        for motor_name, motor in MOTORS.items():
            for voltage in voltages:
                if voltage < motor["nominal_voltage"]:
                    continue
                sim = ScooterReversePendulumReactionWheel(**{**scooter, **motor, "nominal_voltage": voltage})
                momentum = sim.reaction_wheel_inertia * voltage / sim.motor_ke   # wheel momentum at no-load speed
                print(f"{scooter_name:16s} {motor_name:20s} {voltage:5.1f} "
                      f"{sim.peak_torque():8.2f} {momentum:6.2f} "
                      f"{math.degrees(sim.static_holding_angle()):7.2f} {math.degrees(sim.max_recovery_angle()):9.2f}")


if __name__ == "__main__":

    MOTOR = "tmotor_u15_ii_kv80"   # one of MOTORS
    SCOOTER = "hiboy_ks4_pro"      # one of SCOOTERS
    print_recovery_table()
    sim = ScooterReversePendulumReactionWheel(starting_angle=math.radians(5), **SCOOTERS[SCOOTER], **MOTORS[MOTOR])

    # Sim Constants
    SIM_TIME = 10.0 # (seconds)
    # Positive voltage spins the wheel counterclockwise, which pushes the frame clockwise (against a positive lean).
    # Full throttle at the pack's nominal voltage. No-load wheel speed is V / K_e.
    MOTOR_VOLTAGE = sim.nominal_voltage # (volts)

    for t in range(int(SIM_TIME/sim.dt)):
        theta, _, _ = sim.step(MOTOR_VOLTAGE)
        if abs(theta) > math.pi / 2:   # on the ground
            break

    sim.show_plot()
