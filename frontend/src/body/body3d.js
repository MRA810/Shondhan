// The 3D figure (three.js). A simple, respectful mannequin: tap a place to pin a mark on it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { locate } from "./bodyMap.js";

const TARGET = new THREE.Vector3(0, 0.93, 0);
const DIST = 3.4;
const VIEWS = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };

function buildBody(color) {
  const group = new THREE.Group();
  const meshes = [];
  const add = (geo, region, [x, y, z], { scale, rot, col, pickable = true } = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color: col ?? color, roughness: 0.7, metalness: 0.05 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.userData.region = region;
    group.add(m);
    if (pickable) meshes.push(m);
    return m;
  };
  const dark = 0x3a2a20;
  // head and face
  add(new THREE.SphereGeometry(0.105, 40, 32), "head", [0, 1.665, 0], { scale: [1, 1.18, 1.08] });
  for (const s of [1, -1]) {
    add(new THREE.SphereGeometry(0.025, 16, 12), "head", [s * 0.103, 1.665, 0], { scale: [0.6, 1.25, 1] });
    add(new THREE.SphereGeometry(0.012, 12, 10), "head", [s * 0.038, 1.682, 0.1], { col: dark });
  }
  add(new THREE.ConeGeometry(0.016, 0.045, 16), "head", [0, 1.645, 0.112], { rot: [Math.PI / 2.4, 0, 0] });
  add(new THREE.BoxGeometry(0.04, 0.006, 0.01), "head", [0, 1.6, 0.104], { col: 0x9a5a4a });
  // neck and body
  add(new THREE.CylinderGeometry(0.05, 0.056, 0.13, 24), "neck", [0, 1.51, 0]);
  add(new THREE.CapsuleGeometry(0.16, 0.42, 12, 32), "torso", [0, 1.15, 0], { scale: [1.3, 1, 0.8] });
  for (const s of [1, -1]) {
    const side = s > 0 ? "left" : "right";
    add(new THREE.SphereGeometry(0.066, 24, 16), `${side}_arm`, [s * 0.25, 1.43, 0]);
    add(new THREE.CapsuleGeometry(0.048, 0.24, 8, 20), `${side}_arm`, [s * 0.285, 1.27, 0], { rot: [0, 0, s * 0.06] });
    add(new THREE.CapsuleGeometry(0.041, 0.22, 8, 20), `${side}_arm`, [s * 0.302, 1.0, 0.0]);
    add(new THREE.SphereGeometry(0.046, 20, 16), `${side}_hand`, [s * 0.307, 0.79, 0], { scale: [0.55, 1.45, 1.0] });
    add(new THREE.CapsuleGeometry(0.075, 0.32, 8, 24), `${side}_leg`, [s * 0.1, 0.72, 0]);
    add(new THREE.CapsuleGeometry(0.055, 0.34, 8, 24), `${side}_leg`, [s * 0.1, 0.29, 0]);
    add(new THREE.CapsuleGeometry(0.04, 0.12, 8, 16), `${side}_foot`, [s * 0.1, 0.04, 0.06], { rot: [Math.PI / 2, 0, 0] });
  }
  return { group, meshes };
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.4));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.6);
  d1.position.set(1.5, 2.5, 2.5);
  scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.7);
  d2.position.set(-1.5, 1.5, -2.5);
  scene.add(d2);
}

function pinMesh(pos, color, big) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.026 : 0.02, 16, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55 }));
  m.position.set(...pos);
  return m;
}

function disposeTree(obj) {
  obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
}

/**
 * Mounts an interactive figure in `container`.
 * opts.onPick({region, part, pos}) when a body place is tapped (interactive only)
 * opts.onHover({x, y, region, part, pin}) / null for the tooltip
 */
