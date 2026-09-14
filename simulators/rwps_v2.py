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

    def __init__(self, handlebar_mass = 2.0, body_mass = 35.0, reaction_wheel_mass = 1.0, 
                 length_off_body_of_reaction_wheel = 0.3, stem_length = 1.0, motor_kt = 0.0503, 
                 starting_angle = math.pi, rw_stall_torque = 8.0, rw_max_speed = 883.4, dt = 0.01, gravity = 9.81):
        """
        handlebar_mass = 2.0 # (kilograms) mass of the handlebars\n
        body_mass = 35.0 # (kilograms) mass of deck and body\n
        reaction_wheel_mass = 5.0 # (kilograms) mass of reaction wheel\n
        length_off_body_of_reaction_wheel = 0.3 # (meters) length from fulcrum of reaction wheel (where force is applied)\n
        stem_length = 1.0 # (meters) total lengths of scooter stem\n
        motor_kt = 1.0 # (Nm/A) motor constant T (torque) = A (current) * Kt (motor constant)\n
        starting_angle = PI # PI is facing straigtht up\n
        rw_stall_torque = 40.0 # (Nm) stall torque for reaction wheel\n
        rw_max_speed = 400.0 # (rad/s) max angular velocity no load
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
        self.rw_stall_torque = rw_stall_torque
        self.rw_max_speed = rw_max_speed
        self.dt = dt
        self.gravity = gravity 

        self.x_history = []
        self.y_history = []
        self.theta_history = []
        self.w_history = []
        self.accel_history = []
        self.current_history = []
        self.rw_x_history = []
        self.rw_y_history = []
        self.rw_w_history = []
        self.motor_torque_history = []
        self.motor_force_history = []          # (fx, fy) in N, tangential force at the reaction wheel
        self.handlebar_gravity_history = []    # (fx, fy) in N
        self.rw_gravity_history = []           # (fx, fy) in N

        self.steps = 0

        # state = [theta (rads), angular velocity (rad/second)]
        self.Y = np.array([starting_angle, 0.0])

        # state = angular velocity (rad/second)
        self.Y_rw = 0.0

        self.BODY_MOMENT_OF_INERTIA, self.RW_OFFSET = self.body_moment_of_intertia()

    def body_moment_of_intertia(self):
        m12 = self.handlebar_mass + self.body_mass
        r1 = self.length_off_body_of_reaction_wheel*self.handlebar_mass/m12
        r2 = self.length_off_body_of_reaction_wheel*self.body_mass/m12

        return self.handlebar_mass*(r1**2) + self.body_mass*(r2**2), self.length_off_body_of_reaction_wheel-r1

    def acceleration(self, rw_control_input, theta, w):
        torque_motor = self.rw_torque(rw_control_input, w)
        torque_gravity = (self.handlebar_mass * self.gravity * self.stem_length * math.sin(theta)) + (self.reaction_wheel_mass * self.gravity * self.length_off_body_of_reaction_wheel * math.sin(theta)) # handlebars + reaction wheel
        total_system_inertia = self.BODY_MOMENT_OF_INERTIA + (self.reaction_wheel_mass * self.length_off_body_of_reaction_wheel**2)
        accel = - (torque_motor + torque_gravity) / total_system_inertia
        return accel

    def rw_torque(self, applied_input, angular_velocity):
        return applied_input * self.rw_stall_torque - angular_velocity*(self.rw_stall_torque/self.rw_max_speed)

    def step(self, rw_control_input = 0.0):
        self.Y = self.rk4_step_body(rw_control_input, self.Y, self.dt)

        theta, w = self.Y
        accel = self.acceleration(rw_control_input, theta, w)

        self.Y_rw = self.rk4_step_rw(rw_control_input, self.Y_rw, self.dt)
    
        self.x_history.append(self.stem_length * math.sin(theta))
        self.y_history.append(-self.stem_length * math.cos(theta))
        self.theta_history.append(theta)
        self.w_history.append(w)
        self.accel_history.append(accel)
        self.current_history.append(rw_control_input)

        self.rw_x_history.append(self.length_off_body_of_reaction_wheel * math.sin(theta))
        self.rw_y_history.append(-self.length_off_body_of_reaction_wheel * math.cos(theta))
        self.rw_w_history.append(self.Y_rw)

        # Motor torque as an equivalent tangential force at the reaction wheel (F = T / r);
        # the minus matches accel = -(torque_motor + ...) / inertia
        torque_motor = self.rw_torque(rw_control_input, w)
        motor_force = torque_motor / self.length_off_body_of_reaction_wheel
        self.motor_torque_history.append(torque_motor)
        self.motor_force_history.append((-motor_force * math.cos(theta), -motor_force * math.sin(theta)))
        self.handlebar_gravity_history.append((0.0, -self.handlebar_mass * self.gravity))
        self.rw_gravity_history.append((0.0, -self.reaction_wheel_mass * self.gravity))

        self.steps += 1

        return theta, w, accel

    def rk4_step_body(self, rw_control_input, Y, h):
        "Fourth Order Runge-Kutta Integration"
        def rhs(state):
            "Return the derivatives at the right hand side of the curve being approximated"
            theta, vel = state
            accel = self.acceleration(rw_control_input, theta, vel)
            return np.array([vel, accel]) # [angular velocity (rad/s), acceleration (rad/s^2)]
        
        k1 = rhs(Y)
        k2 = rhs(Y + h/2 * k1)
        k3 = rhs(Y + h/2 * k2)
        k4 = rhs(Y + h*k3)

        return Y + (h/6)*(k1+(2*k2)+(2*k3)+k4)

    def rk4_step_rw(self, rw_control_input, Y, h):
        "Fourth Order Runge-Kutta Integration"
        def rhs(state):
            torque_motor = self.rw_torque(rw_control_input, state)
            motor_accel = torque_motor / self.reaction_wheel_mass
            return motor_accel
        
        k1 = rhs(Y)
        k2 = rhs(Y + h/2 * k1)
        k3 = rhs(Y + h/2 * k2)
        k4 = rhs(Y + h*k3)

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

        # Arrow length scale: the largest recorded force is drawn at half the stem length
        all_forces = self.handlebar_gravity_history + self.rw_gravity_history + self.motor_force_history
        arrow_scale = 0.5 * self.stem_length / max(math.hypot(fx, fy) for fx, fy in all_forces)

        # Create the visual elements that will be updated each frame
        line, = ax.plot([], [], 'o-', lw=3, color='#1f77b4', markersize=8)  # Pendulum rod and bob
        trace, = ax.plot([], [], '-', lw=1, color='orange', alpha=0.6)      # Trace path of the bob
        rw_marker, = ax.plot([], [], 'o', color='#2ca02c', markersize=12, label='Reaction wheel')
        force_arrows = ax.quiver(
            [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
            color=['#d62728', '#9467bd', '#ff7f0e'], angles='xy', scale_units='xy', scale=1, zorder=5
        )
        ax.plot([], [], color='#d62728', lw=2, label='Gravity, handlebars')
        ax.plot([], [], color='#9467bd', lw=2, label='Gravity, reaction wheel')
        ax.plot([], [], color='#ff7f0e', lw=2, label='Motor torque force')
        ax.legend(loc='lower left', fontsize=8)

        info_box = ax.text(
            0.98, 0.98, "", transform=ax.transAxes, ha='right', va='top', family='monospace',
            fontsize=9, bbox=dict(boxstyle='round', facecolor='white', alpha=0.85)
        )

        def draw_frame(i):
            x, y = self.x_history[i], self.y_history[i]
            rw_x, rw_y = self.rw_x_history[i], self.rw_y_history[i]

            line.set_data([0, x], [0, y])
            trace.set_data(self.x_history[:i + 1], self.y_history[:i + 1])
            rw_marker.set_data([rw_x], [rw_y])

            forces = [self.handlebar_gravity_history[i], self.rw_gravity_history[i], self.motor_force_history[i]]
            force_arrows.set_offsets([[x, y], [rw_x, rw_y], [rw_x, rw_y]])
            force_arrows.set_UVC([fx * arrow_scale for fx, _ in forces],
                                 [fy * arrow_scale for _, fy in forces])

            info_box.set_text(
                f"motor = {self.motor_torque_history[i]:7.2f} Nm\n"
                f"rw w  = {self.rw_w_history[i]:7.2f} rad/s\n"
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

    offset_angle = math.radians(20)

    sim = ScooterReversePendulumReactionWheel(starting_angle=math.pi+offset_angle)

    # Sim Constants
    dt = 0.01
    SIM_TIME = 10.0 # (seconds)
    RW_CONTROL_INPUT = 1.0 # Control Input: -1.0-1.0 scale where 0-1 is a linear scale of power

    for t in range(int(SIM_TIME/dt)):
        sim.step(RW_CONTROL_INPUT)

    sim.show_plot()