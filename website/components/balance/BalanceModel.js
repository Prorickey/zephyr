'use client';

import { useEffect, useRef, useState } from 'react';
import { BalanceSim, DEFAULT_WEIGHTS, maxRecoveryAngle } from '@/lib/balance';
import styles from './BalanceModel.module.css';

// Interactive 3D model of the scooter balancing on its reaction wheel. The
// physics and the LQR are lib/balance.js (the same model as our Python
// simulator); the drawing is ./scene.js, whose three.js bundle is only loaded
// once the model scrolls near the viewport. Everything that changes every
// frame (readouts, bars, chart, labels) is written straight to the DOM so
// React only re-renders when a control changes.

const DEG = 180 / Math.PI;
const RPM = 60 / (2 * Math.PI);
const NUDGE_MS = 160; // a tap on a push button or arrow key pushes at least this long
const DRAG_STIFFNESS = 250; // (N/m) the "hand" you drag the scooter with
const DRAG_DAMPING = 30; // (N s/m)
const DRAG_MAX = 40; // (N)
const TIP_ANGLE = 4 / DEG;
const CHART_SECONDS = 10;
const CHART_CAPACITY = 1024;
const CHART_STEP = 0.015; // (s of sim time) between chart samples
const CHART_LEAN = 15; // (deg) lean axis spans +/- this
const BAR_VOLTS = 12; // contribution bars span +/- this

const logScale = (min, max) => ({
  value: (s) => min * (max / min) ** s,
  slider: (v) => Math.log(v / min) / Math.log(max / min),
});
const Q_SCALE = logScale(10, 1e5);
const R_SCALE = logScale(1e-3, 1);

// A minus sign rather than a hyphen, and no sign on zero
function signed(value, digits) {
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return fixed;
  return (value > 0 ? '+' : '−') + fixed;
}
const gain = (k) => k.toPrecision(3).replace('-', '−');
const grouped = (value) => Math.round(value).toLocaleString('en-US').replace('-', '−');

const STATES = [
  { symbol: 'θ', name: 'Lean', unit: 'V/rad', format: (x) => `${signed(x * DEG, 2)}°` },
  { symbol: 'θ̇', name: 'Lean rate', unit: 'V·s/rad', format: (x) => `${signed(x * DEG, 1)}°/s` },
  { symbol: 'φ', name: 'Flywheel angle', unit: 'V/rad', format: (x) => `${signed(x / (2 * Math.PI), 2)} turns` },
  { symbol: 'ω', name: 'Flywheel speed', unit: 'V·s/rad', format: (x) => `${signed(x * RPM, 0)} rpm` },
];

const LABELS = [
  { id: 'flywheel', text: (mass) => `Flywheel · ${mass} kg` },
  { id: 'electronics', text: () => 'ESP32 · IMU · VESC' },
  { id: 'pivot', text: () => 'Pivot: tire contact line' },
];

const dragForce = (dx, vx) =>
  Math.max(-DRAG_MAX, Math.min(DRAG_MAX, DRAG_STIFFNESS * dx - DRAG_DAMPING * vx));

