import * as THREE from 'https://unpkg.com/three@0.177.0/build/three.module.js';

const PALETTE = {
  teal: '#31b7a5',
  tealDark: '#238f84',
  coral: '#e99a69',
  cream: '#f6efe0',
  glass: '#a9ded8',
  charcoal: '#26383a',
  rubber: '#263134',
  gold: '#f3c86b'
};

function material(color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
}

function box(parent, size, position, mat, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, height, position, mat, rotation = null, sides = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function sphere(parent, scale, position, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function triangle(parent, points, mat) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat);
  parent.add(mesh);
  return mesh;
}

function makeWheel(parent, x, y, z, wheels) {
  const wheel = cylinder(parent, 0.19, 0.19, 0.13, [x, y, z], material(PALETTE.rubber), [0, 0, Math.PI / 2], 10);
  cylinder(wheel, 0.105, 0.105, 0.135, [0, 0, 0], material(PALETTE.gold), null, 8);
  wheels.push(wheel);
}

export function buildVehicleModel(type) {
  const root = new THREE.Group();
  const body = material(PALETTE.teal);
  const darkBody = material(PALETTE.tealDark);
  const cream = material(PALETTE.cream);
  const glass = material(PALETTE.glass, 0.32);
  const charcoal = material(PALETTE.charcoal);
  const gold = material(PALETTE.gold);
  const wheels = [];
  const legs = [];
  let propeller = null;

  if (type === 'sail') {
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-0.5, 0.15);
    hullShape.lineTo(0.5, 0.15);
    hullShape.lineTo(0.37, -0.14);
    hullShape.lineTo(0, -0.27);
    hullShape.lineTo(-0.37, -0.14);
    hullShape.closePath();
    const hull = new THREE.Mesh(
      new THREE.ExtrudeGeometry(hullShape, { depth: 1.45, bevelEnabled: false }),
      darkBody
    );
    hull.position.z = -0.72;
    root.add(hull);
    box(root, [0.8, 0.1, 1.18], [0, 0.18, -0.02], cream);
    box(root, [0.42, 0.29, 0.38], [0, 0.38, -0.25], body);
    box(root, [0.31, 0.12, 0.02], [0, 0.45, -0.055], glass);
    cylinder(root, 0.025, 0.025, 1.43, [0, 0.9, -0.05], charcoal, null, 6);
    triangle(root, [[0.04, 0.25, 0.01], [0.04, 1.56, -0.04], [0.72, 0.25, -0.04]], cream);
    triangle(root, [[-0.025, 0.3, -0.09], [-0.025, 1.13, -0.1], [-0.44, 0.3, -0.1]], gold);
    box(root, [0.9, 0.035, 0.045], [0, 0.25, -0.04], charcoal);
    root.userData.animate = t => {
      root.position.y = Math.sin(t * 2.1) * 0.035;
      root.rotation.z = Math.sin(t * 1.4) * 0.018;
    };
  } else if (type === 'boat') {
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-0.56, 0.18);
    hullShape.lineTo(0.56, 0.18);
    hullShape.lineTo(0.43, -0.13);
    hullShape.lineTo(0, -0.23);
    hullShape.lineTo(-0.43, -0.13);
    hullShape.closePath();
    const hull = new THREE.Mesh(
      new THREE.ExtrudeGeometry(hullShape, { depth: 1.38, bevelEnabled: false }),
      darkBody
    );
    hull.position.z = -0.69;
    root.add(hull);
    box(root, [0.9, 0.12, 1.06], [0, 0.2, -0.05], cream);
    box(root, [0.62, 0.39, 0.56], [0, 0.46, -0.18], body);
    box(root, [0.48, 0.21, 0.035], [0, 0.56, 0.11], glass);
    box(root, [0.72, 0.05, 0.32], [0, 0.72, -0.18], gold);
    root.userData.animate = t => {
      root.position.y = Math.sin(t * 2.5) * 0.028;
      root.rotation.z = Math.sin(t * 1.9) * 0.012;
    };
  } else if (type === 'plane') {
    const fuselage = cylinder(root, 0.13, 0.17, 1.8, [0, 0.48, 0], body, [Math.PI / 2, 0, 0], 8);
    fuselage.scale.x = 0.88;
    sphere(root, [0.15, 0.12, 0.25], [0, 0.52, 0.42], glass);
    box(root, [2.15, 0.09, 0.42], [0, 0.46, -0.04], cream);
    box(root, [0.76, 0.07, 0.26], [0, 0.52, -0.72], body);
    box(root, [0.08, 0.48, 0.24], [0, 0.7, -0.75], gold);
    const rotor = new THREE.Group();
    rotor.position.set(0, 0.48, 0.91);
    box(rotor, [0.07, 0.72, 0.045], [0, 0, 0], charcoal);
    box(rotor, [0.72, 0.07, 0.045], [0, 0, 0], charcoal);
    root.add(rotor);
    propeller = rotor;
    root.userData.animate = t => {
      propeller.rotation.z = t * 13;
      root.position.y = Math.sin(t * 2.8) * 0.022;
    };
  } else if (type === 'car') {
    box(root, [1.42, 0.43, 1.82], [0, 0.51, 0], body);
    box(root, [1.12, 0.46, 0.88], [0, 0.88, -0.08], cream);
    box(root, [0.94, 0.33, 0.035], [0, 0.9, 0.37], glass);
    box(root, [0.94, 0.31, 0.035], [0, 0.9, -0.52], glass);
    box(root, [0.12, 0.12, 0.09], [0, 0.48, 0.94], gold);
    box(root, [0.12, 0.12, 0.09], [0, 0.48, -0.94], coralMaterial());
    for (const x of [-0.72, 0.72]) for (const z of [-0.57, 0.57]) makeWheel(root, x, 0.27, z, wheels);
    root.userData.animate = t => wheels.forEach(w => { w.rotation.x = t * 4; });
  } else if (type === 'train') {
    box(root, [1.25, 0.75, 1.95], [0, 0.76, 0], body);
    box(root, [0.86, 0.47, 0.64], [0, 1.33, -0.37], cream);
    box(root, [0.69, 0.31, 0.04], [0, 1.34, -0.03], glass);
    box(root, [0.92, 0.26, 0.27], [0, 0.96, 1.03], coralMaterial());
    cylinder(root, 0.12, 0.18, 0.4, [0, 1.34, 0.5], charcoal, null, 8);
    box(root, [0.23, 0.1, 0.28], [0, 1.57, 0.5], gold);
    for (const x of [-0.58, 0.58]) for (const z of [-0.64, 0, 0.64]) makeWheel(root, x, 0.3, z, wheels);
    root.userData.animate = t => wheels.forEach(w => { w.rotation.x = t * 4; });
  } else {
    sphere(root, [0.29, 0.34, 0.26], [0, 1.18, 0], gold);
    const torso = cylinder(root, 0.25, 0.32, 0.66, [0, 0.69, 0], body, null, 7);
    sphere(root, [0.16, 0.14, 0.17], [0, 1.2, 0.22], glass);
    for (const side of [-1, 1]) {
      const arm = cylinder(root, 0.075, 0.09, 0.55, [side * 0.34, 0.72, 0], cream, [0, 0, side * -0.22], 6);
      const leg = cylinder(root, 0.085, 0.1, 0.58, [side * 0.14, 0.29, 0], charcoal, null, 6);
      legs.push({ arm, leg, side });
    }
    root.userData.animate = t => {
      legs.forEach(({ arm, leg, side }) => {
        const swing = Math.sin(t * 7 + (side < 0 ? 0 : Math.PI)) * 0.42;
        arm.rotation.x = swing * 0.65;
        leg.rotation.x = swing;
      });
      root.position.y = Math.abs(Math.sin(t * 7)) * 0.035;
    };
  }

  return root;
}

