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

renderApp();
