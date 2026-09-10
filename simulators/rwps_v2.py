import math
import matplotlib.pyplot as plt
import numpy as np
import matplotlib.animation as animation

# This simulation takes an applied current to the reaction wheel motor
# and simulates the full body of the scooter

# Scooter Pendulum
m1 = 2.0 # (kilograms) mass of the handlebars
m2 = 35.0 # (kilograms) mass of deck and body
mr = 5.0 # (kilograms) mass of reaction wheel
l1 = 0.3 # (meters) length from fulcrum of reaction wheel (where force is applied)
l2 = 1.0 # (meters) total lengths of scooter stem
g = 9.81 # (meter/second^2) gravity
motor_kt = 1.0 # (Nm/A) motor constant T (torque) = A (current) * Kt (motor constant)

# Calculated Constants

def body_moment_of_intertia():
    m12 = m1 + m2

    r1 = l1*m1/m12
    r2 = l1*m2/m12

    return m1*(r1**2) + m2*(r2**2), l1-r1

BODY_MOMENT_OF_INTERTIA, RW_OFFSET = body_moment_of_intertia()

STARTING_ANGLE = math.pi*(9/8) # 0 is pointing straight down, so PI is standing up super straight
APPLIED_CURRENT = 25.0 # (Amps)

dt = 0.01 # (seconds)
SIM_TIME = 10.0 # (seconds)

# state = [theta (rads), angular velocity (rad/second)]
Y = np.array([STARTING_ANGLE, 0.0])

def acceleration(theta):
    torque_motor = APPLIED_CURRENT * motor_kt
    torque_gravity = (m1 * g * l2 * math.sin(theta)) + (mr * g * l1 * math.sin(theta)) # handlebars + reaction wheel
    total_system_inertia = BODY_MOMENT_OF_INTERTIA + (mr * l1**2)
    accel = - (torque_motor + torque_gravity) / total_system_inertia
    return accel

def rhs(Y):
    "Return the derivatives at the right hand side of the curve being approximated"
    theta, vel = Y 
    accel = acceleration(theta)
    return np.array([vel, accel]) # [angular velocity (rad/s), acceleration (rad/s^2)]

def rk4_step(Y, h):
    "Fourth Order Runge-Kutta Integration"
    k1 = rhs(Y)
    k2 = rhs(Y + h/2 * k1)
    k3 = rhs(Y + h/2 * k2)
    k4 = rhs(Y + h*k3)

    return Y + (h/6)*(k1+(2*k2)+(2*k3)+k4)

x_history = []
y_history = []

for t in range(int(SIM_TIME/dt)):

    Y = rk4_step(Y, dt)

    theta, w = Y
    a = acceleration(theta)

    x_history.append(l2 * math.sin(theta))
    y_history.append(-l2 * math.cos(theta))

    print(f"time (s): {t} accel (rad/s^2): {a} angular velocity (rad/s): {w} theta (rad): {theta}")

# Set up the Matplotlib Figure and Axis
fig, ax = plt.subplots(figsize=(6, 6))
ax.set_xlim(-l2 * 1.5, l2 * 1.5)
ax.set_ylim(-l2 * 1.5, l2 * 1.5)
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
    this_x = [0, x_history[i]]
    this_y = [0, y_history[i]]
    line.set_data(this_x, this_y)
    
    # Update the fading history trace path
    trace.set_data(x_history[:i], y_history[:i])
    
    return line, trace

ani = animation.FuncAnimation(
    fig, animate, init_func=init, frames=int(SIM_TIME/dt), 
    interval=dt*1000, blit=True, repeat=True
)

plt.show()