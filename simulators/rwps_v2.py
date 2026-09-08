import math
import numpy as np

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

STARTING_ANGLE = math.pi # 0 is pointing straight down, so PI is standing up super straight
APPLIED_CURRENT = 0.0 # (Amps)

dt = 0.01 # (seconds)
SIM_TIME = 10.0 # (seconds)

# state = [theta (rads), angular velocity (rad/second)]
Y = np.array([STARTING_ANGLE, 0.0])

def rhs(Y):
    "Return the derivatives at the right hand side of the curve being approximated"
    theta, vel = Y 
    accel = - (APPLIED_CURRENT*motor_kt + m1*g*math.sin(theta))/(BODY_MOMENT_OF_INTERTIA+(mr*RW_OFFSET**2))
    return np.array([vel, accel]) # [angular velocity (rad/s), acceleration (rad/s^2)]

def rk4_step(Y, h):
    "Fourth Order Runge-Kutta Integration"
    k1 = rhs(Y)
    k2 = rhs(Y + h/2 * k1)
    k3 = rhs(Y + h/2 * k2)
    k4 = rhs(Y + h*k3)

    return Y + (h/6)*(k1+(2*k2)+(2*k3)+k4)

for t in range(int(SIM_TIME/dt)):

    Y = rk4_step(Y, dt)

    a = - (APPLIED_CURRENT*motor_kt + m1*g*math.sin(theta))/(BODY_MOMENT_OF_INTERTIA+(mr*RW_OFFSET**2))
    theta, w = Y

    print(f"time (s): {t} accel (rad/s^2): {a} angular velocity (rad/s): {w} theta (rad): {theta}")
