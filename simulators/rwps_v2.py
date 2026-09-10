import math
import matplotlib.pyplot as plt
import numpy as np
import matplotlib.animation as animation

# This simulation takes an applied current to the reaction wheel motor
# and simulates the full body of the scooter

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
        fig, ax = plt.subplots(figsize=(6, 6))
        ax.set_xlim(-self.stem_length * 1.5, self.stem_length * 1.5)
        ax.set_ylim(-self.stem_length * 1.5, self.stem_length * 1.5)
        ax.set_aspect('equal')
        ax.grid(True, linestyle='--', alpha=0.5)
        ax.set_title("Scooter Simulation", fontsize=14)

        # Create the visual elements that will be updated in the animation loop
        line, = ax.plot([], [], 'o-', lw=3, color='#1f77b4', markersize=8)  # Pendulum rod and bob
        trace, = ax.plot([], [], '-', lw=1, color='orange', alpha=0.6)      # Trace path of the bob

        def init():
            line.set_data([], [])
            trace.set_data([], [])
            return line, trace

        # Animation function: called sequentially for each frame `i`
        def animate(i):
            # Segment representing the rod from the origin (0,0) to the bob (x, y)
            this_x = [0, self.x_history[i]]
            this_y = [0, self.y_history[i]]
            line.set_data(this_x, this_y)
            
            # Update the fading history trace path
            trace.set_data(self.x_history[:i], self.y_history[:i])
            
            return line, trace

        animation.FuncAnimation(
            fig, animate, init_func=init, frames=int(self.steps), 
            interval=self.dt*1000, blit=True, repeat=True
        )

        plt.show()


if __name__ == "__main__":
    sim = ScooterReversePendulumReactionWheel()

    # Sim Constants
    dt = 0.01
    SIM_TIME = 10.0 # (seconds)
    APPLIED_CURRENT = 3.5 # Current (Amps)

    for t in range(int(SIM_TIME/dt)):
        theta, w, a = sim.step(APPLIED_CURRENT)

        print(f"time (s): {t} accel (rad/s^2): {a} angular velocity (rad/s): {w} theta (rad): {theta}")

    sim.show_plot()