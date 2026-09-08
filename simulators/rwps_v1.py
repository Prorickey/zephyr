import math
import numpy as np

# This simulation takes a force applied at the location of the reaction wheel
# and simulates the full body of the scooter

# Scooter Pendulum
m1 = 2.0 # (kilograms) mass of the handlebars
l1 = 0.3 # (meters) length from fulcrum of reaction wheel (where force is applied)
l2 = 1.0 # (meters) total lengths of scooter stem
g = 9.81 # (meter/second^2) gravity

STARTING_ANGLE = math.pi/2
APPLIED_FORCE = 5.886 # (N)

dt = 0.01 # (seconds)
SIM_TIME = 10.0 # (seconds)

# state = [theta (rads), angular velocity (rad/second)]
Y = np.array([STARTING_ANGLE, 0.0])

def rhs(Y):
    "Return the derivatives at the right hand side of the curve being approximated"
    theta, vel = Y 
    accel = ((l2*APPLIED_FORCE)/(l1*m1)) - (g*math.sin(theta))
    return np.array([vel / l1, accel]) # [angular velocity (rad/s), acceleration (meter/s^2)]

def rk4_step(Y, h):
    "Fourth Order Runge-Kutta Integration"
    k1 = rhs(Y)
    k2 = rhs(Y + h/2 * k1)
    k3 = rhs(Y + h/2 * k2)
    k4 = rhs(Y + h*k3)

    return Y + (h/6)*(k1+(2*k2)+(2*k3)+k4)

for t in range(int(SIM_TIME/dt)):
    Y = rk4_step(Y, dt)

    theta, w = Y
    accel = ((l2*APPLIED_FORCE)/(l1*m1)) - (g*math.sin(theta))

    print(f"time (s): {t} accel (m/s^2): {accel} angular velocity (rad/s): {w} theta (rad): {theta}")
