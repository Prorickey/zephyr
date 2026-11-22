# Zephyr

Zephyr is a custom electric scooter with autonomous capabilities.

## Features

- **Self-stabilization** — the scooter balances and holds itself upright without a rider.
- **Call scooter** — users can request the scooter, and it automatically finds them within a certain radius.

## Demo

[Video: the scooter balancing itself](system_id/balancing.mp4) with the reaction-wheel LQR controller (2026-11-21).
The gains come from measurements of the real scooter; [system_id/EXPERIMENTS.md](system_id/EXPERIMENTS.md) explains
the tests and how they produced the gains.

## Goal

The goal of the project is to design a functional, small autonomous vehicle.