export function mountBody(container, { interactive = false, onPick, onHover, skin = 0xd9b99b } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  lights(scene);
  const { group, meshes } = buildBody(skin);
  scene.add(group);
  const pins = new THREE.Group();
  scene.add(pins);
  let pinData = [];

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  camera.position.set(0, TARGET.y, DIST);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TARGET);
  controls.enablePan = false;
  controls.minDistance = 0.8;
  controls.maxDistance = 4.6;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI - 0.15;
  controls.update();

  const render = () => renderer.render(scene, camera);
  controls.addEventListener("change", render);

  const resize = () => {
    const w = container.clientWidth || 300, h = container.clientHeight || 400;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitAt = (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const pinHit = ray.intersectObjects(pins.children)[0];
    const bodyHit = ray.intersectObjects(meshes)[0];
    return { pinHit, bodyHit, x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  let hovered = null;
  const highlight = (region) => {
    if (hovered === region) return;
    hovered = region;
    for (const m of meshes) {
      if (m.material.color.getHex() === 0x3a2a20) continue;
      m.material.emissive.setHex(region && m.userData.region === region && interactive ? 0x5a3010 : 0x000000);
    }
    render();
  };

  const onMove = (ev) => {
    const { pinHit, bodyHit, x, y } = hitAt(ev);
    if (pinHit && (!bodyHit || pinHit.distance <= bodyHit.distance + 0.01)) {
      highlight(null);
      onHover?.({ x, y, pin: pinData[pinHit.object.userData.index] });
      return;
    }
    if (bodyHit) {
      const p = bodyHit.point;
      const loc = locate(bodyHit.object.userData.region, [p.x, p.y, p.z]);
      highlight(bodyHit.object.userData.region);
      onHover?.({ x, y, ...loc });
    } else {
      highlight(null);
      onHover?.(null);
    }
  };
  const onLeave = () => { highlight(null); onHover?.(null); };
  let down = null;
  const onDown = (ev) => { down = [ev.clientX, ev.clientY]; };
  const onUp = (ev) => {
    if (!down || !interactive) return;
    const moved = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]);
    down = null;
    if (moved > 6) return;
    const { bodyHit } = hitAt(ev);
    if (!bodyHit) return;
    // nudge the pin a little out of the skin so it stays visible
    const p = bodyHit.point.clone();
    const n = bodyHit.face.normal.clone().transformDirection(bodyHit.object.matrixWorld);
    p.addScaledVector(n, 0.004);
    const pos = [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000);
    onPick?.({ ...locate(bodyHit.object.userData.region, pos), pos });
  };
  const el = renderer.domElement;
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerleave", onLeave);
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointerup", onUp);

  return {
    setPins(list) {
      disposeTree(pins);
      pins.clear();
      pinData = list;
      list.forEach((p, i) => {
        const m = pinMesh(p.pos, p.color, p.big);
        m.userData.index = i;
        pins.add(m);
      });
      render();
    },
    view(name) {
      const [x, , z] = VIEWS[name];
      camera.position.set(TARGET.x + x * DIST, TARGET.y, TARGET.z + z * DIST);
      controls.update();
      render();
    },
    zoom(f) {
      const off = camera.position.clone().sub(TARGET).multiplyScalar(f);
      const len = Math.min(Math.max(off.length(), controls.minDistance), controls.maxDistance);
      camera.position.copy(TARGET).add(off.setLength(len));
      controls.update();
      render();
    },
    dispose() {
      ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    },
  };
}

/** Front and back pictures with numbered pins, for printing. Returns [{name, url}]. */
export function snapshotViews(pinList, { width = 360, height = 560, skin = 0xd9cfc6 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0xffffff, 1);
  const scene = new THREE.Scene();
  lights(scene);
  const { group, meshes } = buildBody(skin);
  scene.add(group);
  const pins = new THREE.Group();
  pinList.forEach((p) => pins.add(pinMesh(p.pos, p.color, false)));
  scene.add(pins);
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.05, 20);
  const ray = new THREE.Raycaster();
  const out = [];
  for (const name of ["front", "back"]) {
    const [x, , z] = VIEWS[name];
    camera.position.set(x * DIST, TARGET.y, z * DIST);
    camera.lookAt(TARGET);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    const c = document.createElement("canvas");
    c.width = width * 2;
    c.height = height * 2;
    const g = c.getContext("2d");
    g.drawImage(renderer.domElement, 0, 0, c.width, c.height);
    pinList.forEach((p, i) => {
      const v = new THREE.Vector3(...p.pos);
      // only label marks that can be seen from this side
      const dir = v.clone().sub(camera.position);
      const dist = dir.length();
      ray.set(camera.position, dir.normalize());
      const hit = ray.intersectObjects(meshes)[0];
      if (hit && hit.distance < dist - 0.02) return;
      v.project(camera);
      const px = (v.x + 1) / 2 * c.width, py = (1 - v.y) / 2 * c.height;
      g.beginPath();
      g.arc(px, py, 30, 0, Math.PI * 2);
      g.fillStyle = p.color;
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = "#ffffff";
      g.stroke();
      g.fillStyle = "#ffffff";
      g.font = "bold 36px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(p.n ?? i + 1), px, py + 2);
    });
    out.push({ name, url: c.toDataURL("image/png") });
  }
  disposeTree(scene);
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
