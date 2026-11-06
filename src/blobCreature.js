import * as THREE from 'three';

/**
 * Evaluates the anatomical follicle growth mask at a local position on the blob surface.
 * Returns a float in [0.0, 1.0]:
 * - 0.0 inside eye sockets and mouth recess (prevents hair from poking through eyes/mouth)
 * - Smoothly tapers (0.2 -> 1.0) around the eye rims, nose bridge, and paw pads
 * - Slightly longer/fluffier (1.15) on the cheek tufts, chest fluff, and ear tips
 */
export function evaluateFollicleMask(x, y, z) {
  // Left and right eye centers in local space (feline cat-eye placement)
  const lx = x + 0.32;
  const rx = x - 0.32;
  const ey = y - 0.16;
  const ez = z - 0.90;

  const distLeftEye = Math.sqrt(lx * lx + ey * ey * 1.15 + ez * ez);
  const distRightEye = Math.sqrt(rx * rx + ey * ey * 1.15 + ez * ez);
  const minEyeDist = Math.min(distLeftEye, distRightEye);

  // Clear area around Kitty's cat eyes so eyes & cat-eyeliner are completely visible
  if (minEyeDist < 0.165) {
    return 0.0;
  }
  const eyeMask = smoothstep(0.165, 0.28, minEyeDist);

  // Cat muzzle & nose zone: trim fur on the nose button, whisker pads, and cat mouth
  const mx = x / 0.28;
  const my = (y - 0.05) / 0.19;
  const mz = (z - 0.97) / 0.24;
  const distMuzzle = Math.sqrt(mx * mx + my * my + mz * mz);
  const muzzleMask = 0.08 + 0.92 * smoothstep(0.38, 1.08, distMuzzle);

  // Inner ear cavity clearing: trim fur on the front side of the ears so pink inner ear shows
  const leftEarDist = Math.hypot(x + 0.44, (y - 0.80) * 0.9, z - 0.14);
  const rightEarDist = Math.hypot(x - 0.44, (y - 0.80) * 0.9, z - 0.14);
  const earFrontMask = 0.25 + 0.75 * smoothstep(0.10, 0.34, Math.min(leftEarDist, rightEarDist));

  // Bottom belly contact pad taper
  const bottomMask = smoothstep(-1.05, -0.72, y);

  // Extra fluff boost on cheeks and chest tuft
  const cheekDist = Math.min(
    Math.hypot(x + 0.56, y - 0.02, z - 0.68),
    Math.hypot(x - 0.56, y - 0.02, z - 0.68)
  );
  const cheekFluff = 1.0 + 0.22 * (1.0 - smoothstep(0.0, 0.42, cheekDist));

  return Math.max(0.0, Math.min(1.25, eyeMask * muzzleMask * earFrontMask * bottomMask * cheekFluff));
}

/**
 * Computes the biological grooming flow tangent vector on the blob surface.
 * Hairs part naturally from a crown whorl at the top of the head, sweep around
 * the eye sockets, and flow downward with a subtle cheek/belly swirl.
 */
export function evaluateGroomFlow(x, y, z, nx, ny, nz) {
  // Base gravity/growth direction from crown (0, 1.05, 0.1)
  let fx = x * 0.25;
  let fy = -0.85;
  let fz = (z - 0.15) * 0.25;

  // Sweep tangentially around the left and right eyes like real facial fur
  const eyeCenters = [
    [-0.33, 0.17, 0.86],
    [0.33, 0.17, 0.86]
  ];
  for (let i = 0; i < 2; i++) {
    const [ex, ey, ez] = eyeCenters[i];
    const dx = x - ex;
    const dy = y - ey;
    const dz = z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
    if (d < 0.48) {
      const influence = (1.0 - d / 0.48) * 0.85;
      fx += (dx / d) * influence;
      fy += (dy / d) * influence * 0.6;
      fz += (dz / d) * influence * 0.3;
    }
  }

  // Project onto the tangent plane orthogonal to surface normal N
  const dotFN = fx * nx + fy * ny + fz * nz;
  let tx = fx - dotFN * nx;
  let ty = fy - dotFN * ny;
  let tz = fz - dotFN * nz;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len > 1e-5) {
    tx /= len;
    ty /= len;
    tz /= len;
  } else {
    tx = 1.0;
    ty = 0.0;
    tz = 0.0;
  }
  return [tx, ty, tz];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Sculpt a unit sphere vertex into our cute "Kitty" cat creature with
 * chubby cheeks, perky triangular cat ears, cute muzzle, stubby side paws, and recessed eye sockets.
 */
