import { setupArtworkViewer } from '../../src/components/viewer-shell.ts';

const canvas = document.getElementById('artworkCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
});

// 3D Polyhedron Geometry (Combined Nested Octahedron / Icosahedron-style vertices)
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const baseVertices: Vec3[] = [
  // Outer Octahedron
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },

  // Inner Cube Vertices
  { x: 0.5, y: 0.5, z: 0.5 },
  { x: -0.5, y: 0.5, z: 0.5 },
  { x: 0.5, y: -0.5, z: 0.5 },
  { x: -0.5, y: -0.5, z: 0.5 },
  { x: 0.5, y: 0.5, z: -0.5 },
  { x: -0.5, y: 0.5, z: -0.5 },
  { x: 0.5, y: -0.5, z: -0.5 },
  { x: -0.5, y: -0.5, z: -0.5 },
];

// Edges connecting vertices
const edges: [number, number][] = [
  // Outer octahedron edges
  [0, 2], [2, 1], [1, 3], [3, 0],
  [0, 4], [1, 4], [2, 4], [3, 4],
  [0, 5], [1, 5], [2, 5], [3, 5],

  // Inner cube edges
  [6, 7], [7, 9], [9, 8], [8, 6],
  [10, 11], [11, 13], [13, 12], [12, 10],
  [6, 10], [7, 11], [8, 12], [9, 13],

  // Connectors
  [0, 6], [1, 7], [2, 10], [3, 9], [4, 8], [5, 13],
];

// Rotation state
let rotX = 0.4;
let rotY = 0.6;
let velX = 0.005;
let velY = 0.008;
let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

window.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (isDragging) {
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    rotY += dx * 0.008;
    rotX += dy * 0.008;
    velY = dx * 0.002;
    velX = dy * 0.002;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

let isPlaying = true;
setupArtworkViewer('chromatic-prism', {
  interactionHint: '화면을 드래그하여 다면체 프리즘을 회전시키고 빛의 굴절 각도를 조절하세요.',
  onTogglePlay: (playing) => {
    isPlaying = playing;
  },
});

function rotate3D(v: Vec3, ax: number, ay: number): Vec3 {
  // Rotate around Y
  const cosY = Math.cos(ay);
  const sinY = Math.sin(ay);
  const x1 = v.x * cosY + v.z * sinY;
  const y1 = v.y;
  const z1 = -v.x * sinY + v.z * cosY;

  // Rotate around X
  const cosX = Math.cos(ax);
  const sinX = Math.sin(ax);
  const x2 = x1;
  const y2 = y1 * cosX - z1 * sinX;
  const z2 = y1 * sinX + z1 * cosX;

  return { x: x2, y: y2, z: z2 };
}

function project(v: Vec3, fov: number, scale: number) {
  const distance = 3.2;
  const pz = v.z + distance;
  const factor = (fov / pz) * scale;
  return {
    x: width / 2 + v.x * factor,
    y: height / 2 + v.y * factor,
    z: v.z,
  };
}

let frame = 0;

function animate() {
  if (isPlaying) {
    frame++;

    if (!isDragging) {
      rotX += velX;
      rotY += velY;
      velX *= 0.985;
      velY *= 0.985;
      if (Math.abs(velX) < 0.003) velX = 0.003;
      if (Math.abs(velY) < 0.005) velY = 0.005;
    }

    ctx.fillStyle = 'rgba(6, 9, 15, 0.25)';
    ctx.fillRect(0, 0, width, height);

    const baseScale = Math.min(width, height) * 0.38;

    // We render 3 passes for chromatic aberration (Red, Green, Blue)
    const channels = [
      { color: 'rgba(255, 60, 100, 0.75)', offset: -0.018 },
      { color: 'rgba(60, 240, 150, 0.75)', offset: 0.0 },
      { color: 'rgba(80, 150, 255, 0.75)', offset: 0.018 },
    ];

    ctx.globalCompositeOperation = 'screen';

    for (const ch of channels) {
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 1.8;

      const currentRotY = rotY + ch.offset;
      const currentRotX = rotX + ch.offset * 0.5;

      const projected = baseVertices.map((v) => {
        const rotated = rotate3D(v, currentRotX, currentRotY);
        return project(rotated, 400, baseScale);
      });

      // Draw Edges
      for (const [i, j] of edges) {
        const p1 = projected[i];
        const p2 = projected[j];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // Draw vertex nodes
      for (const p of projected) {
        ctx.fillStyle = ch.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    // Ambient glow in center
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      10,
      width / 2,
      height / 2,
      baseScale * 0.9
    );
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.1)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, baseScale * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(animate);
}

animate();
