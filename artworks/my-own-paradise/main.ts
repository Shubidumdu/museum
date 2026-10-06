/**
 * ============================================================================
 * [My Own Paradise - WebGPU FFT Ocean Artwork]
 *
 * 4단계: 지오메트리 변위 (Vertex Processing)
 *  - displacementTexture를 버텍스 셰이더에서 샘플링하여 수직 높이 변위 적용.
 *  - uvScale을 적용하여 고화질 타일링 패턴 구성.
 *
 * 5단계: 노멀 매핑 (Normal Mapping)
 *  - slopeXTexture와 slopeZTexture를 픽셀 셰이더에서 샘플링하여
 *    표면 법선 벡터(N = normalize(-slopeX * slopeScale, 1.0, -slopeZ * slopeScale))를 복원 및 노멀 매핑 적용.
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
  MeshBuilder,
  Effect,
  ShaderMaterial,
} from "@babylonjs/core";
import { setupArtworkViewer } from "../../src/components/viewer-shell.ts";
import { FFTOcean } from "./FFTOcean.ts";
import { renderDebugCanvas } from "../../src/helpers/renderDebugCanvas.ts";
import oceanVertexShader from "./ocean_vertex.glsl?raw";
import oceanFragmentShader from "./ocean_fragment.glsl?raw";

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

  // Mac Retina 디스플레이 등 High-DPI 물리 픽셀 1:1 선명도 활성화
  engine.setHardwareScalingLevel(1 / window.devicePixelRatio);

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
  sunLight.diffuse = new Color3(1.5, 1.5, 1.5);

  // 3. 바다 평면 메시
  const meshSize = 140;
  const oceanMesh = MeshBuilder.CreateGround(
    "oceanPlane",
    {
      width: meshSize,
      height: meshSize,
      updatable: true,
      subdivisions: 256, // 버텍스 셰이더 변위를 위한 정밀 격자
    },
    scene,
  );

  // 4. FFT 해양 시뮬레이터 초기화 (N=256, domainLength L=256)
  const ocean = new FFTOcean(scene, engine, {
    gridSize: 256,
    domainLength: 256,
    windDirection: new Vector2(1, 0),
    amplitude: 120,
    windSpeed: 600,
  });

  // --------------------------------------------------------------------------
  // [displacementTexture 변위 & slopeX/ZTexture 노멀 매핑 셰이더]
  // --------------------------------------------------------------------------
  Effect.ShadersStore["oceanVertexShader"] = oceanVertexShader;
  Effect.ShadersStore["oceanFragmentShader"] = oceanFragmentShader;

  const oceanMaterial = new ShaderMaterial(
    "oceanShader",
    scene,
    {
      vertex: "ocean",
      fragment: "ocean",
    },
    {
      attributes: ["position", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uvScale",
        "domainLength",
        "meshSize",
        "cameraPosition",
        "sunDirection",
        "sunColor",
      ],
      samplers: ["displacementMap", "slopeXMap", "slopeZMap"],
    },
  );

  // 4.0: 4x4 타일링 (16개 타일)으로 텍셀 밀도를 대폭 올려 선명한 디테일 생성
  const uvScale = 5.0;

  oceanMaterial.backFaceCulling = false;
  oceanMaterial.setTexture("displacementMap", ocean.displacementTexture);
  oceanMaterial.setTexture("slopeXMap", ocean.slopeXTexture);
  oceanMaterial.setTexture("slopeZMap", ocean.slopeZTexture);
  oceanMaterial.setFloat("uvScale", uvScale);
  oceanMaterial.setFloat("domainLength", ocean.L);
  oceanMaterial.setFloat("meshSize", meshSize);
  oceanMaterial.setVector3(
    "sunDirection",
    sunLight.direction.scale(-1).normalize(),
  );
  oceanMaterial.setColor3("sunColor", sunLight.diffuse);
  oceanMaterial.setVector3("cameraPosition", camera.position);

  oceanMesh.material = oceanMaterial;

  // 실시간 텍스처 디버거 호출 (드래그 가능한 플로팅 오버레이 캔버스)
  renderDebugCanvas(ocean.displacementTexture, {
    title: "Ocean Displacement (Height)",
    size: 256,
  });
  renderDebugCanvas(ocean.slopeXTexture, {
    title: "Ocean Slope X (dH/dx)",
    size: 256,
    initialX: 24,
    initialY: 24,
  });
  renderDebugCanvas(ocean.slopeZTexture, {
    title: "Ocean Slope Z (dH/dz)",
    size: 256,
    initialX: 24,
    initialY: 340,
  });

  // 매 프레임 시간 전파 및 IFFT 연산 수행
  let t = 0;

  scene.onBeforeRenderObservable.add(() => {
    t += engine.getDeltaTime() * 0.01;
    ocean.update(t);
    oceanMaterial.setVector3("cameraPosition", camera.position);
  });

  // ShowInspector(scene);

  return scene;
}

// 앱 실행
initializeOceanApp();
