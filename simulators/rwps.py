import math

# Scooter Pendulum
m1 = 2.0 # (kilograms) mass of the handlebars
l1 = 0.3 # (meters) length from fulcrum of reaction wheel (where force is applied)
l2 = 1.0 # (meters) total lengths of scooter stem
g = 9.81 # (meter/second^2) gravity

STARTING_ANGLE = math.pi/2
APPLIED_FORCE = 5.886 # (N)

dt = 0.01 # (seconds)
SIM_TIME = 10.0 # (seconds)

theta = STARTING_ANGLE
vel = 0.0 # (meter/second)

for t in range(int(SIM_TIME/dt)):

    # calculate accel in meter/second^2
    a = ((l2*APPLIED_FORCE)/(l1*m1)) - (g*math.sin(theta))

    vel = a*dt + vel # calculate velocity 
    w = vel / l1 # convert to angular velocity (rad/s)

    theta = w*dt + theta # adjust theta

    print(f"time (s): {t} accel (m/s^2): {a} angular velocity (rad/s): {w} theta (rad): {theta}")
