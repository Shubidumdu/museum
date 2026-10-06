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
  WebGPUEngine,
  Scene,
  Vector2,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
} from "@babylonjs/core";
import { setupArtworkViewer } from "../../src/components/viewer-shell.ts";
import { FFTOcean } from "./FFTOcean.ts";
import { renderDebugCanvas } from "../../src/helpers/renderDebugCanvas.ts";

// 공통 뷰어 셸 (헤더, 도슨트 명판, 전체화면 버튼)
setupArtworkViewer("my-own-paradise");

const canvas = document.getElementById("artworkCanvas") as HTMLCanvasElement;

/**
 * WebGPU 초기화 함수
 * WebGPU Compute Shader를 활용하여 FFT 해양 시뮬레이션을 수행합니다.
 */
async function initializeOceanApp() {
  const isWebGPUSupported =
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    (await WebGPUEngine.IsSupportedAsync);

  if (!isWebGPUSupported) {
    console.error(
      "⚠️ WebGPU not available. WebGPU is required for FFT Ocean simulation.",
    );
    return;
  }

  console.info("⚡ WebGPUEngine enabled for FFT Ocean!");
  const engine = new WebGPUEngine(canvas, {
    antialias: true,
    powerPreference: "high-performance",
  });
  await engine.initAsync();

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
  engine: WebGPUEngine,
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
      updatable: true,
      subdivisions: 200, // 버텍스 셰이더 변위를 위한 정밀 격자
    },
    scene,
  );

  const ocean = new FFTOcean(scene, engine, {
    gridSize: 256,
    domainLength: 256,
    windDirection: new Vector2(1, 0),
    amplitude: 1000,
    windSpeed: 100,
  });

  // 실시간 텍스처 디버거 호출 (드래그 가능한 플로팅 오버레이 캔버스)
  renderDebugCanvas(ocean.displacementTexture, {
    title: "Ocean Displacement (2D IFFT)",
    size: 256,
  });
  renderDebugCanvas(ocean.slopeXTexture, {
    title: "Ocean Displacement (2D IFFT)",
    size: 256,
  });
  renderDebugCanvas(ocean.slopeZTexture, {
    title: "Ocean Displacement (2D IFFT)",
    size: 256,
  });

  // 매 프레임 시간 전파 및 IFFT 연산 수행
  let t = 0;

  scene.onBeforeRenderObservable.add(() => {
    t += engine.getDeltaTime() * 0.001;
    ocean.update(t);
  });

  return scene;
}

// 앱 실행
initializeOceanApp();
