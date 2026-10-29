// three.js scene for the interactive balance model. The scooter is drawn the
// way the rest of the site draws things: dark solids with white edges and
// outlines on black. The caller owns the simulation and passes its state to
// update() every frame; this module only draws.
//
// Axes (metres): x to the right as seen from behind, y up, z toward the rear.
// The scooter group rotates about the z axis through the origin, which is the
// pivot (the line through the tire contact patches), so rotation.z = theta
// matches the physics convention: positive leans left, counterclockwise as
// seen from behind.

const INK = 0xf7f5f0;
const GREY = 0x8a8a86;
const BG = 0x0a0a0a;

// VOLPAM-style commuter frame: 8.5" wheels, 0.83 m wheelbase
const TIRE_R = 0.108;
const TIRE_W = 0.05;
const FRONT_Z = -0.43;
const REAR_Z = 0.4;
const DECK_TOP = 0.1225;
const DECK_H = 0.045;
const DECK_W = 0.15;
const DECK_FRONT = -0.3;
const DECK_REAR = 0.27;
const BAR_Z = -0.37;
export const HANDLEBAR_Z = BAR_Z;
const BAR_HALF = 0.215;

// Flywheel: front face at FLY_FRONT, rim extends toward the rear by its thickness
const FLY_FRONT = 0.03;
const RIM_INNER = 0.118;
const STEEL_DENSITY = 7850;
const MOTOR_Z = FLY_FRONT - 0.04;
const COM_Z = 0.2; // where the centre-of-mass marker is drawn along the deck
const GAUGE_Z = -0.39; // lean gauge sits in the plane of the stem, so the stem is its needle
const GAUGE_R = 0.9;
const ARC_R = 0.205; // motor-torque arc around the flywheel axle
const ARC_SPAN = 1.6 * Math.PI;
const ARC_SEGMENTS = 96;
const ARC_RADIAL = 6;

export const VIEWS = {
  quarter: { az: 0.62, el: 0.26 },
  rear: { az: 0, el: 0.1 },
  side: { az: Math.PI / 2, el: 0.08 },
};

// Rim thickness (m) for a steel rim of the given mass between RIM_INNER and r
export function rimThickness(mass, radius) {
  return mass / (STEEL_DENSITY * Math.PI * (radius ** 2 - RIM_INNER ** 2));
}