function sculptBlobPosition(u, v, w) {
  let x = u;
  let y = v;
  let z = w;

  // 1. Chubby kitten silhouette: cute lower cheeks & belly, slightly tapered crown
  const bellyWidth = 1.0 + 0.22 * Math.exp(-Math.pow((y + 0.24) / 0.55, 2.0));
  const cheekPuff = 1.0 + 0.15 * Math.exp(-Math.pow((y + 0.04) / 0.38, 2.0)) * Math.max(0, z);
  x *= bellyWidth * cheekPuff;
  z *= (0.94 + 0.12 * Math.exp(-Math.pow((y + 0.22) / 0.6, 2.0)));
  y *= 0.96;

  // Slightly flatten the base so Kitty sits cozily on the ground
  if (y < -0.55) {
    const t = (-0.55 - y) / 0.45;
    y = -0.55 - Math.tanh(t * 1.15) * 0.32;
  }

  // 2. Perky triangular cat ears on top-left and top-right
  const leftEarDir = normalize3(-0.46, 0.88, 0.04);
  const rightEarDir = normalize3(0.46, 0.88, 0.04);
  const dotLEar = Math.max(0.0, u * leftEarDir[0] + v * leftEarDir[1] + w * leftEarDir[2]);
  const dotREar = Math.max(0.0, u * rightEarDir[0] + v * rightEarDir[1] + w * rightEarDir[2]);
  const earProfile = Math.pow(Math.max(dotLEar, dotREar), 11.0) * 0.58;
  x += u * earProfile * 0.82;
  y += v * earProfile * 1.32;
  z += w * earProfile * 0.45;

  // Cat snout / muzzle bump at center front
  const muzzleDir = Math.hypot(u, (v - 0.04) * 1.4, w - 0.96);
  if (muzzleDir < 0.35) {
    const muzzleBump = (1.0 - smoothstep(0.0, 0.35, muzzleDir)) * 0.055;
    z += muzzleBump;
  }

  // 3. Cute stubby side nubbins (little paws)
  const leftArmDir = normalize3(-0.94, -0.08, 0.28);
  const rightArmDir = normalize3(0.94, -0.08, 0.28);
  const dotLArm = Math.max(0.0, u * leftArmDir[0] + v * leftArmDir[1] + w * leftArmDir[2]);
  const dotRArm = Math.max(0.0, u * rightArmDir[0] + v * rightArmDir[1] + w * rightArmDir[2]);
  const armProfile = Math.pow(Math.max(dotLArm, dotRArm), 18.0) * 0.24;
  x += u * armProfile * 1.1;
  y += v * armProfile * 0.6;
  z += w * armProfile * 0.9;

  // 4. Anatomical eye socket indentation for cat eyes
  const lx = x + 0.32;
  const rx = x - 0.32;
  const ey = y - 0.16;
  const ez = z - 0.90;
  const dEye = Math.min(
    Math.sqrt(lx * lx + ey * ey + ez * ez),
    Math.sqrt(rx * rx + ey * ey + ez * ez)
  );
  if (dEye < 0.32) {
    const indent = (1.0 - smoothstep(0.0, 0.32, dEye)) * 0.065;
    z -= indent;
  }

  return [x, y, z];
}

function normalize3(x, y, z) {
  const l = Math.sqrt(x * x + y * y + z * z) || 1.0;
  return [x / l, y / l, z / l];
}

/**
 * Builds the continuous organic blob geometry with baked vertex attributes:
 * - `aFollicleMask`: float [0..1.25] controlling fur length & density mask
 * - `aGroomTangent`: vec3 biological fur flow direction
 */