export default function BalanceModel() {
  const simRef = useRef(null);
  if (simRef.current === null) simRef.current = new BalanceSim();
  const stageRef = useRef(null);
  const chartRef = useRef(null);
  const sceneRef = useRef(null);
  const ui = useRef({});
  const input = useRef({ holds: new Map(), nudgeDir: 0, nudgeUntil: 0, drag: null, orbit: null });
  const chartData = useRef(null);
  const settings = useRef({ controllerOn: true, strength: 4, labelsOn: true });
  const recoveryTimer = useRef(0);
  const kickLoop = useRef(() => {});
  const tipSide = useRef(1);

  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [controllerOn, setControllerOn] = useState(true);
  const [strength, setStrength] = useState(4);
  const [labelsOn, setLabelsOn] = useState(true);
  const [view, setView] = useState('quarter');
  const [qTheta, setQTheta] = useState(DEFAULT_WEIGHTS.qTheta);
  const [r, setR] = useState(DEFAULT_WEIGHTS.r);
  const [wheelMass, setWheelMass] = useState(3);
  const [lqr, setLqr] = useState(() => simRef.current.lqr);
  const [recovery, setRecovery] = useState(null);

  const bind = (key) => (el) => {
    ui.current[key] = el;
  };

  useEffect(() => {
    settings.current = { controllerOn, strength, labelsOn };
  }, [controllerOn, strength, labelsOn]);

  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  // ---- recovery angle: a few hundred ms of simulation, run after controls settle ----
  const scheduleRecovery = () => {
    clearTimeout(recoveryTimer.current);
    recoveryTimer.current = setTimeout(() => {
      const sim = simRef.current;
      setRecovery(maxRecoveryAngle(sim.params, sim.weights) * DEG);
    }, 300);
  };
  useEffect(() => {
    scheduleRecovery();
    return () => clearTimeout(recoveryTimer.current);
  }, []);

  // ---- pushes from the buttons and arrow keys ----
  const press = (source, dir) => {
    const state = input.current;
    state.holds.set(source, dir);
    state.nudgeDir = dir;
    state.nudgeUntil = performance.now() + NUDGE_MS;
  };
  const release = (source) => input.current.holds.delete(source);
  const nudge = (dir) => {
    input.current.nudgeDir = dir;
    input.current.nudgeUntil = performance.now() + NUDGE_MS * 1.5;
  };

  // ---- the render loop, created once ----
  useEffect(() => {
    const stage = stageRef.current;
    const chartCanvas = chartRef.current;
    const sim = simRef.current;
    const state = input.current;
    const reducedMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.hasAttribute('data-noanim');
    let scene = null;
    let canvas = null;
    let handlebarZ = 0;
    let disposed = false;
    let visible = false;
    let started = false;
    let raf = 0;
    let last = 0;
    let quietFrames = 0;
    const chart = {
      t: new Float64Array(CHART_CAPACITY),
      lean: new Float32Array(CHART_CAPACITY),
      speed: new Float32Array(CHART_CAPACITY),
      head: 0,
      count: 0,
    };
    chartData.current = chart;

    function currentPush(now) {
      if (state.drag && state.drag.target) return { kind: 'drag', drag: state.drag };
      let dir = 0;
      for (const d of state.holds.values()) dir += d;
      dir = Math.sign(dir);
      if (!dir && now < state.nudgeUntil) dir = state.nudgeDir;
      return dir ? { kind: 'button', dir } : null;
    }

    // Torque about the pivot from the push, for any state x = [theta, theta_dot, ...]
    function pushTorque(push, x) {
      if (!push) return { torque: 0, force: 0, py: 0, px: 0 };
      const c = Math.cos(x[0]);
      const s = Math.sin(x[0]);
      if (push.kind === 'button') {
        const force = push.dir * settings.current.strength;
        const py = sim.plant.stemLength * c;
        return { torque: -force * py, force, px: -sim.plant.stemLength * s, py };
      }
      const { local, target } = push.drag;
      const px = local.x * c - local.y * s;
      const py = local.x * s + local.y * c;
      const force = dragForce(target.x - px, -x[1] * py);
      return { torque: -py * force, force, px, py };
    }

    function ensureScene() {
      if (started) return;
      started = true;
      setStatus('loading');
      import('three')
        .then(async (THREE) => {
          const { createScene, HANDLEBAR_Z } = await import('./scene');
          if (disposed) return;
          canvas = document.createElement('canvas');
          canvas.className = styles.canvas;
          stage.prepend(canvas);
          scene = createScene(THREE, canvas, sim.plant, { reducedMotion });
          handlebarZ = HANDLEBAR_Z;
          sceneRef.current = scene;
          resize();
          setStatus('ready');
          // A first lean so the controller has something to catch
          if (!reducedMotion && sim.time === 0) sim.reset(2.5 / DEG);
          kick();
        })
        .catch(() => {
          canvas?.remove();
          canvas = null;
          if (!disposed) setStatus('error');
        });
    }

    function resize() {
      if (scene) scene.setSize(stage.clientWidth, stage.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      chartCanvas.width = Math.round(chartCanvas.clientWidth * ratio);
      chartCanvas.height = Math.round(chartCanvas.clientHeight * ratio);
      quietFrames = 0;
    }

    let lastSample = -Infinity;
    function record() {
      if (sim.time - lastSample < CHART_STEP && sim.time >= lastSample) return;
      lastSample = sim.time;
      const i = chart.head;
      chart.t[i] = sim.time;
      chart.lean[i] = sim.state[0] * DEG;
      chart.speed[i] = sim.state[3] * RPM;
      chart.head = (i + 1) % CHART_CAPACITY;
      chart.count = Math.min(chart.count + 1, CHART_CAPACITY);
    }

    function drawChart() {
      const ctx = chartCanvas.getContext('2d');
      const w = chartCanvas.width;
      const h = chartCanvas.height;
      const ratio = w / Math.max(1, chartCanvas.clientWidth);
      ctx.clearRect(0, 0, w, h);
      const mid = h / 2;
      const yLean = (deg) => mid - (Math.max(-CHART_LEAN, Math.min(CHART_LEAN, deg)) / CHART_LEAN) * (mid - 4 * ratio);
      const topSpeed = sim.plant.noLoadSpeed * RPM;
      const ySpeed = (rpm) => mid - (Math.max(-topSpeed, Math.min(topSpeed, rpm)) / topSpeed) * (mid - 4 * ratio);
      const xAt = (t) => w - ((sim.time - t) / CHART_SECONDS) * w;

      ctx.strokeStyle = 'rgba(247, 245, 240, 0.18)';
      ctx.lineWidth = ratio;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      const series = (values, y, style, dash) => {
        ctx.strokeStyle = style;
        ctx.setLineDash(dash.map((d) => d * ratio));
        ctx.lineWidth = 1.5 * ratio;
        ctx.beginPath();
        let started = false;
        for (let n = chart.count; n >= 1; n--) {
          const i = (chart.head - n + CHART_CAPACITY) % CHART_CAPACITY;
          if (sim.time - chart.t[i] > CHART_SECONDS) continue;
          const x = xAt(chart.t[i]);
          const yy = y(values[i]);
          if (started) ctx.lineTo(x, yy);
          else ctx.moveTo(x, yy);
          started = true;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      series(chart.speed, ySpeed, 'rgba(138, 138, 134, 0.9)', [4, 3]);
      series(chart.lean, yLean, '#f7f5f0', []);
    }

    function writeReadouts(push, info) {
      const u = ui.current;
      const [theta, thetaDot, , omega] = sim.state;
      u.theta.textContent = `${signed(theta * DEG, 2)}°`;
      u.thetaDot.textContent = `${signed(thetaDot * DEG, 1)}°/s`;
      u.speed.textContent = `${grouped(omega * RPM)} rpm`;
      u.torque.textContent = `${signed(-sim.torque, 2)} N·m`;
      u.current.textContent = `${signed(sim.current, 0)} A`;
      u.push.textContent = push ? `${signed(info.force, 1)} N` : '0 N';

      const contributions = sim.contributions();
      contributions.forEach((volts, i) => {
        u[`x${i}`].textContent = STATES[i].format(sim.state[i]);
        u[`c${i}`].textContent = `${signed(volts, 2)} V`;
        u[`b${i}`].style.transform = `scaleX(${Math.max(-1, Math.min(1, volts / BAR_VOLTS))})`;
      });
      u.command.textContent = `${signed(sim.command, 2)} V`;
      u.commandBar.style.transform = `scaleX(${Math.max(-1, Math.min(1, sim.command / BAR_VOLTS))})`;

      let mode = 'balancing';
      let text = 'Balancing';
      if (sim.fallen) {
        mode = 'fallen';
        text = 'Fell over';
      } else if (!settings.current.controllerOn) {
        mode = 'off';
        text = 'Controller off';
      } else if (sim.limited) {
        mode = 'limit';
        text = 'Motor at its limit';
      } else if (push) {
        text = 'Fighting the push';
      }
      u.status.textContent = text;
      stage.dataset.mode = mode;
    }

    // Text runs right of its anchor unless that would leave the stage, then
    // left. A label that would overlap one placed before it is hidden.
    const labelWidths = new Map();
    function placeLabels() {
      const positions = scene.labelPositions();
      const show = settings.current.labelsOn;
      const stageWidth = stage.clientWidth;
      const placed = [];
      for (const { id } of LABELS) {
        const el = ui.current[`label-${id}`];
        const text = el.textContent;
        if (labelWidths.get(id)?.text !== text) {
          labelWidths.set(id, { text, width: el.firstChild.offsetWidth });
        }
        const { width } = labelWidths.get(id);
        const p = positions[id];
        const flip = p.x + width + 8 > stageWidth;
        const box = flip ? [p.x - width, p.x] : [p.x, p.x + width];
        const clear = !placed.some(
          ([x0, x1, y]) => box[0] < x1 && box[1] > x0 && Math.abs(p.y - y) < 18
        );
        const visible = show && p.visible && clear;
        if (visible) placed.push([box[0], box[1], p.y]);
        el.style.opacity = visible ? '1' : '0';
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el.dataset.flip = flip ? 'left' : 'right';
      }
      const lean = ui.current.leanLabel;
      lean.textContent = `θ ${signed(sim.state[0] * DEG, 1)}°`;
      lean.style.transform = `translate(${positions.lean.x}px, ${positions.lean.y}px)`;
      lean.style.opacity = positions.lean.visible ? '1' : '0';
    }

    function frame(now) {
      raf = 0;
      if (disposed || !visible || !scene) return;
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;

      const push = sim.fallen ? null : currentPush(now);
      sim.advance(dt, {
        controllerOn: settings.current.controllerOn,
        extTorque: (x) => pushTorque(push, x).torque,
      });
      const info = pushTorque(push, sim.state);
      record();

      // Settled with nothing to do: stop redrawing until something changes
      const [theta, thetaDot, , omega] = sim.state;
      const quiet =
        !push && !state.orbit && scene.cameraSettled() &&
        (sim.fallen || (Math.abs(theta) < 1e-5 && Math.abs(thetaDot) < 1e-5 && Math.abs(omega) < 1e-3));
      quietFrames = quiet ? quietFrames + 1 : 0;

      if (quietFrames < 3) {
        let scenePush = null;
        if (push) {
          const point = { x: info.px, y: info.py, z: push.kind === 'drag' ? push.drag.local.z : handlebarZ };
          scenePush = { force: info.force, point, target: push.kind === 'drag' ? push.drag.target : null };
        }
        scene.update(
          {
            theta,
            phi: sim.state[2],
            omega,
            frameTorque: -sim.torque,
            peakTorque: sim.plant.peakTorque,
            push: scenePush,
          },
          dt
        );
        scene.render();
        placeLabels();
        writeReadouts(push, info);
        drawChart();
      }
      raf = requestAnimationFrame(frame);
    }

    function kick() {
      quietFrames = 0;
      if (!raf && visible && scene) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }
    kickLoop.current = kick;

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          ensureScene();
          kick();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(stage);
    const resizer = new ResizeObserver(resize);
    resizer.observe(stage);
    resizer.observe(chartCanvas);

    // Losing focus mid-push would otherwise leave a key or button held forever
    const releaseAll = () => {
      state.holds.clear();
      state.drag = null;
      state.orbit = null;
    };
    window.addEventListener('blur', releaseAll);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizer.disconnect();
      window.removeEventListener('blur', releaseAll);
      if (scene) scene.dispose();
      if (canvas) canvas.remove();
      sceneRef.current = null;
      kickLoop.current = () => {};
    };
  }, []);

  const kick = () => kickLoop.current();

  // ---- pointer: drag the scooter to push it, drag anywhere else to orbit ----
  const toNdc = (event) => {
    const rect = stageRef.current.getBoundingClientRect();
    return [((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1];
  };

  const onPointerDown = (event) => {
    const scene = sceneRef.current;
    if (!scene || event.button !== 0 || event.target.closest('button')) return;
    const [x, y] = toNdc(event);
    const hit = simRef.current.fallen ? null : scene.pick(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit) {
      input.current.drag = {
        pointerId: event.pointerId,
        local: hit.local,
        target: scene.pointerOnPlane(x, y, hit.local.z),
      };
      event.currentTarget.dataset.dragging = 'push';
    } else {
      input.current.orbit = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.dataset.dragging = 'orbit';
    }
    kick();
  };

  const onPointerMove = (event) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const { drag, orbit } = input.current;
    if (drag && drag.pointerId === event.pointerId) {
      const [x, y] = toNdc(event);
      drag.target = scene.pointerOnPlane(x, y, drag.local.z) || drag.target;
    } else if (orbit && orbit.pointerId === event.pointerId) {
      scene.orbitBy(event.clientX - orbit.x, event.clientY - orbit.y);
      orbit.x = event.clientX;
      orbit.y = event.clientY;
      kick();
    } else if (event.pointerType === 'mouse') {
      const [x, y] = toNdc(event);
      event.currentTarget.dataset.hover = scene.pick(x, y) && !simRef.current.fallen ? 'scooter' : '';
    }
  };

  const endPointer = (event) => {
    const state = input.current;
    if (state.drag?.pointerId === event.pointerId) state.drag = null;
    if (state.orbit?.pointerId === event.pointerId) state.orbit = null;
    delete event.currentTarget.dataset.dragging;
  };

  const onKeyDown = (event) => {
    const dir = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    event.preventDefault();
    if (!event.repeat) press(`key${dir}`, dir);
    kick();
  };
  const onKeyUp = (event) => {
    if (event.key === 'ArrowLeft') release('key-1');
    if (event.key === 'ArrowRight') release('key1');
  };

  // ---- controls ----
  const pushButton = (dir, label) => ({
    type: 'button',
    className: styles.btn,
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      press(`button${dir}`, dir);
      kick();
    },
    onPointerUp: () => release(`button${dir}`),
    onPointerCancel: () => release(`button${dir}`),
    onLostPointerCapture: () => release(`button${dir}`),
    // Keyboard activation (Enter / Space) arrives as a click with no pointer
    onClick: (event) => {
      if (event.detail === 0) {
        nudge(dir);
        kick();
      }
    },
    'aria-label': label,
  });

  const resetTo = (theta) => {
    const sim = simRef.current;
    sim.reset(theta);
    input.current.drag = null;
    const chart = chartData.current;
    if (chart) {
      chart.head = 0;
      chart.count = 0;
    }
    kick();
  };

  const tip = () => {
    tipSide.current = -tipSide.current;
    resetTo(tipSide.current * TIP_ANGLE);
  };

  const toggleController = () => {
    const sim = simRef.current;
    // A real scooter is never exactly upright: give it a hair of lean to fall from
    if (controllerOn && !sim.fallen && Math.abs(sim.state[0]) < 1e-3) sim.state[0] += 0.003;
    setControllerOn((on) => !on);
    kick();
  };

  const retune = (weights) => {
    const sim = simRef.current;
    sim.setWeights(weights);
    setLqr(sim.lqr);
    scheduleRecovery();
    kick();
  };

  const changeMass = (mass) => {
    const sim = simRef.current;
    sim.setParams({ ...sim.params, wheelMass: mass });
    sceneRef.current?.setPlant(sim.plant);
    setWheelMass(mass);
    setLqr(sim.lqr);
    scheduleRecovery();
    kick();
  };

  const sim = simRef.current;

  return (
    <figure className={styles.model}>
      <div
        ref={stageRef}
        className={styles.stage}
        tabIndex={0}
        role="application"
        aria-label="Interactive 3D model of the scooter balancing on its flywheel. Use the left and right arrow keys to push it."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          release('key-1');
          release('key1');
        }}
      >
        <div className={styles.labels} aria-hidden="true">
          {LABELS.map(({ id, text }) => (
            <span key={id} className={styles.anchor} ref={bind(`label-${id}`)}>
              <span className={styles.label}>{text(wheelMass)}</span>
            </span>
          ))}
          <span ref={bind('leanLabel')} className={styles.leanLabel} />
        </div>

        <dl className={styles.hud} aria-hidden="true">
          <dt>Lean</dt>
          <dd ref={bind('theta')}>0.00°</dd>
          <dt>Lean rate</dt>
          <dd ref={bind('thetaDot')}>0.0°/s</dd>
          <dt>Flywheel</dt>
          <dd ref={bind('speed')}>0 rpm</dd>
          <dt>Motor on frame</dt>
          <dd ref={bind('torque')}>0.00 N·m</dd>
          <dt>Current</dt>
          <dd ref={bind('current')}>0 A</dd>
          <dt>Push</dt>
          <dd ref={bind('push')}>0 N</dd>
        </dl>

        <div className={styles.corner}>
          <p className={styles.status} ref={bind('status')}>
            Balancing
          </p>
          <div className={styles.views} role="group" aria-label="Camera">
            {[
              ['quarter', '¾ view'],
              ['rear', 'Rear'],
              ['side', 'Side'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={styles.viewBtn}
                aria-pressed={view === id}
                onClick={() => {
                  setView(id);
                  kick();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fall}>
          <p>It fell over.</p>
          <p className={styles.fallNote}>
            Past about {recovery ? recovery.toFixed(1) : '6.6'}° the flywheel can&apos;t push back hard enough.
          </p>
          <button type="button" className={styles.btn} onClick={() => resetTo(0)}>
            Stand it back up
          </button>
        </div>

        {status !== 'ready' && (
          <p className={styles.placeholder}>
            {status === 'error'
              ? 'The 3D model needs WebGL, which this browser has turned off.'
              : 'Loading the model…'}
          </p>
        )}
        <p className={styles.hint} aria-hidden="true">
          Drag the scooter to push it · drag the background to look around
          <span className={styles.hintKeys}> · ← → keys push</span>
        </p>
      </div>

      <div className={styles.chart}>
        <p className={styles.legend} aria-hidden="true">
          <span className={styles.keyLean}>Lean, ±{CHART_LEAN}°</span>
          <span className={styles.keySpeed}>Flywheel speed, ±{grouped(sim.plant.noLoadSpeed * RPM)} rpm</span>
          <span className={styles.keyTime}>last {CHART_SECONDS} s</span>
        </p>
        <canvas ref={chartRef} className={styles.chartCanvas} aria-hidden="true" />
      </div>

      <div className={styles.panels}>
        <section className={styles.law} aria-label="Control law">
          <h3 className={styles.panelTitle}>
            The control law, <span className={styles.math}>u = −Kx</span>
          </h3>
          <p className={styles.panelNote}>
            Every 5 ms the controller multiplies the state by fixed gains and sends the sum to the
            motor as a voltage.
          </p>
          <table className={styles.lawTable}>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Now</th>
                <th scope="col">Gain K</th>
                <th scope="col" colSpan={2}>
                  Share of u
                </th>
              </tr>
            </thead>
            <tbody>
              {STATES.map((row, i) => (
                <tr key={row.symbol}>
                  <th scope="row">
                    <span className={styles.math}>{row.symbol}</span> {row.name}
                  </th>
                  <td ref={bind(`x${i}`)}>{row.format(0)}</td>
                  <td>
                    {gain(lqr.K[i])} <span className={styles.unit}>{row.unit}</span>
                  </td>
                  <td ref={bind(`c${i}`)}>0.00 V</td>
                  <td className={styles.barCell}>
                    <span className={styles.bar}>
                      <span ref={bind(`b${i}`)} className={styles.barFill} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">
                  <span className={styles.math}>u</span> Motor command
                </th>
                <td />
                <td />
                <td ref={bind('command')}>0.00 V</td>
                <td className={styles.barCell}>
                  <span className={styles.bar}>
                    <span ref={bind('commandBar')} className={styles.barFill} />
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
          <p className={styles.panelNote}>
            K comes from solving the Riccati equation offline ({lqr.iterations.toLocaleString('en-US')}{' '}
            iterations for these weights). The flywheel angle term slowly bleeds the flywheel back to
            rest so it never runs out of speed.
          </p>
        </section>

        <section className={styles.controls} aria-label="Controls">
          <h3 className={styles.panelTitle}>Try it</h3>
          <div className={styles.buttonRow}>
            <button {...pushButton(-1, 'Push left')}>← Push</button>
            <button {...pushButton(1, 'Push right')}>Push →</button>
            <button type="button" className={styles.btn} onClick={tip}>
              Lean 4° and let go
            </button>
            <button type="button" className={styles.btn} onClick={() => resetTo(0)}>
              Reset
            </button>
          </div>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.btn}
              aria-pressed={controllerOn}
              onClick={toggleController}
            >
              {controllerOn ? 'Controller on' : 'Controller off'}
            </button>
            <button
              type="button"
              className={styles.btn}
              aria-pressed={labelsOn}
              onClick={() => {
                setLabelsOn((on) => !on);
                kick();
              }}
            >
              Labels
            </button>
          </div>

          <label className={styles.slider}>
            <span className={styles.sliderName}>Push strength</span>
            <span className={styles.sliderValue}>{strength} N</span>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={strength}
              onChange={(event) => setStrength(Number(event.target.value))}
            />
          </label>
          <label className={styles.slider}>
            <span className={styles.sliderName}>
              Lean penalty <span className={styles.math}>q<sub>θ</sub></span>
            </span>
            <span className={styles.sliderValue}>{grouped(qTheta)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={Q_SCALE.slider(qTheta)}
              onChange={(event) => {
                const value = Q_SCALE.value(Number(event.target.value));
                setQTheta(value);
                retune({ qTheta: value });
              }}
            />
          </label>
          <label className={styles.slider}>
            <span className={styles.sliderName}>
              Effort penalty <span className={styles.math}>r</span>
            </span>
            <span className={styles.sliderValue}>{r.toPrecision(2)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={R_SCALE.slider(r)}
              onChange={(event) => {
                const value = R_SCALE.value(Number(event.target.value));
                setR(value);
                retune({ r: value });
              }}
            />
          </label>
          <label className={styles.slider}>
            <span className={styles.sliderName}>Flywheel mass</span>
            <span className={styles.sliderValue}>{wheelMass.toFixed(1)} kg</span>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={wheelMass}
              onChange={(event) => changeMass(Number(event.target.value))}
            />
          </label>

          <dl className={styles.facts}>
            <dt>Recovers from (sim)</dt>
            <dd>{recovery == null ? '…' : `${recovery.toFixed(1)}° of lean`}</dd>
            <dt>Peak motor torque</dt>
            <dd>{sim.plant.peakTorque.toFixed(1)} N·m</dd>
            <dt>Flywheel top speed</dt>
            <dd>{grouped(sim.plant.noLoadSpeed * RPM)} rpm</dd>
            <dt>Closed loop</dt>
            <dd>{lqr.stable ? 'stable' : 'unstable'}</dd>
          </dl>
        </section>
      </div>

      <figcaption className={styles.caption}>
        Fig. 02a — The scooter, flywheel and controller we are building, simulated live in your
        browser with the same physics and LQR as our Python simulator. The arc around the flywheel
        is the torque the motor puts on the frame; the grey arrow is gravity at the center of mass.
      </figcaption>
    </figure>
  );
}
