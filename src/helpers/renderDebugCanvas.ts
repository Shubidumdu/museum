import { type BaseTexture, type Scene, type Observer } from "@babylonjs/core";

export type ChannelMode = "rgba" | "r" | "g" | "b" | "a";

export interface RenderDebugCanvasOptions {
  title?: string;
  size?: number;
  channel?: ChannelMode;
  sRGB?: boolean;
  autoUpdate?: boolean;
  initialX?: number;
  initialY?: number;
  scene?: Scene;
  opaqueAlpha?: boolean;
  forceAlphaOne?: boolean;
}

export interface DebugCanvasHandle {
  update: () => Promise<void>;
  dispose: () => void;
  setVisible: (visible: boolean) => void;
  setChannel: (channel: ChannelMode) => void;
  setSRGB: (enabled: boolean) => void;
  setOpaqueAlpha: (enabled: boolean) => void;
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
}

function linearToSRGB(c: number): number {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

function floatToByte(val: number, applySRGB: boolean): number {
  const clamped = Math.max(0, Math.min(1, val));
  const converted = applySRGB ? linearToSRGB(clamped) : clamped;
  return Math.round(converted * 255);
}

function uint8ToByte(byteVal: number, applySRGB: boolean): number {
  if (!applySRGB) return byteVal;
  const norm = byteVal / 255;
  return Math.round(linearToSRGB(norm) * 255);
}

export function renderDebugCanvas(
  texture: BaseTexture,
  options?: RenderDebugCanvasOptions,
): DebugCanvasHandle {
  const size = options?.size ?? 256;
  let currentChannel: ChannelMode = options?.channel ?? "rgba";
  let sRGBEnabled = options?.sRGB ?? false;
  let opaqueAlpha = options?.opaqueAlpha ?? options?.forceAlphaOne ?? false;

  const textureName = texture.name || "Texture";
  const titleText = options?.title ?? `${textureName}`;

  const container = document.createElement("div");
  container.className = "texture-debug-window";
  Object.assign(container.style, {
    position: "fixed",
    zIndex: "9999",
    width: `${size + 16}px`,
    backgroundColor: "#0d1117",
    border: "2px solid #232c3d",
    borderRadius: "10px",
    boxShadow:
      "0 12px 32px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)",
    overflow: "hidden",
    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
    userSelect: "none",
    touchAction: "none",
    transition: "box-shadow 0.2s ease",
  });

  if (options?.initialX !== undefined) {
    container.style.left = `${options.initialX}px`;
  } else {
    container.style.right = "24px";
  }

  if (options?.initialY !== undefined) {
    container.style.top = `${options.initialY}px`;
  } else {
    container.style.top = "24px";
  }

  const header = document.createElement("div");
  header.className = "texture-debug-header";
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    backgroundColor: "#161d2b",
    borderBottom: "1px solid #232c3d",
    cursor: "grab",
    gap: "6px",
  });

  const titleGroup = document.createElement("div");
  Object.assign(titleGroup.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });

  const titleSpan = document.createElement("span");
  titleSpan.textContent = titleText;
  Object.assign(titleSpan.style, {
    color: "#00e5ff",
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "0.5px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  const badgeSpan = document.createElement("span");
  badgeSpan.textContent = `${size}×${size}`;
  Object.assign(badgeSpan.style, {
    color: "#7e8d9f",
    fontSize: "9px",
    backgroundColor: "#0d1117",
    padding: "2px 5px",
    borderRadius: "4px",
    border: "1px solid #232c3d",
  });

  titleGroup.appendChild(titleSpan);
  titleGroup.appendChild(badgeSpan);

  const windowActions = document.createElement("div");
  Object.assign(windowActions.style, {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    flexShrink: "0",
  });

  const collapseBtn = document.createElement("button");
  collapseBtn.textContent = "−";
  collapseBtn.title = "최소화 / 펼치기";
  Object.assign(collapseBtn.style, {
    background: "transparent",
    border: "none",
    color: "#7e8d9f",
    fontSize: "13px",
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: "1",
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.title = "닫기";
  Object.assign(closeBtn.style, {
    background: "transparent",
    border: "none",
    color: "#7e8d9f",
    fontSize: "11px",
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: "1",
  });

  windowActions.appendChild(collapseBtn);
  windowActions.appendChild(closeBtn);

  header.appendChild(titleGroup);
  header.appendChild(windowActions);
  container.appendChild(header);

  const toolbar = document.createElement("div");
  toolbar.className = "texture-debug-toolbar";
  Object.assign(toolbar.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 8px",
    backgroundColor: "#111722",
    borderBottom: "1px solid #1c2433",
    gap: "4px",
  });

  const channelGroup = document.createElement("div");
  Object.assign(channelGroup.style, {
    display: "flex",
    alignItems: "center",
    gap: "3px",
  });

  const channelButtons: { mode: ChannelMode; btn: HTMLButtonElement }[] = [];
  const channels: ChannelMode[] = ["rgba", "r", "g", "b", "a"];

  const updateToolbarButtons = () => {
    channelButtons.forEach(({ mode, btn }) => {
      const isActive = currentChannel === mode;
      btn.style.backgroundColor = isActive ? "#1f6feb" : "#161d2b";
      btn.style.color = isActive ? "#ffffff" : "#8b949e";
      btn.style.borderColor = isActive ? "#388bfd" : "#2a364a";
      btn.style.fontWeight = isActive ? "bold" : "normal";
    });

    srgbBtn.style.backgroundColor = sRGBEnabled ? "#238636" : "#161d2b";
    srgbBtn.style.color = sRGBEnabled ? "#ffffff" : "#8b949e";
    srgbBtn.style.borderColor = sRGBEnabled ? "#2ea043" : "#2a364a";
    srgbBtn.textContent = sRGBEnabled ? "sRGB: ON" : "sRGB: OFF";

    alphaBtn.style.backgroundColor = opaqueAlpha ? "#8957e5" : "#161d2b";
    alphaBtn.style.color = opaqueAlpha ? "#ffffff" : "#8b949e";
    alphaBtn.style.borderColor = opaqueAlpha ? "#a371f7" : "#2a364a";
    alphaBtn.textContent = opaqueAlpha ? "A: 1.0" : "A: Raw";
  };

  channels.forEach((mode) => {
    const btn = document.createElement("button");
    btn.textContent = mode.toUpperCase();
    btn.title =
      mode === "rgba"
        ? "RGBA 전체 컬러 표시"
        : `${mode.toUpperCase()} 채널 단독 표시 (Grayscale)`;
    Object.assign(btn.style, {
      border: "1px solid #2a364a",
      borderRadius: "4px",
      fontSize: "9px",
      padding: "2px 5px",
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "all 0.15s ease",
    });

    btn.addEventListener("click", () => {
      currentChannel = mode;
      updateToolbarButtons();
      renderCachedPixels();
    });

    channelGroup.appendChild(btn);
    channelButtons.push({ mode, btn });
  });

  const alphaBtn = document.createElement("button");
  alphaBtn.title = "알파(A) 채널을 1.0(불투명)으로 고정 전환 (ON / OFF)";
  Object.assign(alphaBtn.style, {
    border: "1px solid #2a364a",
    borderRadius: "4px",
    fontSize: "9px",
    padding: "2px 6px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s ease",
  });

  alphaBtn.addEventListener("click", () => {
    opaqueAlpha = !opaqueAlpha;
    updateToolbarButtons();
    renderCachedPixels();
  });

  const srgbBtn = document.createElement("button");
  srgbBtn.title = "sRGB 감마 보정 전환 (ON / OFF)";
  Object.assign(srgbBtn.style, {
    border: "1px solid #2a364a",
    borderRadius: "4px",
    fontSize: "9px",
    padding: "2px 6px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s ease",
  });

  srgbBtn.addEventListener("click", () => {
    sRGBEnabled = !sRGBEnabled;
    updateToolbarButtons();
    renderCachedPixels();
  });

  const toggleGroup = document.createElement("div");
  Object.assign(toggleGroup.style, {
    display: "flex",
    alignItems: "center",
    gap: "3px",
  });
  toggleGroup.appendChild(alphaBtn);
  toggleGroup.appendChild(srgbBtn);

  toolbar.appendChild(channelGroup);
  toolbar.appendChild(toggleGroup);
  container.appendChild(toolbar);

  const body = document.createElement("div");
  body.className = "texture-debug-body";
  Object.assign(body.style, {
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  Object.assign(canvas.style, {
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: "#0b0f17",
    backgroundImage: `
      linear-gradient(45deg, #161d2b 25%, transparent 25%),
      linear-gradient(-45deg, #161d2b 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #161d2b 75%),
      linear-gradient(-45deg, transparent 75%, #161d2b 75%)
    `,
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
    borderRadius: "6px",
    border: "1px solid #1c2433",
    imageRendering: "pixelated",
    display: "block",
  });

  body.appendChild(canvas);
  container.appendChild(body);

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  header.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;

    isDragging = true;
    header.setPointerCapture(e.pointerId);
    header.style.cursor = "grabbing";

    const rect = container.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    container.style.right = "auto";
    container.style.bottom = "auto";
    container.style.left = `${initialLeft}px`;
    container.style.top = `${initialTop}px`;
  });

  header.addEventListener("pointermove", (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    let nextLeft = initialLeft + deltaX;
    let nextTop = initialTop + deltaY;

    const maxLeft = Math.max(0, window.innerWidth - container.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - container.offsetHeight);

    nextLeft = Math.max(0, Math.min(maxLeft, nextLeft));
    nextTop = Math.max(0, Math.min(maxTop, nextTop));

    container.style.left = `${nextLeft}px`;
    container.style.top = `${nextTop}px`;
  });

  const stopDrag = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      try {
        header.releasePointerCapture(e.pointerId);
      } catch {
      }
      header.style.cursor = "grab";
    }
  };

  header.addEventListener("pointerup", stopDrag);
  header.addEventListener("pointercancel", stopDrag);

  let isCollapsed = false;
  collapseBtn.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    body.style.display = isCollapsed ? "none" : "flex";
    toolbar.style.display = isCollapsed ? "none" : "flex";
    collapseBtn.textContent = isCollapsed ? "+" : "−";
  });

  let cachedImageData: ImageData | null = null;
  let lastPixelBuffer: ArrayBufferView | null = null;
  const ctx = canvas.getContext("2d");

  const processAndDrawPixels = (pixelBuffer: ArrayBufferView) => {
    if (!ctx) return;
    const totalPixels = size * size;

    if (
      !cachedImageData ||
      cachedImageData.width !== size ||
      cachedImageData.height !== size
    ) {
      cachedImageData = ctx.createImageData(size, size);
    }
    const imgData = cachedImageData;

    if (pixelBuffer instanceof Float32Array) {
      const floatData = pixelBuffer;
      const numChannels = floatData.length >= totalPixels * 4 ? 4 : 1;

      for (let i = 0; i < totalPixels; i++) {
        const px = i * 4;
        const rRaw = numChannels >= 1 ? floatData[i * numChannels + 0] : 0;
        const gRaw = numChannels >= 2 ? floatData[i * numChannels + 1] : 0;
        const bRaw = numChannels >= 3 ? floatData[i * numChannels + 2] : 0;
        const aRaw = numChannels >= 4 ? floatData[i * numChannels + 3] : 1;

        if (currentChannel === "rgba") {
          imgData.data[px + 0] = floatToByte(rRaw, sRGBEnabled);
          imgData.data[px + 1] = floatToByte(gRaw, sRGBEnabled);
          imgData.data[px + 2] = floatToByte(bRaw, sRGBEnabled);
          imgData.data[px + 3] = opaqueAlpha ? 255 : floatToByte(aRaw, false);
        } else if (currentChannel === "r") {
          const v = floatToByte(rRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        } else if (currentChannel === "g") {
          const v = floatToByte(gRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        } else if (currentChannel === "b") {
          const v = floatToByte(bRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        } else if (currentChannel === "a") {
          const v = floatToByte(aRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        }
      }
    } else if (
      pixelBuffer instanceof Uint8Array ||
      pixelBuffer instanceof Uint8ClampedArray
    ) {
      const byteData = pixelBuffer;
      const numChannels = byteData.length >= totalPixels * 4 ? 4 : 1;

      for (let i = 0; i < totalPixels; i++) {
        const px = i * 4;
        const rRaw = numChannels >= 1 ? byteData[i * numChannels + 0] : 0;
        const gRaw = numChannels >= 2 ? byteData[i * numChannels + 1] : 0;
        const bRaw = numChannels >= 3 ? byteData[i * numChannels + 2] : 0;
        const aRaw = numChannels >= 4 ? byteData[i * numChannels + 3] : 255;

        if (currentChannel === "rgba") {
          imgData.data[px + 0] = uint8ToByte(rRaw, sRGBEnabled);
          imgData.data[px + 1] = uint8ToByte(gRaw, sRGBEnabled);
          imgData.data[px + 2] = uint8ToByte(bRaw, sRGBEnabled);
          imgData.data[px + 3] = opaqueAlpha ? 255 : aRaw;
        } else if (currentChannel === "r") {
          const v = uint8ToByte(rRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        } else if (currentChannel === "g") {
          const v = uint8ToByte(gRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        } else if (currentChannel === "b") {
          const v = uint8ToByte(bRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        } else if (currentChannel === "a") {
          const v = uint8ToByte(aRaw, sRGBEnabled);
          imgData.data[px + 0] = v;
          imgData.data[px + 1] = v;
          imgData.data[px + 2] = v;
          imgData.data[px + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  const renderCachedPixels = () => {
    if (lastPixelBuffer) {
      processAndDrawPixels(lastPixelBuffer);
    }
  };

  let isUpdating = false;

  const update = async (): Promise<void> => {
    if (isUpdating || !ctx || isCollapsed) return;
    isUpdating = true;

    try {
      const pixelBuffer = await texture.readPixels();
      if (!pixelBuffer) return;

      lastPixelBuffer = pixelBuffer;
      processAndDrawPixels(pixelBuffer);
    } catch (err) {
      console.warn("[renderDebugCanvas] Texture readback error:", err);
    } finally {
      isUpdating = false;
    }
  };

  updateToolbarButtons();

  let renderObserver: Observer<Scene> | null = null;
  const targetScene = options?.scene ?? texture.getScene();

  if (targetScene && options?.autoUpdate !== false) {
    renderObserver = targetScene.onAfterRenderObservable.add(() => {
      void update();
    });
  }

  document.body.appendChild(container);

  const dispose = () => {
    if (renderObserver && targetScene) {
      targetScene.onAfterRenderObservable.remove(renderObserver);
      renderObserver = null;
    }
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  };

  closeBtn.addEventListener("click", () => {
    dispose();
  });

  const setVisible = (visible: boolean) => {
    container.style.display = visible ? "block" : "none";
  };

  const setChannel = (channel: ChannelMode) => {
    currentChannel = channel;
    updateToolbarButtons();
    renderCachedPixels();
  };

  const setSRGB = (enabled: boolean) => {
    sRGBEnabled = enabled;
    updateToolbarButtons();
    renderCachedPixels();
  };

  const setOpaqueAlpha = (enabled: boolean) => {
    opaqueAlpha = enabled;
    updateToolbarButtons();
    renderCachedPixels();
  };

  return {
    update,
    dispose,
    setVisible,
    setChannel,
    setSRGB,
    setOpaqueAlpha,
    container,
    canvas,
  };
}