export function createScene(THREE, canvas, plant, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(BG, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 3.4, 8);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  const target = new THREE.Vector3(0, 0.53, -0.04);
  const orbit = { az: VIEWS.quarter.az, el: VIEWS.quarter.el, goalAz: VIEWS.quarter.az, goalEl: VIEWS.quarter.el, radius: 2.6 };
  let width = 1;
  let height = 1;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-2, 3.5, 2.5);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xffffff, 0.6);
  back.position.set(2.5, 1.5, -2);
  scene.add(back);

  // ---- materials ----
  const solid = new THREE.MeshStandardMaterial({
    color: 0x1b1b1a, roughness: 0.92, metalness: 0.05,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const solidLight = solid.clone();
  solidLight.color.set(0x2c2c2a);
  const solidShell = solid.clone();
  solidShell.side = THREE.DoubleSide;
  const edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.9 });
  const inkMat = new THREE.MeshBasicMaterial({ color: INK });
  // Inverted hull: a white back-face copy pushed out along the normals draws
  // the silhouette of curved parts, which have no hard edges to outline.
  const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = vec3( position ) + normal * 0.0035;'
    );
  };

  const pickables = [];
  const up = new THREE.Vector3(0, 1, 0);

  function part(geometry, parent, { material = solid, outline = false, pick = true, edges = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), edgeMat));
    if (outline) mesh.add(new THREE.Mesh(geometry, outlineMat));
    parent.add(mesh);
    if (pick) pickables.push(mesh);
    return mesh;
  }

  // A cylinder (radius r) or box (w x d) spanning points a and b
  function rod(parent, a, b, r, opts) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const mesh = part(new THREE.CylinderGeometry(r, r, dir.length(), 16), parent, { outline: true, ...opts });
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.normalize());
    return mesh;
  }
  function strut(parent, a, b, w, d, opts) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const mesh = part(new THREE.BoxGeometry(w, dir.length(), d), parent, opts);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.normalize());
    return mesh;
  }
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- ground: grid, pivot line ----
  const grid = new THREE.GridHelper(8, 40, 0x3a3a38, 0x232322);
  scene.add(grid);
  const pivotLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([v(0, 0.002, -0.95), v(0, 0.002, 0.95)]),
    new THREE.LineDashedMaterial({ color: GREY, dashSize: 0.03, gapSize: 0.02 })
  );
  pivotLine.computeLineDistances();
  scene.add(pivotLine);

  // ---- the scooter frame ----
  const scooter = new THREE.Group();
  scene.add(scooter);

  for (const z of [FRONT_Z, REAR_Z]) {
    const wheel = new THREE.Group();
    wheel.position.set(0, TIRE_R, z);
    scooter.add(wheel);
    part(new THREE.CylinderGeometry(TIRE_R, TIRE_R, TIRE_W, 48).rotateZ(Math.PI / 2), wheel, { outline: true });
    part(new THREE.CylinderGeometry(0.068, 0.068, TIRE_W + 0.006, 32).rotateZ(Math.PI / 2), wheel, { material: solidLight });
    part(new THREE.CylinderGeometry(0.016, 0.016, TIRE_W + 0.03, 12).rotateZ(Math.PI / 2), wheel, { material: solidLight });
  }

  // fenders: open shells over the top of each wheel
  const fender = (z, start, length) => {
    const shell = part(
      new THREE.CylinderGeometry(TIRE_R + 0.017, TIRE_R + 0.017, 0.06, 32, 1, true, start, length).rotateZ(Math.PI / 2),
      scooter,
      { material: solidShell }
    );
    shell.position.set(0, TIRE_R, z);
  };
  fender(REAR_Z, 0.15, 2.0);
  fender(FRONT_Z, 1.05, 1.65);

  part(new THREE.BoxGeometry(DECK_W, DECK_H, DECK_REAR - DECK_FRONT), scooter).position.set(
    0, DECK_TOP - DECK_H / 2, (DECK_FRONT + DECK_REAR) / 2
  );
  // rear swingarm and front neck into the folding joint
  for (const side of [-1, 1]) {
    strut(scooter, v(side * 0.045, DECK_TOP - 0.03, DECK_REAR - 0.03), v(side * 0.034, TIRE_R, REAR_Z), 0.012, 0.03);
    rod(scooter, v(side * 0.034, TIRE_R, FRONT_Z), v(side * 0.022, 0.25, -0.412), 0.011);
  }
  strut(scooter, v(0, DECK_TOP - 0.02, DECK_FRONT + 0.01), v(0, 0.24, -0.41), 0.05, 0.05);

  // stem, handlebar, grips, display
  const barY = plant.stemLength;
  rod(scooter, v(0, 0.24, -0.413), v(0, barY - 0.012, BAR_Z), 0.017);
  rod(scooter, v(-BAR_HALF, barY, BAR_Z), v(BAR_HALF, barY, BAR_Z), 0.011);
  for (const side of [-1, 1]) {
    rod(scooter, v(side * (BAR_HALF - 0.1), barY, BAR_Z), v(side * BAR_HALF, barY, BAR_Z), 0.016);
  }
  part(new THREE.BoxGeometry(0.07, 0.014, 0.05), scooter).position.set(0, barY + 0.02, BAR_Z);

  // electronics: ESP32, IMU and VESC in a box at the front of the deck
  part(new THREE.BoxGeometry(0.1, 0.045, 0.13), scooter, { material: solidLight }).position.set(
    0, DECK_TOP + 0.0225, -0.19
  );

  // ---- flywheel assembly ----
  const flyY = plant.wheelHeight;
  const flyR = plant.wheelRadius;
  const flywheel = new THREE.Group();
  flywheel.position.set(0, flyY, FLY_FRONT);
  scooter.add(flywheel);
  const spin = new THREE.Group(); // rotates by phi relative to the frame
  flywheel.add(spin);

  const rimProfile = [[RIM_INNER, 0], [flyR, 0], [flyR, 1], [RIM_INNER, 1], [RIM_INNER, 0]].map(
    ([x, y]) => new THREE.Vector2(x, y)
  );
  const rim = part(new THREE.LatheGeometry(rimProfile, 72).rotateX(Math.PI / 2), spin, {
    material: solidLight,
    outline: true,
  });
  const spokes = [];
  const SPOKES = 5;
  for (let k = 0; k < SPOKES; k++) {
    const holder = new THREE.Group();
    holder.rotation.z = (k * 2 * Math.PI) / SPOKES;
    spin.add(holder);
    const length = RIM_INNER - 0.026;
    const spoke = part(new THREE.BoxGeometry(0.014, length, 0.008), holder, { material: solidLight });
    spoke.position.y = 0.026 + length / 2;
    spokes.push(spoke);
  }
  const hub = part(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24).rotateX(Math.PI / 2), spin, {
    material: solidLight,
    outline: true,
  });
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.003), inkMat);
  spin.add(marker);
  // At speed the spokes strobe, so a faint disc fades in over them as blur
  const blurMat = new THREE.MeshBasicMaterial({
    color: INK, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const blur = new THREE.Mesh(new THREE.RingGeometry(0.03, flyR, 64), blurMat);
  flywheel.add(blur);

  // Flipsky 7070 outrunner in front of the flywheel, on a bracket from the deck
  const motor = part(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 32).rotateX(Math.PI / 2), scooter, {
    outline: true,
  });
  motor.position.set(0, flyY, MOTOR_Z);
  part(new THREE.CylinderGeometry(0.026, 0.026, 0.074, 24).rotateX(Math.PI / 2), scooter, {
    material: solidLight,
  }).position.set(0, flyY, MOTOR_Z);
  for (const side of [-1, 1]) {
    strut(scooter, v(side * 0.068, DECK_TOP, MOTOR_Z), v(side * 0.026, flyY - 0.022, MOTOR_Z), 0.012, 0.03);
  }

  // centre of mass marker
  const com = part(new THREE.SphereGeometry(0.018, 20, 14), scooter, {
    material: solidLight, outline: true, pick: false, edges: false,
  });

  // ---- overlays: arrows, torque arc, lean gauge ----
  const gravity = new THREE.ArrowHelper(v(0, -1, 0), v(0, 0, 0), 0.2, GREY, 0.04, 0.026);
  scene.add(gravity);
  const pushArrow = new THREE.ArrowHelper(v(1, 0, 0), v(0, 0, 0), 0.3, INK, 0.055, 0.034);
  pushArrow.visible = false;
  scene.add(pushArrow);
  const bandPositions = new Float32Array(6);
  const bandGeometry = new THREE.BufferGeometry();
  bandGeometry.setAttribute('position', new THREE.BufferAttribute(bandPositions, 3));
  const band = new THREE.Line(bandGeometry, new THREE.LineDashedMaterial({ color: INK, dashSize: 0.02, gapSize: 0.015 }));
  band.visible = false;
  scene.add(band);

  class ArcPath extends THREE.Curve {
    getPoint(t, out = new THREE.Vector3()) {
      const a = Math.PI / 2 + t * ARC_SPAN;
      return out.set(ARC_R * Math.cos(a), ARC_R * Math.sin(a), 0);
    }
  }
  const torqueGroup = new THREE.Group();
  scooter.add(torqueGroup);
  const arcGeometry = new THREE.TubeGeometry(new ArcPath(), ARC_SEGMENTS, 0.0045, ARC_RADIAL, false);
  const arc = new THREE.Mesh(arcGeometry, inkMat);
  torqueGroup.add(arc);
  const arcHead = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.036, 14), inkMat);
  torqueGroup.add(arcHead);

  const gaugeMat = new THREE.LineDashedMaterial({ color: GREY, dashSize: 0.025, gapSize: 0.018 });
  const plumb = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([v(0, 0, GAUGE_Z), v(0, GAUGE_R + 0.2, GAUGE_Z)]),
    gaugeMat
  );
  plumb.computeLineDistances();
  scene.add(plumb);
  const GAUGE_POINTS = 48;
  const gaugePositions = new Float32Array((GAUGE_POINTS + 3) * 3);
  const gaugeGeometry = new THREE.BufferGeometry();
  gaugeGeometry.setAttribute('position', new THREE.BufferAttribute(gaugePositions, 3));
  const gauge = new THREE.Line(gaugeGeometry, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 }));
  scene.add(gauge);

  // ---- label anchors (scooter frame unless marked world) ----
  const anchors = {
    flywheel: { local: v(flyR * 0.7, flyY + flyR * 0.7, FLY_FRONT) },
    electronics: { local: v(0.05, DECK_TOP + 0.045, -0.19) },
    pivot: { world: v(0, 0, -0.62) },
    lean: { world: v(0, 0, GAUGE_Z) },
  };

  let thickness = 0;
  function setPlant(next) {
    thickness = rimThickness(next.wheelMass, flyR);
    rim.scale.z = thickness;
    for (const spoke of spokes) spoke.position.z = thickness / 2;
    hub.position.z = thickness / 2;
    marker.position.set(0, flyR - 0.017, thickness + 0.002);
    blur.position.z = thickness + 0.004;
    torqueGroup.position.set(0, flyY, FLY_FRONT + thickness + 0.014);
    com.position.set(0, next.comHeight, COM_Z);
  }
  setPlant(plant);

  // ---- camera ----
  function placeCamera() {
    const { az, el, radius } = orbit;
    camera.position.set(
      target.x + radius * Math.sin(az) * Math.cos(el),
      target.y + radius * Math.sin(el),
      target.z + radius * Math.cos(az) * Math.cos(el)
    );
    camera.lookAt(target);
  }

  function setSize(w, h) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Narrow viewports back the camera off so the whole scooter stays in frame
    orbit.radius = Math.min(4.8, Math.max(2.6, 2.45 / camera.aspect));
    camera.updateProjectionMatrix();
    placeCamera();
  }

  function setView(name) {
    const view = VIEWS[name] || VIEWS.quarter;
    // Ease the short way round, however many turns the camera has been orbited
    const turn = 2 * Math.PI;
    orbit.goalAz = view.az + turn * Math.round((orbit.az - view.az) / turn);
    orbit.goalEl = view.el;
  }

  function orbitBy(dx, dy) {
    orbit.goalAz -= dx * 0.006;
    orbit.goalEl = Math.min(1.2, Math.max(0.02, orbit.goalEl + dy * 0.005));
    // Dragging moves the camera directly rather than easing toward the goal
    orbit.az = orbit.goalAz;
    orbit.el = orbit.goalEl;
  }

  // ---- picking ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(x, y) {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    const local = scooter.worldToLocal(hit.point.clone());
    return { local: { x: local.x, y: local.y, z: local.z } };
  }
  const dragPlane = new THREE.Plane();
  const dragHit = new THREE.Vector3();
  // Where the pointer ray meets the vertical plane z = planeZ
  function pointerOnPlane(x, y, planeZ) {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    dragPlane.set(v(0, 0, 1), -planeZ);
    const hit = raycaster.ray.intersectPlane(dragPlane, dragHit);
    return hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
  }

  // ---- per-frame update ----
  const tmp = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  function update(state, dt) {
    const { theta, phi, omega, frameTorque, peakTorque, push } = state;
    scooter.rotation.z = theta;
    spin.rotation.z = phi;
    scooter.updateMatrixWorld();

    const speed = Math.abs(omega);
    blurMat.opacity = Math.min(0.16, Math.max(0, (speed - 20) / 400));

    // Torque the motor puts on the frame, drawn as an arc whose length is its share of peak
    const share = Math.min(1, Math.abs(frameTorque) / peakTorque);
    const segments = Math.round(share * ARC_SEGMENTS);
    torqueGroup.visible = segments >= 2;
    if (torqueGroup.visible) {
      torqueGroup.scale.x = frameTorque >= 0 ? 1 : -1;
      arcGeometry.setDrawRange(0, segments * ARC_RADIAL * 6);
      const a = Math.PI / 2 + (segments / ARC_SEGMENTS) * ARC_SPAN;
      arcHead.position.set(ARC_R * Math.cos(a), ARC_R * Math.sin(a), 0);
      tangent.set(-Math.sin(a), Math.cos(a), 0);
      arcHead.quaternion.setFromUnitVectors(up, tangent);
    }

    // Gravity acts straight down through the centre of mass
    com.getWorldPosition(tmp);
    gravity.position.copy(tmp);

    // Push: an arrow into the point the force acts on, plus a rubber band for drags
    if (push && push.force !== 0) {
      const dir = Math.sign(push.force);
      const length = Math.min(0.6, 0.12 + Math.abs(push.force) * 0.02);
      pushArrow.visible = true;
      pushArrow.position.set(push.point.x - dir * length, push.point.y, push.point.z);
      pushArrow.setDirection(tmp.set(dir, 0, 0));
      pushArrow.setLength(length, Math.min(0.055, length * 0.4), 0.034);
    } else {
      pushArrow.visible = false;
    }
    band.visible = Boolean(push && push.target);
    if (band.visible) {
      bandPositions.set([push.point.x, push.point.y, push.point.z, push.target.x, push.target.y, push.target.z]);
      bandGeometry.attributes.position.needsUpdate = true;
      band.computeLineDistances();
    }

    // Lean gauge: the frame's axis, and an arc from vertical to it
    const pts = gaugePositions;
    let n = 0;
    const put = (x, y) => {
      pts[n++] = x;
      pts[n++] = y;
      pts[n++] = GAUGE_Z;
    };
    put(0, 0);
    put(-Math.sin(theta) * (GAUGE_R + 0.12), Math.cos(theta) * (GAUGE_R + 0.12));
    for (let i = 0; i <= GAUGE_POINTS; i++) {
      const a = (theta * i) / GAUGE_POINTS;
      put(-Math.sin(a) * GAUGE_R, Math.cos(a) * GAUGE_R);
    }
    gaugeGeometry.attributes.position.needsUpdate = true;
    gaugeGeometry.computeBoundingSphere();
    const mid = theta / 2;
    anchors.lean.world.set(-Math.sin(mid) * GAUGE_R, Math.cos(mid) * GAUGE_R, GAUGE_Z);

    // Ease toward a chosen view
    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    orbit.az += (orbit.goalAz - orbit.az) * ease;
    orbit.el += (orbit.goalEl - orbit.el) * ease;
    placeCamera();
  }

  function render() {
    renderer.render(scene, camera);
  }

  // Screen positions (CSS pixels) of the label anchors. A label whose anchor
  // is hidden behind part of the scooter is reported as not visible.
  const sightline = new THREE.Raycaster();
  const toAnchor = new THREE.Vector3();
  function hidden(point) {
    toAnchor.subVectors(point, camera.position);
    const distance = toAnchor.length();
    sightline.set(camera.position, toAnchor.normalize());
    sightline.far = distance - 0.03;
    return sightline.intersectObjects(pickables, false).length > 0;
  }
  function labelPositions() {
    const out = {};
    for (const [id, anchor] of Object.entries(anchors)) {
      if (anchor.local) tmp.copy(anchor.local).applyMatrix4(scooter.matrixWorld);
      else tmp.copy(anchor.world);
      const occluded = id !== 'lean' && hidden(tmp);
      tmp.project(camera);
      out[id] = {
        x: ((tmp.x + 1) / 2) * width,
        y: ((1 - tmp.y) / 2) * height,
        visible: !occluded && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05,
      };
    }
    return out;
  }

  function cameraSettled() {
    return Math.abs(orbit.goalAz - orbit.az) < 1e-4 && Math.abs(orbit.goalEl - orbit.el) < 1e-4;
  }

  function dispose() {
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose();
    });
    renderer.dispose();
  }

  return {
    setSize, setView, orbitBy, setPlant, pick, pointerOnPlane, update, render,
    labelPositions, cameraSettled, dispose,
  };
}
