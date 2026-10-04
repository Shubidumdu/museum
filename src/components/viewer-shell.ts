import "../style.css";
import { ARTWORKS } from "../data/artworks.ts";

export function setupArtworkViewer(slug: string) {
  const artwork = ARTWORKS.find((a) => a.slug === slug);
  if (!artwork) {
    console.error(`Artwork with slug "${slug}" not found.`);
    return;
  }

  document.title = `${artwork.title} | Shubidumdu Museum`;

  // Header
  const header = document.createElement("header");
  header.className = "viewer-header";
  header.innerHTML = `
    <a href="/" class="back-btn" title="Back to Gallery Lobby">
      <span>←</span>
    </a>
    <div class="viewer-controls">
      <button class="action-btn" id="btnFullscreen" title="Toggle Fullscreen">
        <span>⛶</span>
      </button>
    </div>
  `;
  document.body.prepend(header);

  // Plaque
  const plaque = document.createElement("aside");
  plaque.className = "docent-plaque";
  plaque.id = "docentPlaque";
  plaque.innerHTML = `
    <div class="plaque-header" id="plaqueHeader">
      <div class="plaque-title-group">
        <h2>${artwork.title}</h2>
      </div>
      <button class="plaque-toggle" id="plaqueToggle" title="Collapse/Expand">▾</button>
    </div>
    <div class="plaque-content" id="plaqueContent">
      <p>${artwork.description}</p>
    </div>
  `;
  document.body.appendChild(plaque);

  // Interactions
  const plaqueHeader = document.getElementById("plaqueHeader");
  const plaqueToggle = document.getElementById("plaqueToggle");
  let isCollapsed = false;

  const togglePlaque = () => {
    isCollapsed = !isCollapsed;
    plaque.classList.toggle("collapsed", isCollapsed);
    if (plaqueToggle) plaqueToggle.textContent = isCollapsed ? "▴" : "▾";
  };

  plaqueHeader?.addEventListener("click", togglePlaque);

  // Fullscreen
  const btnFullscreen = document.getElementById("btnFullscreen");
  btnFullscreen?.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .catch((err) => console.warn(err));
    } else {
      document.exitFullscreen().catch((err) => console.warn(err));
    }
  });
}