export function createOrganicBlobGeometry(widthSegments = 96, heightSegments = 72) {
  const geom = new THREE.SphereGeometry(1.0, widthSegments, heightSegments);
  const posAttr = geom.attributes.position;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const u = posAttr.getX(i);
    const v = posAttr.getY(i);
    const w = posAttr.getZ(i);
    const [sx, sy, sz] = sculptBlobPosition(u, v, w);
    posAttr.setXYZ(i, sx, sy, sz);
  }

  geom.computeVertexNormals();

  const normAttr = geom.attributes.normal;
  const follicleMaskArray = new Float32Array(count);
  const groomTangentArray = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    follicleMaskArray[i] = evaluateFollicleMask(x, y, z);
    const [tx, ty, tz] = evaluateGroomFlow(x, y, z, nx, ny, nz);
    groomTangentArray[i * 3] = tx;
    groomTangentArray[i * 3 + 1] = ty;
    groomTangentArray[i * 3 + 2] = tz;
  }

  geom.setAttribute('aFollicleMask', new THREE.BufferAttribute(follicleMaskArray, 1));
  geom.setAttribute('aGroomTangent', new THREE.BufferAttribute(groomTangentArray, 3));

  return geom;
}

/**
 * Creates the complete Stylized Cat Creature group ("Kitty"):
 * - Base velvety under-skin mesh
 * - Sculpted triangular 3D cat ears with soft pastel-pink inner ear cups
 * - Multi-layered feline cat eyes with vertical slit pupils, almond cat-eye tilt, iris, and anime catchlights
 * - Inverted triangle pink cat nose and rounded whisker pads
 * - Cheerful cat smile with philtrum and W-shaped curves
 * - 6 delicate 3D whiskers sweeping out from the cheeks
 * - Rosy translucent cheek blush patches
 * - Interactive boop/jump & breathing physics state
 */
