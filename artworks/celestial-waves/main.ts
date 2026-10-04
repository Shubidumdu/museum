import { setupArtworkViewer } from '../../src/components/viewer-shell.ts';

const canvas = document.getElementById('artworkCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
});

// Mouse tracking
let mouseX = width / 2;
let mouseY = height / 2;
let targetMouseX = mouseX;
let targetMouseY = mouseY;
let waveIntensity = 1;

window.addEventListener('pointermove', (e) => {
  targetMouseX = e.clientX;
  targetMouseY = e.clientY;
});

window.addEventListener('pointerdown', () => {
  waveIntensity = 2.4;
});

window.addEventListener('pointerup', () => {
  waveIntensity = 1.0;
});

// Particles
interface StarParticle {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  speed: number;
  phase: number;
}

const particles: StarParticle[] = Array.from({ length: 90 }, () => ({
  x: Math.random() * width,
  y: Math.random() * height,
  size: Math.random() * 2 + 0.5,
  baseAlpha: Math.random() * 0.7 + 0.2,
  speed: Math.random() * 0.4 + 0.1,
  phase: Math.random() * Math.PI * 2,
}));

let frame = 0;

setupArtworkViewer('celestial-waves');

function animate() {
  frame++;

    // Smooth mouse follow
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    // Fade background to create motion trail
    ctx.fillStyle = 'rgba(7, 8, 14, 0.2)';
    ctx.fillRect(0, 0, width, height);

    // Draw starlight background particles
    for (const p of particles) {
      p.y -= p.speed;
      if (p.y < 0) p.y = height;
      const alpha = p.baseAlpha + Math.sin(frame * 0.03 + p.phase) * 0.2;
      ctx.fillStyle = `rgba(210, 220, 255, ${Math.max(0.05, alpha)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw harmonic ribbons
    const ribbonCount = 8;
    const segments = 120;
    const step = width / segments;
    const normalizedMouseY = (mouseY / height - 0.5) * 2;

    for (let r = 0; r < ribbonCount; r++) {
      ctx.beginPath();
      const hue = 220 + r * 14 + Math.sin(frame * 0.01) * 20;
      const alpha = 0.35 + (r / ribbonCount) * 0.35;
      ctx.strokeStyle = `hsla(${hue}, 85%, 65%, ${alpha})`;
      ctx.lineWidth = 1.6 + r * 0.4;

      const rOffset = (r - ribbonCount / 2) * 18;

      for (let i = 0; i <= segments; i++) {
        const x = i * step;
        const distToMouse = Math.hypot(x - mouseX, height / 2 - mouseY);
        const mouseFactor = Math.max(0, 1 - distToMouse / (width * 0.5));

        const y =
          height / 2 +
          rOffset +
          Math.sin(i * 0.08 + frame * 0.02 + r * 0.4) * 45 * waveIntensity +
          Math.cos(i * 0.03 - frame * 0.015 + r * 0.2) * 35 * waveIntensity +
          normalizedMouseY * 90 * mouseFactor;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Center focal glow
    const radialGrad = ctx.createRadialGradient(
      mouseX,
      mouseY,
      0,
      mouseX,
      mouseY,
      180
    );
    radialGrad.addColorStop(0, 'rgba(140, 120, 255, 0.18)');
    radialGrad.addColorStop(1, 'rgba(140, 120, 255, 0)');
    ctx.fillStyle = radialGrad;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 180, 0, Math.PI * 2);
    ctx.fill();

  requestAnimationFrame(animate);
}

animate();
