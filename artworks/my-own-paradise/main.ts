/**
 * ============================================================================
 * [My Own Paradise - WebGPU FFT Ocean Artwork]
 *
 * 4단계: 지오메트리 변위 (Vertex Processing)
 *  - 세분화된 Water Grid에서 Displacement Map(dx, dy, dz)을 샘플링하여
 *    파도 꼭대기는 뾰족하고 골짜기는 완만한 거스너 형상 구현.
 *  - 듀얼 캐스케이드(Cascade Tiling)를 통해 거대한 너울과 미세 물결을 중첩.
 *
 * 5단계: 수면 광학 및 셰이딩 (Pixel Shading)
 *  - 저주파 기하 노멀과 고주파 텍스처 노멀 블렌딩.
 *  - Schlick Fresnel 반사/굴절 모델.
 *  - Beer-Lambert 법칙 기반 수심별 빛 감쇄 및 서브서피스 스캐터링(SSS).
 *  - 자코비안(Jacobian) 행렬식 기반 포말(Foam) 합성.
 * ============================================================================
 */

import {
  Engine,
  WebGPUEngine,
  type AbstractEngine,
  Scene,
  Vector2,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  Effect,
  ShaderMaterial,
} from "@babylonjs/core";
import { setupArtworkViewer } from "../../src/components/viewer-shell.ts";
import { FFTOcean } from "./FFTOcean.ts";

// 공통 뷰어 셸 (헤더, 도슨트 명판, 전체화면 버튼)
setupArtworkViewer("my-own-paradise");

const canvas = document.getElementById("artworkCanvas") as HTMLCanvasElement;
const debugCanvas = document.getElementById("debug") as HTMLCanvasElement;

/**
 * WebGPU 우선 초기화 함수
 * 브라우저가 WebGPU를 지원하면 WebGPUEngine을 활성화하고,
 * 미지원 환경일 경우 표준 Engine(WebGL2)으로 안전하게 폴백합니다.
 */
async function initializeOceanApp() {
  let engine: AbstractEngine;

  const isWebGPUSupported =
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    (await WebGPUEngine.IsSupportedAsync);

  if (isWebGPUSupported) {
    console.info("⚡ WebGPUEngine enabled for FFT Ocean!");
    const webgpuEngine = new WebGPUEngine(canvas, {
      antialias: true,
      powerPreference: "high-performance",
    });
    await webgpuEngine.initAsync();
    engine = webgpuEngine;
  } else {
    console.warn("⚠️ WebGPU not available, falling back to WebGL2 Engine.");
    engine = new Engine(canvas, true);
  }

  const scene = createFFTOceanScene(engine, canvas);

  // 렌더 루프 및 리사이즈 처리
  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    engine.resize();
  });
}

export function createFFTOceanScene(
  engine: AbstractEngine,
  canvas: HTMLCanvasElement,
): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.08, 0.14, 1.0);

  // 1. 카메라 설정 (Orbit 컨트롤)
  const camera = new ArcRotateCamera(
    "Camera",
    -Math.PI / 3,
    Math.PI / 3.4,
    55,
    new Vector3(0, 0, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 25;
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 200;

  // 2. 조명 설정 (태양광 및 대기 환경광)
  const sunLight = new DirectionalLight(
    "sunLight",
    new Vector3(-0.6, -0.7, 0.4).normalize(),
    scene,
  );
  sunLight.intensity = 1.6;
  sunLight.diffuse = new Color3(1.0, 0.92, 0.8);

  const hemiLight = new HemisphericLight(
    "hemiLight",
    new Vector3(0, 1, 0),
    scene,
  );
  hemiLight.intensity = 0.45;
  hemiLight.groundColor = new Color3(0.02, 0.05, 0.1);

  const oceanMesh = MeshBuilder.CreateGround(
    "oceanPlane",
    {
      width: 140,
      height: 140,
      subdivisions: 200, // 버텍스 셰이더 변위를 위한 정밀 격자
    },
    scene,
  );

  const ocean = new FFTOcean(scene, engine, {
    gridSize: 256,
    domainLength: 1000,
    windDirection: new Vector2(1, 1),
    amplitude: 1,
    windSpeed: 31,
  });

  // For Debug

  let t = 0;

  scene.onBeforeRenderObservable.add(() => {
    t += 0.016;
    ocean.updateSpectrum(t);
    renderSpectrumDebug(debugCanvas, ocean.N, ocean.hReal, ocean.hImag);
  });

  return scene;
}

function renderSpectrumDebug(
  canvas: HTMLCanvasElement,
  N: number,
  h_real: Float32Array,
  h_imag: Float32Array,
) {
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(N, N);

  for (let i = 0; i < N * N; i++) {
    const re = h_real[i];
    const im = h_imag[i];

    // 1. 진폭(에너지 크기)
    const mag = Math.hypot(re, im);

    // 2. 위상각(-PI ~ PI)을 0 ~ 255 밝기로 매핑 (파도가 도는 모습 관찰용)
    const phase = Math.atan2(im, re); // -PI ~ PI
    const phaseColor = Math.floor(((phase + Math.PI) / (2 * Math.PI)) * 255);

    // 3. 진폭 가중치 적용
    const brightness = Math.min(255, Math.floor(mag * 50));

    const px = i * 4;
    imgData.data[px] = phaseColor; // R: 회전하는 위상 각도
    imgData.data[px + 1] = brightness; // G: 에너지 크기
    imgData.data[px + 2] = 128; // B
    imgData.data[px + 3] = 255; // Alpha
  }

  ctx.putImageData(imgData, 0, 0);
}

// 앱 실행
initializeOceanApp();
