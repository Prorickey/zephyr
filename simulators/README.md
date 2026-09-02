# Simulators

The strategy here will be to build a couple different simulators, with each building on the previous or forking from the previous, to answer important questions
about the dynamics of the scooter. Here is a list of important simulators we'll want to build:
- [ ] **Reaction-wheel pendulum simulator**: This will show us the limits of what the reaction wheel can support and help 
us choose a reaction wheel weight and motor for desired outcomes. This will also help us visualize how the scooter will
self stabalize.
- [ ] **Drive Simulator**: Next, we'll extend that simulator to incorporate driving forces to test the limits of the reaction wheel
again against different drive speed and turn angles. One of the big problems we have to solve is how to deal with turning
and managing the reaction wheel inertia. This simulator will help us solve that. 
- [ ] **World Simulation**: This is the big step, it'll likely come further down the line as we need more and more data in order to 
train self driving models for the scooter. 