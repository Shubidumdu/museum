import "../style.css";
import {
  ARTWORKS,
  getArtworkTitle,
  getArtworkDescription,
} from "../data/artworks.ts";
import {
  getLanguage,
  toggleLanguage,
  onLanguageChange,
  type Language,
} from "../utils/i18n.ts";

export function setupArtworkViewer(slug: string) {
  const artwork = ARTWORKS.find((a) => a.slug === slug);
  if (!artwork) {
    console.error(`Artwork with slug "${slug}" not found.`);
    return;
  }

  const currentLang = getLanguage();
  document.title = `${getArtworkTitle(artwork, currentLang)} | Shubidumdu Museum`;

  const header = document.createElement("header");
  header.className = "viewer-header";
  header.innerHTML = `
    <a href="/" class="back-btn" id="btnBack" title="${currentLang === "ko" ? "로비로 돌아가기" : "Back to Gallery Lobby"}">
      <span>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left preview-icon"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      </span>
    </a>
    <div class="viewer-controls">
      <button class="action-btn lang-toggle-btn" id="viewerLangToggle" type="button" aria-label="Toggle language" title="${currentLang === "ko" ? "언어 변경" : "Change language"}">
        <span class="lang-opt lang-opt-ko ${currentLang === "ko" ? "active" : ""}">KO</span>
        <span class="lang-divider">/</span>
        <span class="lang-opt lang-opt-en ${currentLang === "en" ? "active" : ""}">EN</span>
      </button>
      <button class="action-btn" id="btnFullscreen" title="${currentLang === "ko" ? "전체화면" : "Toggle Fullscreen"}">
        <span>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-fullscreen preview-icon"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
        </span>
      </button>
    </div>
  `;
  document.body.prepend(header);

  const plaque = document.createElement("aside");
  plaque.className = "docent-plaque";
  plaque.id = "docentPlaque";
  plaque.innerHTML = `
    <div class="plaque-header" id="plaqueHeader">
      <div class="plaque-title-group">
        <h2 id="plaqueTitle">${getArtworkTitle(artwork, currentLang)}</h2>
      </div>
      <button class="plaque-toggle" id="plaqueToggle" title="Collapse/Expand">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down preview-icon"><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </div>
    <div class="plaque-content" id="plaqueContent">
      <p id="plaqueDescription">${getArtworkDescription(artwork, currentLang)}</p>
    </div>
  `;
  document.body.appendChild(plaque);

  const plaqueHeader = document.getElementById("plaqueHeader");
  const plaqueToggle = document.getElementById("plaqueToggle");
  let isCollapsed = false;

  const togglePlaque = () => {
    isCollapsed = !isCollapsed;
    plaque.classList.toggle("collapsed", isCollapsed);
    if (plaqueToggle)
      plaqueToggle.innerHTML = isCollapsed
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up preview-icon"><path d="m18 15-6-6-6 6"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down preview-icon"><path d="m6 9 6 6 6-6"/></svg>`;
  };

  plaqueHeader?.addEventListener("click", togglePlaque);

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

  const viewerLangToggle = document.getElementById("viewerLangToggle");
  viewerLangToggle?.addEventListener("click", () => {
    toggleLanguage();
  });

  const updateViewerLanguage = (lang: Language) => {
    document.title = `${getArtworkTitle(artwork, lang)} | Shubidumdu Museum`;

    const titleEl = document.getElementById("plaqueTitle");
    if (titleEl) {
      titleEl.textContent = getArtworkTitle(artwork, lang);
    }

    const descEl = document.getElementById("plaqueDescription");
    if (descEl) {
      descEl.textContent = getArtworkDescription(artwork, lang);
    }

    const btnBack = document.getElementById("btnBack");
    if (btnBack) {
      btnBack.setAttribute(
        "title",
        lang === "ko" ? "로비로 돌아가기" : "Back to Gallery Lobby",
      );
    }

    const btnFs = document.getElementById("btnFullscreen");
    if (btnFs) {
      btnFs.setAttribute(
        "title",
        lang === "ko" ? "전체화면" : "Toggle Fullscreen",
      );
    }

    if (viewerLangToggle) {
      viewerLangToggle.setAttribute(
        "title",
        lang === "ko" ? "언어 변경" : "Change language",
      );
      const optKo = viewerLangToggle.querySelector(".lang-opt-ko");
      const optEn = viewerLangToggle.querySelector(".lang-opt-en");
      optKo?.classList.toggle("active", lang === "ko");
      optEn?.classList.toggle("active", lang === "en");
    }
  };

  onLanguageChange((lang) => {
    updateViewerLanguage(lang);
  });
}
