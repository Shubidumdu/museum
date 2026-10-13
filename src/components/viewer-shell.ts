import "../style.css";
import {
  ARTWORKS,
  getArtworkTitle,
  getArtworkDescription,
  type ArtworkCredit,
} from "../data/artworks.ts";
import {
  getLanguage,
  toggleLanguage,
  onLanguageChange,
  type Language,
} from "../utils/i18n.ts";

export interface ViewerOptions {
  audioUrl?: string;
  audioVolume?: number;
}

const volumeOnSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-2 preview-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const volumeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-x preview-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>`;
const eyeOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off preview-icon"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.42-5.58"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;
const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye preview-icon"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;

function getLicenseUrl(
  license: string,
  customUrl?: string,
): string | undefined {
  if (customUrl) return customUrl;
  const normalized = license.trim().toLowerCase();
  if (normalized.includes("cc by-sa"))
    return "https://creativecommons.org/licenses/by-sa/4.0/";
  if (normalized.includes("cc by-nc-nd"))
    return "https://creativecommons.org/licenses/by-nc-nd/4.0/";
  if (normalized.includes("cc by-nc-sa"))
    return "https://creativecommons.org/licenses/by-nc-sa/4.0/";
  if (normalized.includes("cc by-nc"))
    return "https://creativecommons.org/licenses/by-nc/4.0/";
  if (normalized.includes("cc by-nd"))
    return "https://creativecommons.org/licenses/by-nd/4.0/";
  if (normalized.includes("cc by") || normalized === "cc-by")
    return "https://creativecommons.org/licenses/by/4.0/";
  if (normalized === "cc0" || normalized.includes("public domain"))
    return "https://creativecommons.org/publicdomain/zero/1.0/";
  return undefined;
}

function renderCreditItem(credit: ArtworkCredit): string {
  if (credit.text) {
    return `<li class="plaque-credit-item">${credit.text}</li>`;
  }

  const assetPrefix = credit.assetName
    ? `<span class="plaque-credit-asset">[${credit.assetName}]</span> `
    : "";

  const titlePart = credit.sourceTitle
    ? credit.sourceUrl
      ? `<a href="${credit.sourceUrl}" target="_blank" rel="noopener noreferrer">"${credit.sourceTitle}"</a>`
      : `"${credit.sourceTitle}"`
    : "";

  const authorPart = credit.authorUrl
    ? `<a href="${credit.authorUrl}" target="_blank" rel="noopener noreferrer">${credit.author}</a>`
    : credit.author;

  const byPart = titlePart ? ` by ${authorPart}` : authorPart;

  const licenseUrl = getLicenseUrl(credit.license, credit.licenseUrl);
  const licenseLink = licenseUrl
    ? `<a href="${licenseUrl}" target="_blank" rel="noopener noreferrer">${credit.license}</a>`
    : credit.license;

  const licensePart = `<span class="plaque-credit-license">${licenseLink}</span>`;

  return `<li class="plaque-credit-item">${assetPrefix}${titlePart}${byPart} ${licensePart}</li>`;
}

function renderCreditsHtml(
  credits: ArtworkCredit[] | undefined,
  lang: Language,
): string {
  if (!credits || credits.length === 0) return "";
  const label = lang === "ko" ? "크레딧" : "Credits";
  return `
    <div class="plaque-credits" id="plaqueCredits">
      <span class="plaque-credits-label">${label}</span>
      <ul class="plaque-credits-list">
        ${credits.map((c) => renderCreditItem(c)).join("")}
      </ul>
    </div>
  `;
}

export function setupArtworkViewer(slug: string, options?: ViewerOptions) {
  const artwork = ARTWORKS.find((a) => a.slug === slug);
  if (!artwork) {
    console.error(`Artwork with slug "${slug}" not found.`);
    return;
  }

  const currentLang = getLanguage();
  document.title = `${getArtworkTitle(artwork, currentLang)} | Shubidumdu Museum`;

  let isAudioPlaying = false;
  let ambientAudio: HTMLAudioElement | null = null;

  if (options?.audioUrl) {
    ambientAudio = new Audio(options.audioUrl);
    ambientAudio.loop = true;
    ambientAudio.volume = options.audioVolume ?? 0.5;

    const tryAutoPlay = () => {
      if (!ambientAudio) return;
      ambientAudio
        .play()
        .then(() => {
          isAudioPlaying = true;
          updateAudioButtonUI(getLanguage());
        })
        .catch(() => {
          isAudioPlaying = false;
          updateAudioButtonUI(getLanguage());

          const unlock = () => {
            if (ambientAudio && !isAudioPlaying) {
              ambientAudio
                .play()
                .then(() => {
                  isAudioPlaying = true;
                  updateAudioButtonUI(getLanguage());
                })
                .catch(() => {});
            }
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
          };
          window.addEventListener("pointerdown", unlock, { once: true });
          window.addEventListener("keydown", unlock, { once: true });
        });
    };

    tryAutoPlay();
  }

  const audioButtonHtml = options?.audioUrl
    ? `
      <button class="action-btn" id="btnAudio" title="${currentLang === "ko" ? "소리 끄기" : "Mute"}">
        <span id="btnAudioIcon">${volumeOnSvg}</span>
      </button>
    `
    : "";

  const header = document.createElement("header");
  header.className = "viewer-header";
  header.innerHTML = `
    <a href="/" class="back-btn" id="btnBack" title="${currentLang === "ko" ? "돌아가기" : "Back"}">
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
      ${audioButtonHtml}
      <button class="action-btn" id="btnToggleUI" title="${currentLang === "ko" ? "UI 숨기기 (단축키: H 또는 ESC)" : "Hide UI (Shortcut: H or ESC)"}">
        <span>${eyeOffSvg}</span>
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
      ${renderCreditsHtml(artwork.credits, currentLang)}
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

  const restoreBtn = document.createElement("button");
  restoreBtn.className = "action-btn restore-ui-btn";
  restoreBtn.id = "btnRestoreUI";
  restoreBtn.type = "button";
  restoreBtn.setAttribute(
    "title",
    currentLang === "ko" ? "UI 다시 표시 (H / ESC)" : "Show UI (H / ESC)",
  );
  restoreBtn.innerHTML = `
    <span>${eyeSvg}</span>
    <span id="restoreUiLabel">${currentLang === "ko" ? "UI 표시" : "Show UI"}</span>
  `;
  document.body.appendChild(restoreBtn);

  let isUIHidden = false;
  let restoreTimer: number | null = null;

  const setUIHidden = (hidden: boolean) => {
    isUIHidden = hidden;
    document.body.classList.toggle("ui-hidden", hidden);

    if (hidden) {
      restoreBtn.classList.add("visible");
      resetRestoreTimer();
    } else {
      restoreBtn.classList.remove("visible");
      if (restoreTimer !== null) {
        window.clearTimeout(restoreTimer);
        restoreTimer = null;
      }
    }
  };

  const resetRestoreTimer = () => {
    if (restoreTimer !== null) {
      window.clearTimeout(restoreTimer);
    }
    restoreBtn.classList.add("visible");
    restoreTimer = window.setTimeout(() => {
      restoreBtn.classList.remove("visible");
    }, 2500);
  };

  window.addEventListener("pointermove", () => {
    if (isUIHidden) {
      resetRestoreTimer();
    }
  });

  const btnToggleUI = document.getElementById("btnToggleUI");
  btnToggleUI?.addEventListener("click", () => {
    setUIHidden(true);
  });

  restoreBtn.addEventListener("click", () => {
    setUIHidden(false);
  });

  window.addEventListener("keydown", (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (e.key === "h" || e.key === "H") {
      setUIHidden(!isUIHidden);
    } else if (e.key === "Escape" && isUIHidden) {
      setUIHidden(false);
    }
  });

  function updateAudioButtonUI(lang: Language) {
    const btnAudio = document.getElementById("btnAudio");
    const iconSpan = document.getElementById("btnAudioIcon");
    if (!btnAudio || !iconSpan) return;

    btnAudio.setAttribute(
      "title",
      isAudioPlaying
        ? lang === "ko"
          ? "소리 끄기"
          : "Mute"
        : lang === "ko"
          ? "소리 켜기"
          : "Unmute",
    );
    iconSpan.innerHTML = isAudioPlaying ? volumeOnSvg : volumeOffSvg;
  }

  const btnAudio = document.getElementById("btnAudio");
  btnAudio?.addEventListener("click", () => {
    if (!ambientAudio) return;
    if (isAudioPlaying) {
      ambientAudio.pause();
      isAudioPlaying = false;
    } else {
      ambientAudio
        .play()
        .then(() => {
          isAudioPlaying = true;
          updateAudioButtonUI(getLanguage());
        })
        .catch(() => {});
    }
    updateAudioButtonUI(getLanguage());
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

    const creditsLabel = document.querySelector(
      "#plaqueCredits .plaque-credits-label",
    );
    if (creditsLabel) {
      creditsLabel.textContent = lang === "ko" ? "크레딧" : "Credits";
    }

    const btnBack = document.getElementById("btnBack");
    if (btnBack) {
      btnBack.setAttribute("title", lang === "ko" ? "돌아가기" : "Back");
    }

    const btnFs = document.getElementById("btnFullscreen");
    if (btnFs) {
      btnFs.setAttribute(
        "title",
        lang === "ko" ? "전체화면" : "Toggle Fullscreen",
      );
    }

    const btnToggleUI = document.getElementById("btnToggleUI");
    if (btnToggleUI) {
      btnToggleUI.setAttribute(
        "title",
        lang === "ko"
          ? "UI 숨기기 (단축키: H 또는 ESC)"
          : "Hide UI (Shortcut: H or ESC)",
      );
    }

    if (restoreBtn) {
      restoreBtn.setAttribute(
        "title",
        lang === "ko" ? "UI 다시 표시 (H / ESC)" : "Show UI (H / ESC)",
      );
    }

    const restoreUiLabel = document.getElementById("restoreUiLabel");
    if (restoreUiLabel) {
      restoreUiLabel.textContent = lang === "ko" ? "UI 표시" : "Show UI";
    }

    updateAudioButtonUI(lang);

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

export interface WebGPUFallbackOptions {
  customMessage?: {
    ko: string;
    en: string;
  };
}

export function showWebGPUFallback(options?: WebGPUFallbackOptions) {
  const existing = document.getElementById("webgpuFallbackOverlay");
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.className = "webgpu-fallback-overlay";
  overlay.id = "webgpuFallbackOverlay";

  const getNoticeContent = (lang: Language) => {
    if (lang === "ko") {
      return {
        badge: "WebGPU 지원 필요",
        title: "이 기기에서는 WebGPU를 사용할 수 없습니다",
        desc:
          options?.customMessage?.ko ??
          `본 아트워크는 실시간 3D 그래픽 및 연산을 위해 WebGPU 기술을 필요로 합니다.
현재 접속하신 브라우저 또는 디바이스 환경에서 WebGPU가 지원되지 않아 작품을 렌더링할 수 없습니다.

최신 버전의 Chrome, Edge 등 WebGPU를 지원하는 브라우저 환경에서 관람해 주시기 바랍니다.`,
        btnText: "돌아가기",
      };
    }
    return {
      badge: "WebGPU Required",
      title: "WebGPU is not supported on this device",
      desc:
        options?.customMessage?.en ??
        `This artwork requires WebGPU for real-time 3D graphics and compute rendering.
It cannot be displayed because your current browser or device environment does not support WebGPU.

Please open this artwork in a browser that supports WebGPU, such as the latest Chrome or Edge.`,
      btnText: "Return",
    };
  };

  const currentLang = getLanguage();
  const content = getNoticeContent(currentLang);

  overlay.innerHTML = `
    <div class="webgpu-fallback-card" role="alert">
      <div class="webgpu-fallback-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
      </div>
      <span class="webgpu-fallback-badge" id="fallbackBadge">${content.badge}</span>
      <h2 class="webgpu-fallback-title" id="fallbackTitle">${content.title}</h2>
      <p class="webgpu-fallback-desc" id="fallbackDesc">${content.desc}</p>
      <a href="${import.meta.env.BASE_URL}" class="webgpu-fallback-btn" id="fallbackBtn">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left preview-icon"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
      </a>
    </div>
  `;

  document.body.appendChild(overlay);

  const plaque = document.getElementById("docentPlaque");
  if (plaque) {
    plaque.classList.add("collapsed");
  }

  onLanguageChange((lang) => {
    const updated = getNoticeContent(lang);
    const badgeEl = document.getElementById("fallbackBadge");
    const titleEl = document.getElementById("fallbackTitle");
    const descEl = document.getElementById("fallbackDesc");
    const btnEl = document.getElementById("fallbackBtn");

    if (badgeEl) badgeEl.textContent = updated.badge;
    if (titleEl) titleEl.textContent = updated.title;
    if (descEl) descEl.textContent = updated.desc;
    if (btnEl) btnEl.textContent = updated.btnText;
  });
}