function setupScene(renderer, width, height) {
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x718783, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.7);
  key.position.set(3, 5, 4);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);
  camera.position.set(3, 2.3, 3.3);
  camera.lookAt(0, 0.55, 0);
  return { scene, camera };
}

function coralMaterial() {
  return material(PALETTE.coral);
}

export function mountVehicleViewer(canvas, initialType) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power'
  });
  const width = canvas.width || 64;
  const height = canvas.height || 64;
  const { scene, camera } = setupScene(renderer, width, height);
  let type = initialType;
  let model = buildVehicleModel(type);
  scene.add(model);

  return {
    setVehicle(nextType) {
      if (nextType === type) return;
      scene.remove(model);
      model = buildVehicleModel(nextType);
      type = nextType;
      scene.add(model);
    },
    render(now, heading = 0) {
      model.rotation.y = heading;
      model.userData.animate?.(now * 0.001);
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
    }
  };
}

export function renderVehiclePreviews(grid) {
  const width = 88;
  const height = 50;
  const surface = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas: surface,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power'
  });
  const { scene, camera } = setupScene(renderer, width, height);
  const models = new Map();
  const previews = [...grid.querySelectorAll('.vehicle-preview')].map(canvas => ({
    canvas,
    context: canvas.getContext('2d'),
    type: canvas.dataset.vehicle
  }));
  const yaw = Object.fromEntries(previews.map(item => [item.type, 0]));
  let frame = 0;
  let lastFrame = 0;

  for (const item of previews) models.set(item.type, buildVehicleModel(item.type));

  previews.forEach(({ canvas, type }) => {
    let pointerX = null;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      pointerX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', event => {
      if (pointerX === null) return;
      event.preventDefault();
      event.stopPropagation();
      yaw[type] += (event.clientX - pointerX) * 0.018;
      pointerX = event.clientX;
    });
    const finish = event => {
      if (pointerX === null) return;
      event.stopPropagation();
      pointerX = null;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
  });

  function draw(now) {
    if (now - lastFrame > 120) {
      lastFrame = now;
      for (const item of previews) {
        const model = models.get(item.type);
        scene.add(model);
        model.rotation.y = yaw[item.type] + now * 0.00012;
        model.userData.animate?.(now * 0.001);
        renderer.render(scene, camera);
        item.context.clearRect(0, 0, item.canvas.width, item.canvas.height);
        item.context.drawImage(surface, 0, 0, item.canvas.width, item.canvas.height);
        scene.remove(model);
      }
    }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);

  return {
    dispose() {
      cancelAnimationFrame(frame);
      renderer.dispose();
    }
  };
}
