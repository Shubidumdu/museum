import type { ILoadingScreen } from "@babylonjs/core";

export class CustomLoadingScreen implements ILoadingScreen {
  public loadingUIBackgroundColor: string;
  public loadingUIText: string;

  private loadingDiv: HTMLDivElement | null = null;
  private isFadingOut = false;

  constructor(
    backgroundColor: string = "#d03f2c",
    logoSrc: string = "/logo.png",
  ) {
    this.loadingUIBackgroundColor = backgroundColor;
    this.loadingUIText = "";
    this.createElements(logoSrc);
  }

  private createElements(logoSrc: string): void {
    const overlay = document.createElement("div");
    overlay.className = "custom-loading-screen";
    overlay.style.backgroundColor = this.loadingUIBackgroundColor;

    const logo = document.createElement("img");
    logo.src = logoSrc;
    logo.alt = "Shubidumdu Studio";
    logo.className = "loading-logo";

    overlay.appendChild(logo);
    this.loadingDiv = overlay;
  }

  public displayLoadingUI(): void {
    if (!this.loadingDiv) return;
    this.isFadingOut = false;
    this.loadingDiv.classList.remove("fade-out");
    if (!document.body.contains(this.loadingDiv)) {
      document.body.appendChild(this.loadingDiv);
    }
  }

  public hideLoadingUI(): void {
    if (!this.loadingDiv || this.isFadingOut) return;
    this.isFadingOut = true;
    this.loadingDiv.classList.add("fade-out");

    const onTransitionEnd = () => {
      if (this.loadingDiv && document.body.contains(this.loadingDiv)) {
        this.loadingDiv.removeEventListener("transitionend", onTransitionEnd);
        this.loadingDiv.remove();
      }
      this.isFadingOut = false;
    };

    this.loadingDiv.addEventListener("transitionend", onTransitionEnd);
    setTimeout(onTransitionEnd, 600);
  }
}

