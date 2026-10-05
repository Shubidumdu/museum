import "./style.css";
import { ARTWORKS, type Artwork } from "./data/artworks.ts";

function renderApp() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  app.innerHTML = `
    <header class="museum-header">
      <a href="/" class="brand">
        <img src="logo.png" alt="Shubidumdu Studio"/>
      </a>
    </header>

    <main>
      <section class="gallery-section">
        <div class="section-label">
          <span>Artworks (${ARTWORKS.length})</span>
        </div>

        <div class="artwork-grid" id="artworkGrid">
          ${ARTWORKS.map((artwork) => createCardHtml(artwork)).join("")}
        </div>
      </section>
    </main>

    <footer class="museum-footer">
      <p>© 2026 Shubidumdu Studio</p>
    </footer>
  `;

  // Start mini preview canvases
  initCardPreviews();
}

function createCardHtml(artwork: Artwork): string {
  return `
    <a href="/artworks/${artwork.slug}/" class="artwork-card" data-slug="${artwork.slug}">
      <div class="card-preview">
        <canvas class="card-canvas-preview" id="preview-${artwork.slug}" width="400" height="250"></canvas>
      </div>
      <div class="card-body">
        <h3 class="card-title">${artwork.title}</h3>
      </div>
    </a>
  `;
}

function initCardPreviews() {
  ARTWORKS.forEach((artwork) => {
    const canvas = document.getElementById(
      `preview-${artwork.slug}`,
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let animId: number;

    const render = () => {
      frame++;
      const { width, height } = canvas;
      ctx.fillStyle = "#0a0c14";
      ctx.fillRect(0, 0, width, height);

      if (artwork.slug === "celestial-waves") {
        // Celestial Waves preview
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.strokeStyle = `hsla(${240 + i * 20}, 80%, 65%, 0.45)`;
          for (let x = 0; x < width; x += 6) {
            const y =
              height / 2 + Math.sin(x * 0.02 + frame * 0.03 + i) * (20 + i * 8);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (artwork.slug === "my-own-paradise") {
        // My Own Paradise (Babylon 3D floating orb & rings) preview
        const cx = width / 2;
        const cy = height / 2;
        const time = frame * 0.025;

        // Floating core
        const coreY = cy + Math.sin(time) * 10;
        ctx.save();
        ctx.translate(cx, coreY);

        // Outer Elliptical Rings
        ctx.strokeStyle = "rgba(240, 173, 78, 0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 60, 22, time * 0.4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(208, 63, 44, 0.5)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 75, 28, -time * 0.3, 0, Math.PI * 2);
        ctx.stroke();

        // Core diamond / sphere
        ctx.fillStyle = "#f0ad4e";
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();

        // Orbiting satellite
        const satX = Math.cos(time * 1.5) * 55;
        const satY = Math.sin(time * 1.5) * 20;
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(satX, satY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      } else if (artwork.slug === "chromatic-prism") {
        // Chromatic Prism preview
        const cx = width / 2;
        const cy = height / 2;
        const angle = frame * 0.02;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        for (let r = 20; r <= 70; r += 16) {
          ctx.strokeStyle = `hsla(${r * 3 + frame}, 85%, 65%, 0.6)`;
          ctx.lineWidth = 1.8;
          ctx.strokeRect(-r / 2, -r / 2, r, r);
        }
        ctx.restore();
      } else if (artwork.slug === "neural-flow") {
        // Neural Flow preview
        const count = 12;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < count; i++) {
          const t = frame * 0.02 + i * ((Math.PI * 2) / count);
          const px = width / 2 + Math.cos(t * 1.3) * (width * 0.35);
          const py = height / 2 + Math.sin(t * 0.9) * (height * 0.3);
          pts.push({ x: px, y: py });
        }
        ctx.strokeStyle = "rgba(232, 121, 249, 0.25)";
        ctx.lineWidth = 1;
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            if (dist < 80) {
              ctx.beginPath();
              ctx.moveTo(pts[i].x, pts[i].y);
              ctx.lineTo(pts[j].x, pts[j].y);
              ctx.stroke();
            }
          }
        }
        for (const p of pts) {
          ctx.fillStyle = "#e879f9";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    // Clean up when leaving
    window.addEventListener("beforeunload", () => cancelAnimationFrame(animId));
  });
}

renderApp();