export function createBlobCreature() {
  const root = new THREE.Group();
  root.name = 'KittyCreature';

  const bodyGeometry = createOrganicBlobGeometry(96, 72);

  // Under-skin velvety material (visible at roots and around eyes/mouth)
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4a3248'),
    roughness: 0.78,
    metalness: 0.02
  });

  const bodyMesh = new THREE.Mesh(bodyGeometry, skinMaterial);
  bodyMesh.name = 'BlobBodyMesh';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  // Facial features container so eyes, blush, ears, whiskers, and nose move with head tilt
  const faceGroup = new THREE.Group();
  faceGroup.name = 'FacialFeatures';
  root.add(faceGroup);

  // 1. Stylized 3D Cat Ears with soft pink velvet inner ear cavity
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.46, 0.82, 0.08);
    earGroup.rotation.y = side * 0.26;
    earGroup.rotation.x = -0.10;
    earGroup.rotation.z = -side * 0.22;

    // Outer ear cone (velvety dark tone matching creature silhouette)
    const outerEarGeo = new THREE.ConeGeometry(0.25, 0.52, 4);
    outerEarGeo.scale(0.85, 1.0, 0.40);
    const outerEarMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3c2538'),
      roughness: 0.76,
      metalness: 0.03
    });
    const outerEar = new THREE.Mesh(outerEarGeo, outerEarMat);
    outerEar.position.y = 0.22;
    earGroup.add(outerEar);

    // Inner ear pink velvet pad (facing forward)
    const innerEarGeo = new THREE.ConeGeometry(0.17, 0.40, 4);
    innerEarGeo.scale(0.78, 0.98, 0.24);
    const innerEarMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffa8c4'),
      roughness: 0.52,
      metalness: 0.02
    });
    const innerEar = new THREE.Mesh(innerEarGeo, innerEarMat);
    innerEar.position.set(0, 0.20, 0.038);
    earGroup.add(innerEar);

    faceGroup.add(earGroup);
  }

  // 2. Feline Cat Eyes with almond slant, vertical pupils, and anime catchlights
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#100b18'),
    roughness: 0.04,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 1.0
  });

  const irisMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#582d8c')
  });

  const pupilMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#08040d')
  });

  const highlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff')
  });

  const warmHighlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffe4f2')
  });

  const eyelinerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#1a0c24')
  });

  const eyes = [];
  const eyeSides = [-1, 1];

  for (const side of eyeSides) {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.32, 0.16, 0.95);
    eyePivot.rotation.y = side * 0.24;
    eyePivot.rotation.x = -0.05;
    eyePivot.rotation.z = -side * 0.16; // Iconic feline cat-eye upward tilt!

    // Dark glossy cornea
    const eyeballGeo = new THREE.SphereGeometry(0.175, 32, 24);
    eyeballGeo.scale(1.06, 0.96, 0.68);
    const eyeball = new THREE.Mesh(eyeballGeo, eyeMaterial);
    eyePivot.add(eyeball);

    // Jewel violet-indigo feline iris
    const irisGeo = new THREE.SphereGeometry(0.125, 24, 16);
    irisGeo.scale(0.96, 0.95, 0.38);
    const iris = new THREE.Mesh(irisGeo, irisMaterial);
    iris.position.set(0, -0.015, 0.088);
    eyePivot.add(iris);

    // Vertical feline cat slit pupil!
    const pupilGeo = new THREE.SphereGeometry(0.09, 20, 16);
    pupilGeo.scale(0.32, 1.12, 0.32);
    const pupil = new THREE.Mesh(pupilGeo, pupilMaterial);
    pupil.position.set(0, -0.012, 0.102);
    eyePivot.add(pupil);

    // Sleek cat-eyeliner upper eyelid curve
    const eyelinerGeo = new THREE.TorusGeometry(0.15, 0.012, 8, 20, Math.PI * 0.65);
    const eyeliner = new THREE.Mesh(eyelinerGeo, eyelinerMat);
    eyeliner.position.set(0, 0.065, 0.095);
    eyeliner.rotation.z = -side * 0.22;
    eyePivot.add(eyeliner);

    // Primary large anime catchlight (top-inner)
    const catchlightMainGeo = new THREE.SphereGeometry(0.046, 16, 12);
    catchlightMainGeo.scale(1.0, 1.15, 0.32);
    const catchlightMain = new THREE.Mesh(catchlightMainGeo, highlightMat);
    catchlightMain.position.set(-side * 0.042, 0.052, 0.115);
    eyePivot.add(catchlightMain);

    // Secondary lower rim catchlight
    const catchlightSubGeo = new THREE.SphereGeometry(0.024, 14, 10);
    catchlightSubGeo.scale(1.0, 1.0, 0.32);
    const catchlightSub = new THREE.Mesh(catchlightSubGeo, warmHighlightMat);
    catchlightSub.position.set(side * 0.048, -0.052, 0.112);
    eyePivot.add(catchlightSub);

    faceGroup.add(eyePivot);
    eyes.push({
      pivot: eyePivot,
      basePos: eyePivot.position.clone(),
      catchlightMain,
      catchlightSub,
      pupil,
      side
    });
  }

  // 3. Puffy rounded cat whisker pads (muzzle cheeks)
  const muzzlePadMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fce7f1'),
    roughness: 0.85,
    metalness: 0.02
  });
  for (const side of [-1, 1]) {
    const padGeo = new THREE.SphereGeometry(0.075, 20, 16);
    padGeo.scale(1.22, 0.86, 0.58);
    const pad = new THREE.Mesh(padGeo, muzzlePadMat);
    pad.position.set(side * 0.078, 0.038, 1.055);
    pad.rotation.y = side * 0.20;
    pad.rotation.z = side * 0.04;
    faceGroup.add(pad);
  }

  // 4. Inverted triangular soft-pink cat nose
  const noseShape = new THREE.Shape();
  const nw = 0.044;
  const nh = 0.034;
  noseShape.moveTo(-nw, nh * 0.5);
  noseShape.quadraticCurveTo(0, nh * 0.72, nw, nh * 0.5);
  noseShape.quadraticCurveTo(nw * 0.88, 0, 0.005, -nh);
  noseShape.quadraticCurveTo(0, -nh * 1.12, -0.005, -nh);
  noseShape.quadraticCurveTo(-nw * 0.88, 0, -nw, nh * 0.5);

  const noseExtrudeSettings = {
    depth: 0.026,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.012,
    bevelThickness: 0.015
  };
  const noseGeo = new THREE.ExtrudeGeometry(noseShape, noseExtrudeSettings);
  const noseMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ff7ea2'),
    roughness: 0.28,
    metalness: 0.04,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18
  });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.076, 1.075);
  nose.rotation.x = -0.06;
  faceGroup.add(nose);

  // 5. Philtrum & smiling cat "ω" mouth
  const mouthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#381126') });
  const philtrumGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.038, 8);
  const philtrum = new THREE.Mesh(philtrumGeo, mouthMat);
  philtrum.position.set(0, 0.046, 1.066);
  philtrum.rotation.x = 0.12;
  faceGroup.add(philtrum);

  for (const side of [-1, 1]) {
    const arcGeo = new THREE.TorusGeometry(0.044, 0.0085, 10, 24, Math.PI * 0.88);
    const arc = new THREE.Mesh(arcGeo, mouthMat);
    arc.position.set(side * 0.042, 0.025, 1.063);
    arc.rotation.x = Math.PI + 0.15;
    arc.rotation.y = side * 0.16;
    arc.rotation.z = -side * 0.07;
    faceGroup.add(arc);
  }

  // 6. Whiskers: 6 delicate 3D whiskers curving out from Kitty's muzzle
  const whiskerMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.12,
    metalness: 0.05,
    transmission: 0.35,
    thickness: 0.05,
    clearcoat: 0.85
  });

  const whiskerSpecs = [
    // Top whisker: sweeps slightly up and back-outward
    [new THREE.Vector3(0.09, 0.052, 1.06), new THREE.Vector3(0.38, 0.11, 0.98), new THREE.Vector3(0.66, 0.12, 0.84)],
    // Middle whisker: shoots outward horizontally
    [new THREE.Vector3(0.10, 0.034, 1.06), new THREE.Vector3(0.42, 0.04, 0.96), new THREE.Vector3(0.72, 0.015, 0.82)],
    // Lower whisker: sweeps down and back
    [new THREE.Vector3(0.09, 0.016, 1.06), new THREE.Vector3(0.38, -0.03, 0.96), new THREE.Vector3(0.65, -0.09, 0.82)]
  ];

  for (const side of [-1, 1]) {
    for (const [p0, p1, p2] of whiskerSpecs) {
      const start = new THREE.Vector3(p0.x * side, p0.y, p0.z);
      const mid = new THREE.Vector3(p1.x * side, p1.y, p1.z);
      const end = new THREE.Vector3(p2.x * side, p2.y, p2.z);
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const whiskerGeo = new THREE.TubeGeometry(curve, 18, 0.007, 6, false);
      const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
      faceGroup.add(whisker);
    }
  }

  // 7. Rosy glowing blush ovals nestled on the outer cheeks
  const blushMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff5c93'),
    transparent: true,
    opacity: 0.52,
    depthWrite: false
  });

  for (const side of eyeSides) {
    const blushGeo = new THREE.SphereGeometry(0.11, 20, 16);
    blushGeo.scale(1.35, 0.72, 0.35);
    const blush = new THREE.Mesh(blushGeo, blushMat);
    blush.position.set(side * 0.46, -0.01, 0.97);
    blush.rotation.y = side * 0.32;
    blush.rotation.z = -side * 0.1;
    faceGroup.add(blush);
  }

  // Animation & physics state for creature motion (coupled to GPGPU fur inertia)
  const animState = {
    time: 0,
    baseScale: 1.0,
    baseX: 0.0,
    baseY: 0.0,
    baseZ: 0.0,
    blinkTimer: 0,
    nextBlink: 2.8,
    boopImpulse: 0,
    boopPhase: 0,
    prevPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    targetLook: new THREE.Vector2(0, 0),
    currentLook: new THREE.Vector2(0, 0)
  };

  // Spatial anchor position & viewer-facing orientation for AR plane placement
  const anchorPos = new THREE.Vector3(0, 0, 0);
  const targetAnchorPos = new THREE.Vector3(0, 0, 0);
  const startAnchorPos = new THREE.Vector3(0, 0, 0);
  let isPlaced = false;
  let isPlacing = false;
  let placeProgress = 1.0;
  let placeHopHeight = 0.0;
  let facingYaw = 0.0;
  let facingPitch = 0.0;
  let targetFacingYaw = 0.0;
  let targetFacingPitch = 0.0;
  let faceViewerHoldTimer = 0.0;

  function placeAt(targetWorldPos, normal, animate = true, cameraPos = null) {
    if (!targetWorldPos) return;
    isPlaced = true;
    const s = animState.baseScale;
    // targetWorldPos is the point on the detected plane surface.
    // Mochi's paws sit flush on the plane when center Y is targetWorldPos.y + 0.94 * s
    const targetCenterY = targetWorldPos.y + 0.94 * s;

    // Reset gaze offset so Mochi looks straight at the viewer instead of toward the tap edge
    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    faceViewerHoldTimer = 1.4;

    if (cameraPos) {
      const dx = cameraPos.x - targetWorldPos.x;
      const dy = cameraPos.y - targetCenterY;
      const dz = cameraPos.z - targetWorldPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
      if (!animate) {
        facingYaw = targetFacingYaw;
        facingPitch = targetFacingPitch;
      }
    }

    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.65, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      targetAnchorPos.copy(anchorPos);
      isPlacing = false;
      placeProgress = 1.0;
    }
  }

  function resetPlacement(animate = true) {
    isPlaced = false;
    targetFacingYaw = 0.0;
    targetFacingPitch = 0.0;
    faceViewerHoldTimer = 0.0;
    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    const s = animState.baseScale;
    const ox = animState.baseX || 0.0;
    const oz = animState.baseZ || 0.0;
    const targetY = -0.94 + 0.94 * s;
    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(ox, targetY, oz);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.55, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(ox, targetY, oz);
      targetAnchorPos.set(ox, targetY, oz);
      startAnchorPos.set(ox, targetY, oz);
      facingYaw = 0.0;
      facingPitch = 0.0;
      isPlacing = false;
      placeProgress = 1.0;
      animState.boopImpulse = 0.0;
      animState.boopPhase = 0.0;
    }
  }

  function setEnvironmentScale(scale, offsetX = 0.0, offsetZ = 0.0) {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1.0;
    const ox = Number.isFinite(offsetX) ? offsetX : 0.0;
    const oz = Number.isFinite(offsetZ) ? offsetZ : 0.0;
    animState.baseScale = s;
    animState.baseX = ox;
    animState.baseY = -0.94 * (1.0 - s);
    animState.baseZ = oz;
    if (!isPlaced) {
      anchorPos.set(ox, -0.94 + 0.94 * s, oz);
      targetAnchorPos.copy(anchorPos);
      startAnchorPos.copy(anchorPos);
      facingYaw = 0.0;
      facingPitch = 0.0;
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }
  }

  function triggerBoop() {
    animState.boopImpulse = 1.0;
    animState.boopPhase = 0.0;
  }

  function update(dt, pointerNDC, cameraPos = null, isARMode = false) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    animState.time += safeDt;

    if (faceViewerHoldTimer > 0) {
      faceViewerHoldTimer = Math.max(0, faceViewerHoldTimer - safeDt);
    }

    // Smooth eye/head tracking toward pointer (held centered on viewer right after placement)
    if (pointerNDC && faceViewerHoldTimer <= 0) {
      animState.targetLook.set(pointerNDC.x * 0.35, pointerNDC.y * 0.25);
    } else if (faceViewerHoldTimer > 0) {
      animState.targetLook.set(0, 0);
    }
    animState.currentLook.lerp(animState.targetLook, Math.min(1.0, safeDt * 7.5));

    // Breathing & happy idle bobbing + boop jump impulse
    if (animState.boopImpulse > 0.001) {
      animState.boopPhase += safeDt * 14.0;
      animState.boopImpulse *= Math.exp(-safeDt * 3.6);
    } else {
      animState.boopImpulse = 0.0;
    }

    // Parabolic placement leap towards target anchor plane
    let hop = 0.0;
    if (isPlacing) {
      placeProgress += safeDt * 3.4;
      if (placeProgress >= 1.0) {
        placeProgress = 1.0;
        isPlacing = false;
        anchorPos.copy(targetAnchorPos);
        triggerBoop(); // Playful squash & fur recoil on landing
      } else {
        const p = placeProgress;
        anchorPos.lerpVectors(startAnchorPos, targetAnchorPos, p);
        hop = Math.sin(p * Math.PI) * placeHopHeight;
      }
    }

    // When placed in AR mode, keep Mochi's front face oriented directly towards the viewer (camera)
    if ((isPlaced || isARMode) && cameraPos) {
      const dx = cameraPos.x - anchorPos.x;
      const dy = cameraPos.y - anchorPos.y;
      const dz = cameraPos.z - anchorPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
    } else if (!isPlaced) {
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }

    const yawDiff = Math.atan2(Math.sin(targetFacingYaw - facingYaw), Math.cos(targetFacingYaw - facingYaw));
    facingYaw += yawDiff * Math.min(1.0, safeDt * 12.0);
    facingPitch += (targetFacingPitch - facingPitch) * Math.min(1.0, safeDt * 12.0);

    const s = animState.baseScale;
    const breath = Math.sin(animState.time * 2.3) * 0.035;
    const bodyLookScale = (isPlaced || isARMode) ? (faceViewerHoldTimer > 0 ? 0.0 : 0.06) : 1.0;
    const swayX = (Math.sin(animState.time * 1.35) * 0.06 + animState.currentLook.x * 0.15 * bodyLookScale) * s;
    const jumpY =
      (Math.sin(animState.time * 2.3) * 0.045 +
        Math.abs(Math.sin(animState.boopPhase)) * animState.boopImpulse * 0.32) *
        s;

    const squash =
      1.0 +
      breath +
      Math.cos(animState.boopPhase * 2.0) * animState.boopImpulse * 0.14;

    const prevX = root.position.x;
    const prevY = root.position.y;
    const prevZ = root.position.z;
    const prevRotZ = root.rotation.z;
    const prevRotY = root.rotation.y;

    root.position.set(
      anchorPos.x + swayX,
      anchorPos.y + jumpY + hop,
      anchorPos.z
    );
    root.scale.set((1.0 / Math.sqrt(squash)) * s, squash * s, (1.0 / Math.sqrt(squash)) * s);
    root.rotation.y = facingYaw + animState.currentLook.x * 0.38 * bodyLookScale + Math.sin(animState.time * 0.9) * (isPlaced ? 0.03 : 0.08);
    root.rotation.x = facingPitch - animState.currentLook.y * 0.22 * bodyLookScale + Math.cos(animState.time * 1.8) * (isPlaced ? 0.02 : 0.04);
    root.rotation.z = -(swayX / s) * 0.35 + Math.sin(animState.boopPhase) * animState.boopImpulse * 0.18;

    // Compute instantaneous creature velocity & angular velocity for GPGPU fur inertia
    animState.velocity.set(
      (root.position.x - prevX) / (safeDt * s),
      (root.position.y - prevY) / (safeDt * s),
      (root.position.z - prevZ) / (safeDt * s)
    );
    animState.angularVelocity.set(
      0,
      (root.rotation.y - prevRotY) / safeDt,
      (root.rotation.z - prevRotZ) / safeDt
    );

    // Blinking and happy squint during boop
    animState.blinkTimer += safeDt;
    let blinkScaleY = 1.0;
    if (animState.blinkTimer > animState.nextBlink) {
      const blinkProgress = (animState.blinkTimer - animState.nextBlink) / 0.16;
      if (blinkProgress < 1.0) {
        blinkScaleY = Math.max(0.08, Math.abs(Math.cos(blinkProgress * Math.PI)));
      } else {
        animState.blinkTimer = 0;
        animState.nextBlink = 2.4 + Math.random() * 2.5;
      }
    }
    if (animState.boopImpulse > 0.25) {
      blinkScaleY = Math.min(blinkScaleY, 0.18);
    }

    for (const eye of eyes) {
      eye.pivot.scale.y = blinkScaleY;
      if (eye.pupil) {
        eye.pupil.position.x = animState.currentLook.x * 0.020;
        eye.pupil.position.y = -0.012 + animState.currentLook.y * 0.018;
      }
      eye.catchlightMain.position.x = -eye.side * 0.042 + animState.currentLook.x * 0.028;
      eye.catchlightMain.position.y = 0.052 + animState.currentLook.y * 0.025;
    }
  }

  return {
    root,
    bodyMesh,
    bodyGeometry,
    skinMaterial,
    animState,
    setEnvironmentScale,
    triggerBoop,
    placeAt,
    resetPlacement,
    isPlaced: () => isPlaced,
    getAnchorPosition: () => anchorPos,
    update
  };
}
