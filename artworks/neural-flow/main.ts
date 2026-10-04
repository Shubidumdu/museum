import { setupArtworkViewer } from '../../src/components/viewer-shell.ts';

const canvas = document.getElementById('artworkCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let width = (canvas.width = window.innerWidth);
let height = (canvas.height = window.innerHeight);

window.addEventListener('resize', () => {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
});

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  energy: number;
}

interface Pulse {
  fromNode: number;
  toNode: number;
  progress: number;
  speed: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

const nodeCount = 65;
const nodes: Node[] = [];
for (let i = 0; i < nodeCount; i++) {
  nodes.push({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    radius: Math.random() * 2.5 + 2,
    energy: Math.random() * 0.5,
  });
}

const pulses: Pulse[] = [];
const shockwaves: Shockwave[] = [];

let mouseX = -1000;
let mouseY = -1000;

window.addEventListener('pointermove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

window.addEventListener('pointerdown', (e) => {
  shockwaves.push({
    x: e.clientX,
    y: e.clientY,
    radius: 5,
    maxRadius: 280,
    alpha: 1,
  });

  // Energize nearby nodes
  for (let i = 0; i < nodes.length; i++) {
    const d = Math.hypot(nodes[i].x - e.clientX, nodes[i].y - e.clientY);
    if (d < 250) {
      nodes[i].energy = 1.0;
      // Spawn pulses to other connected nodes
      for (let j = 0; j < nodes.length; j++) {
        if (i !== j && Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < 160) {
          pulses.push({
            fromNode: i,
            toNode: j,
            progress: 0,
            speed: Math.random() * 0.04 + 0.02,
          });
        }
      }
    }
  }
});

let isPlaying = true;
setupArtworkViewer('neural-flow', {
  interactionHint: '화면을 클릭하여 시냅스 충격파를 방출하고, 마우스 호버로 신경망을 활성화하세요.',
  onTogglePlay: (playing) => {
    isPlaying = playing;
  },
});

function animate() {
  if (isPlaying) {
    ctx.fillStyle = 'rgba(10, 8, 16, 0.28)';
    ctx.fillRect(0, 0, width, height);

    // Update shockwaves
    for (let s = shockwaves.length - 1; s >= 0; s--) {
      const sw = shockwaves[s];
      sw.radius += 5;
      sw.alpha = 1 - sw.radius / sw.maxRadius;
      if (sw.alpha <= 0) {
        shockwaves.splice(s, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(232, 121, 249, ${sw.alpha * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Update & draw nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;

      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;

      // Interaction with mouse
      const distMouse = Math.hypot(n.x - mouseX, n.y - mouseY);
      if (distMouse < 140) {
        n.energy = Math.min(1.0, n.energy + 0.05);
        // Slightly push away
        const angle = Math.atan2(n.y - mouseY, n.x - mouseX);
        n.x += Math.cos(angle) * 0.8;
        n.y += Math.sin(angle) * 0.8;
      } else {
        n.energy *= 0.985;
      }

      // Draw connections
      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        const dist = Math.hypot(n.x - m.x, n.y - m.y);
        const maxDist = 150;

        if (dist < maxDist) {
          const strength = 1 - dist / maxDist;
          const combinedEnergy = (n.energy + m.energy) * 0.5;
          const alpha = (strength * 0.25) + combinedEnergy * 0.5;

          ctx.strokeStyle = `rgba(232, 121, 249, ${alpha})`;
          ctx.lineWidth = 0.8 + combinedEnergy * 1.5;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();

          // Spontaneously fire pulses
          if (Math.random() < 0.0015 && pulses.length < 40) {
            pulses.push({
              fromNode: i,
              toNode: j,
              progress: 0,
              speed: Math.random() * 0.02 + 0.015,
            });
          }
        }
      }

      // Draw node circle
      const r = n.radius + n.energy * 3;
      ctx.fillStyle = n.energy > 0.3 ? '#fbcfe8' : '#e879f9';
      ctx.shadowColor = '#e879f9';
      ctx.shadowBlur = n.energy * 15;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Update & draw pulses
    for (let p = pulses.length - 1; p >= 0; p--) {
      const pulse = pulses[p];
      pulse.progress += pulse.speed;

      if (pulse.progress >= 1) {
        nodes[pulse.toNode].energy = Math.min(1.0, nodes[pulse.toNode].energy + 0.4);
        pulses.splice(p, 1);
        continue;
      }

      const n1 = nodes[pulse.fromNode];
      const n2 = nodes[pulse.toNode];
      if (!n1 || !n2) continue;

      const px = n1.x + (n2.x - n1.x) * pulse.progress;
      const py = n1.y + (n2.y - n1.y) * pulse.progress;

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#f472b6';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  requestAnimationFrame(animate);
}

animate();
