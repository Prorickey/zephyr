import math
import matplotlib.pyplot as plt
import numpy as np
import matplotlib.animation as animation
from matplotlib.widgets import Slider, Button

class ScooterReversePendulumReactionWheel():
    """
    This simulation takes an input of an applied current to the reaction wheel motor, and simulates
    the body and handlebars of the scooter and how they react to acceleration in the reaction wheel.

    TODO: This in particular lacks ability to simulate the motor's saturation (max speed limits).
    """

    def __init__(self, handlebar_mass = 2.0, body_mass = 35.0, reaction_wheel_mass = 5.0, 
                 length_off_body_of_reaction_wheel = 0.3, stem_length = 1.0, motor_kt = 1.0, 
                 starting_angle = math.pi, dt = 0.01, gravity = 9.81):
        """
        handlebar_mass = 2.0 # (kilograms) mass of the handlebars\n
        body_mass = 35.0 # (kilograms) mass of deck and body\n
        reaction_wheel_mass = 5.0 # (kilograms) mass of reaction wheel\n
        length_off_body_of_reaction_wheel = 0.3 # (meters) length from fulcrum of reaction wheel (where force is applied)\n
        stem_length = 1.0 # (meters) total lengths of scooter stem\n
        motor_kt = 1.0 # (Nm/A) motor constant T (torque) = A (current) * Kt (motor constant)\n
        starting_angle = PI # PI is facing straigtht up\n
        dt = 0.01 # time step for sim, in seconds\n
        gravity = 9.81 # (meter/second^2) gravity
        """

        self.handlebar_mass = handlebar_mass
        self.body_mass = body_mass
        self.reaction_wheel_mass = reaction_wheel_mass
        self.length_off_body_of_reaction_wheel = length_off_body_of_reaction_wheel
        self.stem_length = stem_length
        self.motor_kt = motor_kt
        self.starting_angle = starting_angle
        self.dt = dt
        self.gravity = gravity 

        self.x_history = []
        self.y_history = []
        self.theta_history = []
        self.w_history = []
        self.accel_history = []
        self.current_history = []

        self.steps = 0

        # state = [theta (rads), angular velocity (rad/second)]
        self.Y = np.array([starting_angle, 0.0])

        self.BODY_MOMENT_OF_INERTIA, self.RW_OFFSET = self.body_moment_of_intertia()

    def body_moment_of_intertia(self):
        m12 = self.handlebar_mass + self.body_mass
        r1 = self.length_off_body_of_reaction_wheel*self.handlebar_mass/m12
        r2 = self.length_off_body_of_reaction_wheel*self.body_mass/m12

        return self.handlebar_mass*(r1**2) + self.body_mass*(r2**2), self.length_off_body_of_reaction_wheel-r1

    def acceleration(self, applied_current, theta):
        torque_motor = applied_current * self.motor_kt
        torque_gravity = (self.handlebar_mass * self.gravity * self.stem_length * math.sin(theta)) + (self.reaction_wheel_mass * self.gravity * self.length_off_body_of_reaction_wheel * math.sin(theta)) # handlebars + reaction wheel
        total_system_inertia = self.BODY_MOMENT_OF_INERTIA + (self.reaction_wheel_mass * self.length_off_body_of_reaction_wheel**2)
        accel = - (torque_motor + torque_gravity) / total_system_inertia
        return accel

    def step(self, applied_current = 0.0):
        self.Y = self.rk4_step(applied_current, self.Y, self.dt)

        theta, w = self.Y
    
        self.x_history.append(self.stem_length * math.sin(theta))
        self.y_history.append(-self.stem_length * math.cos(theta))
        self.theta_history.append(theta)
        self.w_history.append(w)
        self.accel_history.append(self.acceleration(applied_current, theta))
        self.current_history.append(applied_current)

        self.steps += 1

        return theta, w, self.acceleration(applied_current, theta)

    def rhs(self, applied_current, Y):
        "Return the derivatives at the right hand side of the curve being approximated"
        theta, vel = Y 
        accel = self.acceleration(applied_current, theta)
        return np.array([vel, accel]) # [angular velocity (rad/s), acceleration (rad/s^2)]

    def rk4_step(self, applied_current, Y, h):
        "Fourth Order Runge-Kutta Integration"
        k1 = self.rhs(applied_current, Y)
        k2 = self.rhs(applied_current, Y + h/2 * k1)
        k3 = self.rhs(applied_current, Y + h/2 * k2)
        k4 = self.rhs(applied_current, Y + h*k3)

        return Y + (h/6)*(k1+(2*k2)+(2*k3)+k4)

    def show_plot(self):
        # Set up the Matplotlib Figure and Axis
        fig, ax = plt.subplots(figsize=(6, 7))
        fig.subplots_adjust(bottom=0.18)
        ax.set_xlim(-self.stem_length * 1.5, self.stem_length * 1.5)
        ax.set_ylim(-self.stem_length * 1.5, self.stem_length * 1.5)
        ax.set_aspect('equal')
        ax.grid(True, linestyle='--', alpha=0.5)
        ax.set_title("Scooter Simulation", fontsize=14)

        # Gravity forces (N), scaled so the largest arrow is half the stem length
        handlebar_force = self.handlebar_mass * self.gravity
        rw_force = self.reaction_wheel_mass * self.gravity
        # Motor torque expressed as an equivalent tangential force at the reaction wheel (F = T / r)
        motor_forces = [c * self.motor_kt / self.length_off_body_of_reaction_wheel for c in self.current_history]
        max_motor_force = max(abs(f) for f in motor_forces)

        arrow_scale = 0.5 * self.stem_length / max(handlebar_force, rw_force, max_motor_force)
        rw_ratio = self.length_off_body_of_reaction_wheel / self.stem_length

        # Create the visual elements that will be updated each frame
        line, = ax.plot([], [], 'o-', lw=3, color='#1f77b4', markersize=8)  # Pendulum rod and bob
        trace, = ax.plot([], [], '-', lw=1, color='orange', alpha=0.6)      # Trace path of the bob
        rw_marker, = ax.plot([], [], 'o', color='#2ca02c', markersize=12, label='Reaction wheel')
        gravity_arrows = ax.quiver(
            [0, 0], [0, 0], [0, 0], [-handlebar_force * arrow_scale, -rw_force * arrow_scale],
            color=['#d62728', '#9467bd'], angles='xy', scale_units='xy', scale=1, zorder=5
        )
        ax.plot([], [], color='#d62728', lw=2, label=f'Gravity, handlebars ({handlebar_force:.1f} N)')
        ax.plot([], [], color='#9467bd', lw=2, label=f'Gravity, reaction wheel ({rw_force:.1f} N)')
        motor_arrow = ax.quiver([0], [0], [0], [0], color='#ff7f0e', angles='xy',
                                scale_units='xy', scale=1, zorder=5)
        ax.plot([], [], color='#ff7f0e', lw=2, label='Motor torque force')
        ax.legend(loc='lower left', fontsize=8)

        info_box = ax.text(
            0.98, 0.98, "", transform=ax.transAxes, ha='right', va='top', family='monospace',
            fontsize=9, bbox=dict(boxstyle='round', facecolor='white', alpha=0.85)
        )

        def draw_frame(i):
            x, y = self.x_history[i], self.y_history[i]
            rw_x, rw_y = x * rw_ratio, y * rw_ratio

            line.set_data([0, x], [0, y])
            trace.set_data(self.x_history[:i + 1], self.y_history[:i + 1])
            rw_marker.set_data([rw_x], [rw_y])
            gravity_arrows.set_offsets([[x, y], [rw_x, rw_y]])

            # Tangent to the stem; the minus matches accel = -(torque_motor + ...) / inertia
            theta = self.theta_history[i]
            motor_force = motor_forces[i]
            motor_arrow.set_offsets([[rw_x, rw_y]])
            motor_arrow.set_UVC(-motor_force * arrow_scale * math.cos(theta),
                                -motor_force * arrow_scale * math.sin(theta))

            info_box.set_text(
                f"motor = {motor_force:7.2f} N\n"
                f"accel = {self.accel_history[i]:7.2f} rad/s^2\n"
                f"omega = {self.w_history[i]:7.2f} rad/s\n"
                f"theta = {self.theta_history[i]:7.2f} rad"
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


if __name__ == "__main__":
    sim = ScooterReversePendulumReactionWheel(starting_angle=math.pi*(9/8))

    # Sim Constants
    dt = 0.01
    SIM_TIME = 10.0 # (seconds)
    APPLIED_CURRENT = 10.0 # Current (Amps)

    for t in range(int(SIM_TIME/dt)):
        theta, w, a = sim.step(APPLIED_CURRENT)

        print(f"time (s): {t} accel (rad/s^2): {a} angular velocity (rad/s): {w} theta (rad): {theta}")

    sim.show_plot()