import * as THREE from 'three';

/**
 * Evaluates the anatomical follicle growth mask at a local position on the blob surface.
 * Returns a float in [0.0, 1.0]:
 * - 0.0 inside eye sockets and mouth recess (prevents hair from poking through eyes/mouth)
 * - Smoothly tapers (0.2 -> 1.0) around the eye rims, nose bridge, and paw pads
 * - Slightly longer/fluffier (1.15) on the cheek tufts, chest fluff, and ear tips
 */
export function evaluateFollicleMask(x, y, z) {
  // Left and right eye centers in local space (matching large circular chibi eyes: ±0.28, 0.12, 0.96)
  const lx = x + 0.28;
  const rx = x - 0.28;
  const ey = y - 0.12;
  const ez = z - 0.92;

  const distLeftEye = Math.sqrt(lx * lx + ey * ey * 1.1 + ez * ez);
  const distRightEye = Math.sqrt(rx * rx + ey * ey * 1.1 + ez * ez);
  const minEyeDist = Math.min(distLeftEye, distRightEye);

  // Clean clearing around the large glossy circular eyes
  if (minEyeDist < 0.18) {
    return 0.0;
  }
  const eyeMask = smoothstep(0.18, 0.28, minEyeDist);

  // Eyebrow clearing (short fuzz so black brows stand out crisp)
  const leftBrowDist = Math.hypot(x + 0.27, y - 0.35, z - 0.92);
  const rightBrowDist = Math.hypot(x - 0.27, y - 0.35, z - 0.92);
  const browMask = 0.35 + 0.65 * smoothstep(0.06, 0.18, Math.min(leftBrowDist, rightBrowDist));

  // Cat muzzle & nose zone: trim fur on the white whisker pads and hot pink nose button
  const mx = x / 0.26;
  const my = (y + 0.01) / 0.16;
  const mz = (z - 0.98) / 0.22;
  const distMuzzle = Math.sqrt(mx * mx + my * my + mz * mz);
  const muzzleMask = 0.06 + 0.94 * smoothstep(0.35, 1.05, distMuzzle);

  // Inner ear cavity clearing: trim fur on the front side of the ears so pink inner ear scoop is clearly visible
  const leftEarDist = Math.hypot(x + 0.44, (y - 0.74) * 0.9, z - 0.14);
  const rightEarDist = Math.hypot(x - 0.44, (y - 0.74) * 0.9, z - 0.14);
  const earFrontMask = 0.20 + 0.80 * smoothstep(0.10, 0.32, Math.min(leftEarDist, rightEarDist));

  // Bottom belly contact pad taper
  const bottomMask = smoothstep(-1.05, -0.72, y);

  // Extra fluff boost on round cheeks
  const cheekDist = Math.min(
    Math.hypot(x + 0.55, y + 0.05, z - 0.65),
    Math.hypot(x - 0.55, y + 0.05, z - 0.65)
  );
  const cheekFluff = 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.45, cheekDist));

  return Math.max(0.0, Math.min(1.30, eyeMask * browMask * muzzleMask * earFrontMask * bottomMask * cheekFluff));
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

  // 1. Stylized 3D Cat Ears with soft peach-pink velvet inner ear cavity
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.46, 0.74, 0.10);
    earGroup.rotation.y = side * 0.20;
    earGroup.rotation.x = -0.08;
    earGroup.rotation.z = -side * 0.18;

    // Outer ear shell (velvety dark tone matching the deep purple fur base)
    const outerEarGeo = new THREE.ConeGeometry(0.26, 0.54, 4);
    outerEarGeo.scale(0.85, 1.0, 0.38);
    const outerEarMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#340742'),
      roughness: 0.75,
      metalness: 0.03
    });
    const outerEar = new THREE.Mesh(outerEarGeo, outerEarMat);
    outerEar.position.y = 0.22;
    earGroup.add(outerEar);

    // Inner ear scoop: large smooth salmon/peach-pink velvet cavity (from reference image)
    const innerEarGeo = new THREE.ConeGeometry(0.185, 0.44, 4);
    innerEarGeo.scale(0.82, 0.98, 0.22);
    const innerEarMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f88da6'),
      roughness: 0.48,
      metalness: 0.02
    });
    const innerEar = new THREE.Mesh(innerEarGeo, innerEarMat);
    innerEar.position.set(0, 0.20, 0.042);
    earGroup.add(innerEar);

    faceGroup.add(earGroup);
  }

  // 2. Cute arched dark eyebrows above the eyes (from reference image)
  const eyebrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#14081c') });
  const eyebrows = [];
  for (const side of [-1, 1]) {
    const start = new THREE.Vector3(side * 0.19, 0.315, 0.94);
    const mid = new THREE.Vector3(side * 0.275, 0.36, 0.93);
    const end = new THREE.Vector3(side * 0.365, 0.315, 0.91);
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const browGeo = new THREE.TubeGeometry(curve, 14, 0.0085, 6, false);
    const brow = new THREE.Mesh(browGeo, eyebrowMat);
    faceGroup.add(brow);
    eyebrows.push({ mesh: brow, baseY: brow.position.y });
  }

  // 3. Large, glossy circular chibi eyes with amethyst crescent and top-left catchlight
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#12061e'),
    roughness: 0.03,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 1.0
  });

  const irisMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#7834bf')
  });

  const pupilMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#140620')
  });

  const highlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff')
  });

  const eyeBlushMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#f25290'),
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });

  const eyes = [];
  const eyeSides = [-1, 1];

  for (const side of eyeSides) {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.28, 0.12, 0.96);
    eyePivot.rotation.y = side * 0.18;
    eyePivot.rotation.x = -0.04;

    // Dark glossy cornea sphere
    const eyeballGeo = new THREE.SphereGeometry(0.18, 32, 24);
    eyeballGeo.scale(1.0, 1.0, 0.72);
    const eyeball = new THREE.Mesh(eyeballGeo, eyeMaterial);
    eyePivot.add(eyeball);

    // Glowing violet/amethyst iris crescent on lower half
    const irisGeo = new THREE.SphereGeometry(0.14, 24, 16);
    irisGeo.scale(0.96, 0.92, 0.42);
    const iris = new THREE.Mesh(irisGeo, irisMaterial);
    iris.position.set(0, -0.035, 0.082);
    eyePivot.add(iris);

    // Deep obsidian center pupil dome
    const pupilGeo = new THREE.SphereGeometry(0.13, 24, 16);
    pupilGeo.scale(0.85, 0.85, 0.38);
    const pupil = new THREE.Mesh(pupilGeo, pupilMaterial);
    pupil.position.set(0, 0.02, 0.095);
    eyePivot.add(pupil);

    // SINGLE large, crisp, bright white circular highlight located in the TOP-LEFT of EACH eye
    const catchlightMainGeo = new THREE.SphereGeometry(0.052, 18, 14);
    catchlightMainGeo.scale(1.0, 1.08, 0.32);
    const catchlightMain = new THREE.Mesh(catchlightMainGeo, highlightMat);
    catchlightMain.position.set(-0.046, 0.054, 0.118);
    eyePivot.add(catchlightMain);

    // Soft rosy blush glow under the lower outer rim of each eye
    const blushGeo = new THREE.SphereGeometry(0.095, 16, 12);
    blushGeo.scale(1.3, 0.65, 0.3);
    const eyeBlush = new THREE.Mesh(blushGeo, eyeBlushMat);
    eyeBlush.position.set(side * 0.035, -0.095, 0.085);
    eyePivot.add(eyeBlush);

    faceGroup.add(eyePivot);
    eyes.push({
      pivot: eyePivot,
      basePos: eyePivot.position.clone(),
      catchlightMain,
      iris,
      pupil,
      side
    });
  }

  // 4. Soft fluffy white / light-pink whisker pads (muzzle cheeks)
  const muzzlePadMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fae6f2'),
    roughness: 0.92,
    metalness: 0.01
  });
  for (const side of [-1, 1]) {
    const padGeo = new THREE.SphereGeometry(0.082, 24, 18);
    padGeo.scale(1.25, 0.90, 0.62);
    const pad = new THREE.Mesh(padGeo, muzzlePadMat);
    pad.position.set(side * 0.076, -0.015, 1.045);
    pad.rotation.y = side * 0.16;
    pad.rotation.z = side * 0.04;
    faceGroup.add(pad);
  }

  // 5. Vibrant hot pink / magenta rounded triangle cat nose (from reference image)
  const noseShape = new THREE.Shape();
  const nw = 0.045;
  const nh = 0.035;
  noseShape.moveTo(-nw, nh * 0.45);
  noseShape.quadraticCurveTo(0, nh * 0.72, nw, nh * 0.45);
  noseShape.quadraticCurveTo(nw * 0.82, 0, 0.004, -nh);
  noseShape.quadraticCurveTo(0, -nh * 1.15, -0.004, -nh);
  noseShape.quadraticCurveTo(-nw * 0.82, 0, -nw, nh * 0.45);

  const noseExtrudeSettings = {
    depth: 0.028,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.014,
    bevelThickness: 0.016
  };
  const noseGeo = new THREE.ExtrudeGeometry(noseShape, noseExtrudeSettings);
  const noseMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f72585'), // Vibrant hot-pink matching the image!
    roughness: 0.22,
    metalness: 0.04,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15
  });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.042, 1.072);
  nose.rotation.x = -0.05;
  faceGroup.add(nose);

  // Dark philtrum seam line dropping from nose bottom between the two white pads
  const philtrumMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#380824') });
  const philtrumGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.038, 8);
  const philtrum = new THREE.Mesh(philtrumGeo, philtrumMat);
  philtrum.position.set(0, 0.008, 1.062);
  philtrum.rotation.x = 0.12;
  faceGroup.add(philtrum);

  // 6. Whiskers: exactly 3 white whiskers per cheek fanning downward across cheeks (from reference image)
  const whiskerMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.10,
    metalness: 0.02,
    transmission: 0.20,
    thickness: 0.05,
    clearcoat: 0.95
  });

  const whiskerSpecs = [
    // Top whisker: slightly downward-horizontal
    [new THREE.Vector3(0.11, 0.005, 1.05), new THREE.Vector3(0.35, -0.015, 0.98), new THREE.Vector3(0.58, -0.045, 0.88)],
    // Middle whisker: downward angle ~15 degrees
    [new THREE.Vector3(0.11, -0.025, 1.05), new THREE.Vector3(0.36, -0.075, 0.97), new THREE.Vector3(0.60, -0.135, 0.87)],
    // Bottom whisker: downward angle ~28 degrees
    [new THREE.Vector3(0.10, -0.055, 1.05), new THREE.Vector3(0.34, -0.135, 0.96), new THREE.Vector3(0.55, -0.220, 0.85)]
  ];

  for (const side of [-1, 1]) {
    for (const [p0, p1, p2] of whiskerSpecs) {
      const start = new THREE.Vector3(p0.x * side, p0.y, p0.z);
      const mid = new THREE.Vector3(p1.x * side, p1.y, p1.z);
      const end = new THREE.Vector3(p2.x * side, p2.y, p2.z);
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const whiskerGeo = new THREE.TubeGeometry(curve, 18, 0.008, 6, false);
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
        eye.pupil.position.x = animState.currentLook.x * 0.018;
        eye.pupil.position.y = 0.02 + animState.currentLook.y * 0.016;
      }
      if (eye.iris) {
        eye.iris.position.x = animState.currentLook.x * 0.015;
        eye.iris.position.y = -0.035 + animState.currentLook.y * 0.014;
      }
      eye.catchlightMain.position.x = -0.046 + animState.currentLook.x * 0.018;
      eye.catchlightMain.position.y = 0.054 + animState.currentLook.y * 0.016;
    }

    for (const brow of eyebrows) {
      brow.mesh.position.y = brow.baseY + animState.currentLook.y * 0.012 + animState.boopImpulse * 0.018;
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
