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
  PostProcess,
  Constants,
  Texture,
  TransformNode,
  SceneLoader,
  DracoCompression,
  Scalar,
} from "@babylonjs/core";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/loaders/glTF";
import { setupArtworkViewer } from "../../src/components/viewer-shell.ts";
import { FFTOcean } from "./FFTOcean.ts";
import oceanVertexShader from "./ocean_vertex.glsl?raw";
import oceanFragmentShader from "./ocean_fragment.glsl?raw";
import oceanDepthVertexShader from "./ocean_depth_vertex.glsl?raw";
import oceanDepthFragmentShader from "./ocean_depth_fragment.glsl?raw";
import outlinePostProcessShader from "./outline_postprocess.glsl?raw";
import { createScreentoneMaterial } from "./ScreentoneCelShader.ts";

import bedGlbUrl from "./bed.glb";
import bedBaseColorUrl from "./bed_DefaultMaterial_BaseColor.png";
import bedNormalUrl from "./bed_DefaultMaterial_NormalGL.png";
import bedAOUrl from "./bed_DefaultMaterial_AO.png";
// import { ShowInspector } from "@babylonjs/inspector";
import { degToRad } from "../../src/utils/math";

// 로컬 Draco 디코더 설정 (외부 CDN 요청 방지 및 오프라인 디코딩)
DracoCompression.Configuration = {
  decoder: {
    wasmUrl: "/draco/draco_wasm_wrapper_gltf.js",
    wasmBinaryUrl: "/draco/draco_decoder_gltf.wasm",
    fallbackUrl: "/draco/draco_decoder_gltf.js",
  },
};

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
    enableGPUDebugMarkers: true,
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
  scene.clearColor = new Color4(0, 0, 0, 1.0);

  // 1. 카메라 설정 (Orbit 컨트롤)
  const camera = new ArcRotateCamera(
    "Camera",
    degToRad(78),
    degToRad(81.6),
    18.7843,
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
  oceanMesh.forceSharedVertices();

  // 5. FFT 해양 시뮬레이터 초기화 (N=256, domainLength L=256)
  const ocean = new FFTOcean(scene, engine, {
    gridSize: 256,
    domainLength: 256,
    windDirection: new Vector2(1, 1),
    amplitude: 32,
    windSpeed: 120,
    choppiness: 1,
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
        "choppiness",
      ],
      samplers: ["displacementMap", "slopeMap", "foamMap"],
    },
  );

  const uvScale = 6.0;

  oceanMaterial.backFaceCulling = false;
  oceanMaterial.setTexture("displacementMap", ocean.displacementTexture);
  oceanMaterial.setTexture("slopeMap", ocean.slopeTexture);
  oceanMaterial.setTexture("foamMap", ocean.foamTexture);
  oceanMaterial.setFloat("uvScale", uvScale);
  oceanMaterial.setFloat("choppiness", ocean.choppiness);
  oceanMaterial.setFloat("domainLength", ocean.L);
  oceanMaterial.setFloat("meshSize", meshSize);
  oceanMaterial.setVector3(
    "sunDirection",
    sunLight.direction.scale(-1).normalize(),
  );
  oceanMaterial.setColor3("sunColor", sunLight.diffuse);
  oceanMaterial.setVector3("cameraPosition", camera.position);

  oceanMesh.material = oceanMaterial;

  // --------------------------------------------------------------------------
  // [DepthRenderer & 메쉬 변위 일치용 DepthMaterial 설정]
  // --------------------------------------------------------------------------
  const depthRenderer = scene.enableDepthRenderer(
    camera,
    false,
    true,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
  );

  Effect.ShadersStore["oceanDepthVertexShader"] = oceanDepthVertexShader;
  Effect.ShadersStore["oceanDepthFragmentShader"] = oceanDepthFragmentShader;

  const oceanDepthMaterial = new ShaderMaterial(
    "oceanDepthShader",
    scene,
    {
      vertex: "oceanDepth",
      fragment: "oceanDepth",
    },
    {
      attributes: ["position", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uvScale",
        "choppiness",
        "depthValues",
      ],
      samplers: ["displacementMap"],
    },
  );
  oceanDepthMaterial.backFaceCulling = false;
  oceanDepthMaterial.setTexture("displacementMap", ocean.displacementTexture);
  oceanDepthMaterial.setFloat("uvScale", uvScale);
  oceanDepthMaterial.setFloat("choppiness", ocean.choppiness);
  oceanDepthMaterial.setVector2(
    "depthValues",
    new Vector2(camera.minZ, camera.maxZ - camera.minZ),
  );
  depthRenderer.setMaterialForRendering(oceanMesh, oceanDepthMaterial);

  // --------------------------------------------------------------------------
  // [DepthMap 기반 만화 외곽선 PostProcess]
  // --------------------------------------------------------------------------
  Effect.ShadersStore["outlinePostProcessFragmentShader"] =
    outlinePostProcessShader;

  const outlinePostProcess = new PostProcess(
    "outlinePostProcess",
    "outlinePostProcess",
    ["screenSize", "outlineWidth", "depthThreshold", "outlineColor"],
    ["depthSampler"],
    1.0,
    camera,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    engine,
    false,
  );

  outlinePostProcess.onApply = (effect) => {
    effect.setTexture("depthSampler", depthRenderer.getDepthMap());
    effect.setFloat2(
      "screenSize",
      outlinePostProcess.width,
      outlinePostProcess.height,
    );
    effect.setFloat("outlineWidth", 1.2);
    effect.setFloat("depthThreshold", 0.025);
    effect.setColor3("outlineColor", new Color3(1, 1, 1));
  };

  // --------------------------------------------------------------------------
  // [메인 오브젝트: 만화 스크린톤(빗금/점 무늬) 셀 셰이딩 침대(bed.glb) 설정]
  // --------------------------------------------------------------------------
  const bedBaseColorTex = new Texture(bedBaseColorUrl, scene, false, false);
  const bedNormalTex = new Texture(bedNormalUrl, scene, false, false);
  const bedAOTex = new Texture(bedAOUrl, scene, false, false);

  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1.0 : 1.0;
  let currentScreentoneType = 0; // 0: 빗금(Hatching), 1: 점 무늬(Dots), 2: 하이브리드(Hybrid)

  const bedMaterial = createScreentoneMaterial(
    "bedScreentoneShader",
    scene,
    camera,
    sunLight.direction.scale(-1).normalize(),
    sunLight.diffuse,
    {
      baseColorTexture: bedBaseColorTex,
      normalTexture: bedNormalTex,
      aoTexture: bedAOTex,
      screentoneType: currentScreentoneType,
      screentoneDensity: 6.5 * dpr,
    },
  );

  const bedRoot = new TransformNode("bedRoot", scene);
  bedRoot.position.set(0, 0, 0);
  bedRoot.scaling.setAll(6.0);
  bedRoot.rotation.y = Math.PI * 0.25;

  SceneLoader.ImportMeshAsync("", "", bedGlbUrl, scene, undefined, ".glb")
    .then((result) => {
      for (const mesh of result.meshes) {
        if (mesh.getTotalVertices() > 0) {
          mesh.material = bedMaterial;
          // 침대 로컬 원점을 유지하여 침대 하단부가 수면에 안정적으로 자리잡도록 설정
          mesh.position.set(0, -0.2, 0);
        }
      }
      if (result.meshes[0]) {
        result.meshes[0].parent = bedRoot;
      }
      console.info("🛏️ Screentone Cel-Shaded Bed loaded successfully!");
    })
    .catch((err) => {
      console.error("Failed to load bed.glb:", err);
    });

  // 스크린톤 모드 전환 컨트롤러 UI 및 키보드 단축키
  const controlsContainer = document.querySelector(".viewer-controls");
  if (controlsContainer) {
    const modeBtn = document.createElement("button");
    modeBtn.className = "action-btn";
    modeBtn.id = "btnScreentoneMode";
    modeBtn.title = "스크린톤 모드 전환 (1: 빗금, 2: 점 무늬, 3: 하이브리드)";
    modeBtn.style.padding = "0 12px";
    modeBtn.style.width = "auto";
    modeBtn.style.fontSize = "12px";
    modeBtn.style.fontWeight = "600";
    modeBtn.style.letterSpacing = "0.02em";
    modeBtn.innerHTML = `<span>／ 빗금 모드</span>`;

    const modeLabels = ["／ 빗금 모드", "● 점 무늬 모드", "◈ 하이브리드 모드"];

    const updateMode = (newMode: number) => {
      currentScreentoneType = newMode;
      bedMaterial.setFloat("screentoneType", currentScreentoneType);
      modeBtn.innerHTML = `<span>${modeLabels[currentScreentoneType]}</span>`;
    };

    modeBtn.addEventListener("click", () => {
      const nextMode = (currentScreentoneType + 1) % 3;
      updateMode(nextMode);
    });

    controlsContainer.prepend(modeBtn);

    window.addEventListener("keydown", (e) => {
      if (e.key === "1") updateMode(0);
      if (e.key === "2") updateMode(1);
      if (e.key === "3") updateMode(2);
    });
  }

  // 부유체(침대) 파도 물리 상태 변수
  let currentPitch = 0;
  let currentRoll = 0;

  // 매 프레임 시간 전파 및 IFFT 연산 수행
  let t = 0;

  scene.onBeforeRenderObservable.add(() => {
    t += engine.getDeltaTime() * 0.01;
    ocean.update(t);

    oceanMaterial.setVector3("cameraPosition", camera.position);
    oceanDepthMaterial.setVector2(
      "depthValues",
      new Vector2(camera.minZ, camera.maxZ - camera.minZ),
    );

    bedMaterial.setVector3("cameraPosition", camera.position);

    // 부유체(침대) 파도 물리 연동: 해수면 높이(Heave) 및 기울기(Pitch, Roll) 추적
    const water = ocean.getWaterDisplacementAndNormal(
      bedRoot.position.x,
      bedRoot.position.z,
      meshSize,
      uvScale,
    );

    const dt = engine.getDeltaTime() * 0.001;
    // 침대가 파도에 반응하는 물리 계수 설정
    // 대형 부유체의 복원력과 묵직한 무게감을 반영하여 파도 기울기 반영 비율을 대폭 완화
    const tiltDamping = 1; // 파도 기울기 영향도 (기존 100% -> 32%로 축소하여 과도한 롤링/피칭 방지)
    const heaveDamping = 0.8; // 수직 파고 반영 비율

    // 부드러운 관성 감쇠를 위한 저주파 필터 계수
    const heaveSmooth = 1.0 - Math.exp(-2.6 * dt);
    const tiltSmooth = 1.0 - Math.exp(-2.0 * dt);

    // 침대 흘수선(Waterline) 오프셋: 다리 하단부가 수면에 살짝 닿는 자연스러운 부유 위치 (-0.15)
    const waterlineOffset = -0.15;
    const targetY = water.height * heaveDamping + waterlineOffset;
    bedRoot.position.y = Scalar.Lerp(bedRoot.position.y, targetY, heaveSmooth);

    // 파도 기울기(Pitch & Roll): 과도한 쏠림 없이 은은하고 안정감 있는 롤링 연출
    const targetPitch =
      -Math.asin(Math.min(1.0, Math.max(-1.0, water.normal.z))) * tiltDamping;
    const targetRoll =
      Math.asin(Math.min(1.0, Math.max(-1.0, water.normal.x))) * tiltDamping;

    currentPitch = Scalar.Lerp(currentPitch, targetPitch, tiltSmooth);
    currentRoll = Scalar.Lerp(currentRoll, targetRoll, tiltSmooth);

    bedRoot.rotation.x = currentPitch;
    bedRoot.rotation.z = currentRoll;
    // 은은한 좌우 요(Yaw) 유영 (느리고 절제된 스웨이)
    bedRoot.rotation.y = Math.PI * 0.25 + Math.sin(t * 0.08) * 0.035;
  });

  // ShowInspector(scene);

  return scene;
}

// 앱 실행
initializeOceanApp();
