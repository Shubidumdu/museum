import "./style.css";
import { ARTWORKS, getArtworkTitle, type Artwork } from "./data/artworks.ts";
import {
  getLanguage,
  toggleLanguage,
  onLanguageChange,
  type Language,
} from "./utils/i18n.ts";

function updateLanguageUI(lang: Language) {
  const sectionLabel = document.getElementById("sectionLabel");
  if (sectionLabel) {
    sectionLabel.textContent = `Artworks (${ARTWORKS.length})`;
  }

  const langToggleBtn = document.getElementById("lobbyLangToggle");
  if (langToggleBtn) {
    langToggleBtn.setAttribute(
      "title",
      lang === "ko" ? "언어 변경" : "Change language",
    );
    const optKo = langToggleBtn.querySelector(".lang-opt-ko");
    const optEn = langToggleBtn.querySelector(".lang-opt-en");
    optKo?.classList.toggle("active", lang === "ko");
    optEn?.classList.toggle("active", lang === "en");
  }

  for (const artwork of ARTWORKS) {
    const titleEl = document.querySelector(
      `[data-artwork-title="${artwork.slug}"]`,
    );
    if (titleEl) {
      titleEl.textContent = getArtworkTitle(artwork, lang);
    }
  }
}

function createCardHtml(artwork: Artwork, lang: Language): string {
  return `
    <a href="/artworks/${artwork.slug}/" class="artwork-card" data-slug="${artwork.slug}">
      <div class="card-preview">
        <canvas class="card-canvas-preview" id="preview-${artwork.slug}" width="400" height="250"></canvas>
      </div>
      <div class="card-body">
        <h3 class="card-title" data-artwork-title="${artwork.slug}">${getArtworkTitle(artwork, lang)}</h3>
      </div>
    </a>
  `;
}

function renderApp() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  const currentLang = getLanguage();

  app.innerHTML = `
    <header class="museum-header">
      <a href="/" class="brand">
        <img src="logo.png" alt="Shubidumdu Studio"/>
      </a>
      <div class="header-controls">
        <button class="action-btn lang-toggle-btn" id="lobbyLangToggle" type="button" aria-label="Toggle language" title="${currentLang === "ko" ? "언어 변경" : "Change language"}">
          <span class="lang-opt lang-opt-ko ${currentLang === "ko" ? "active" : ""}">KO</span>
          <span class="lang-divider">/</span>
          <span class="lang-opt lang-opt-en ${currentLang === "en" ? "active" : ""}">EN</span>
        </button>
      </div>
    </header>

    <main>
      <section class="gallery-section">
        <div class="section-label">
          <span id="sectionLabel">${`Artworks (${ARTWORKS.length})`}</span>
        </div>

        <div class="artwork-grid" id="artworkGrid">
          ${ARTWORKS.map((artwork) => createCardHtml(artwork, currentLang)).join("")}
        </div>
      </section>
    </main>

    <footer class="museum-footer">
      <p>© 2026 Shubidumdu Studio</p>
    </footer>
  `;

  const langToggleBtn = document.getElementById("lobbyLangToggle");
  langToggleBtn?.addEventListener("click", () => {
    toggleLanguage();
  });

  onLanguageChange((lang) => {
    updateLanguageUI(lang);
  });
}

renderApp();
