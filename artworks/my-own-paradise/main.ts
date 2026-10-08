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
  TransformNode,
  AbstractMesh,
  RenderTargetTexture,
  PostProcess,
  Constants,
} from "@babylonjs/core";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import { setupArtworkViewer } from "../../src/components/viewer-shell.ts";
import { FFTOcean } from "./FFTOcean.ts";
import oceanVertexShader from "./ocean_vertex.glsl?raw";
import oceanFragmentShader from "./ocean_fragment.glsl?raw";
import oceanDepthVertexShader from "./ocean_depth_vertex.glsl?raw";
import oceanDepthFragmentShader from "./ocean_depth_fragment.glsl?raw";
import outlinePostProcessShader from "./outline_postprocess.glsl?raw";
import { createSky } from "./SkyShader.ts";
import { createToonMaterial } from "./ToonShader.ts";

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

export interface DriftingObject {
  mesh: AbstractMesh;
  s: number; // 파도 진행 축 좌표 (-55 ~ +55)
  t: number; // 파도 횡방향 측면 축 좌표 (-28 ~ +28)
  speed: number; // 파도를 타고 떠내려가는 속도 (units/sec)
  baseYOffset: number; // 기본 흘수선 높이 오프셋
  buoyancyScale: number; // 파도 높이 추종률
  tiltScale: number; // 파도 법선 기울기 추종률
  baseRotX: number; // 고유 초기 회전각 X
  baseRotZ: number; // 고유 초기 회전각 Z
  rotSpeedY: number; // 물에 떠서 천천히 자전하는 각속도
}

/**
 * 바다에 잠긴/떠 있는 3D 오브젝트들을 생성합니다.
 * - 중앙 메인 오브젝트(해상 비콘): 제자리에 고정되어 파도에 일렁임
 * - 그 외 오브젝트들: 파도 방향으로 계속 떠내려가며 끝에 다다르면 반대편에서 재생성
 * - 바다와 일치하는 툰 셰이딩(Toon Shading) 적용
 */
function createSubmergedObjects(
  scene: Scene,
  sunDirection: Vector3,
  sunColor: Color3,
  camera: ArcRotateCamera,
) {
  // 1. 카툰 툰 셰이더 머티리얼 생성 (바다 셰이더의 스텝 밴딩과 완벽히 일치)
  const redMat = createToonMaterial(
    "beaconRedToon",
    Color3.FromHexString("#e63946"),
    scene,
    sunDirection,
    sunColor,
    camera,
  );

  const whiteMat = createToonMaterial(
    "beaconWhiteToon",
    Color3.FromHexString("#f1faee"),
    scene,
    sunDirection,
    sunColor,
    camera,
  );

  const buoyMat = createToonMaterial(
    "buoyToon",
    Color3.FromHexString("#f4a261"),
    scene,
    sunDirection,
    sunColor,
    camera,
  );

  const coralBuoyMat = createToonMaterial(
    "coralBuoyToon",
    Color3.FromHexString("#e76f51"),
    scene,
    sunDirection,
    sunColor,
    camera,
  );

  const monolithMat = createToonMaterial(
    "monolithToon",
    Color3.FromHexString("#2a9d8f"),
    scene,
    sunDirection,
    sunColor,
    camera,
  );

  const crateMat = createToonMaterial(
    "crateToon",
    Color3.FromHexString("#d4a373"),
    scene,
    sunDirection,
    sunColor,
    camera,
  );

  // 2. [가운데 고정 메인 오브젝트] 빨강/하양 줄무늬 해상 비콘 (Nautical Striped Beacon / Spar Buoy)
  // 카메라 중심(0, 0, 0)에 닻을 내리고 고정되어 파도 높낮이와 너울에 맞춰 오뚝이처럼 우아하게 일렁임
  const beaconRoot = new TransformNode("beaconRoot", scene);
  beaconRoot.position.set(0, 0, 0);

  const segmentCount = 8;
  const segmentHeight = 2.5; // 총 높이 20.0 (y: -10.0 ~ +10.0)
  const beaconRadius = 1.8;

  for (let i = 0; i < segmentCount; i++) {
    const seg = MeshBuilder.CreateCylinder(
      `beaconSeg_${i}`,
      {
        height: segmentHeight,
        diameter: beaconRadius * 2,
        tessellation: 32,
      },
      scene,
    );
    const yCenter = -10.0 + segmentHeight * 0.5 + i * segmentHeight;
    seg.parent = beaconRoot;
    seg.position.set(0, yCenter, 0);
    seg.material = i % 2 === 0 ? redMat : whiteMat;
  }

  // 상단 랜턴 캡
  const cap = MeshBuilder.CreateCylinder(
    "beaconCap",
    {
      height: 1.5,
      diameterTop: 0.5,
      diameterBottom: beaconRadius * 2.4,
      tessellation: 32,
    },
    scene,
  );
  cap.parent = beaconRoot;
  cap.position.set(0, 10.0 + 0.75, 0);
  cap.material = redMat;

  // 3. [파도를 타고 계속 떠내려가는 부유 오브젝트 목록]
  const driftingObjects: DriftingObject[] = [];

  // 1) 노란색 튜브 구명 부표 (Yellow Torus Buoy)
  const buoy1 = MeshBuilder.CreateTorus(
    "buoyYellow",
    { diameter: 6.5, thickness: 1.7, tessellation: 32 },
    scene,
  );
  buoy1.material = buoyMat;
  driftingObjects.push({
    mesh: buoy1,
    s: -25,
    t: 15,
    speed: 3.6,
    baseYOffset: 0.0,
    buoyancyScale: 1.0,
    tiltScale: 1.0,
    baseRotX: 0,
    baseRotZ: 0,
    rotSpeedY: 0.08,
  });

  // 2) 산호색/오렌지 튜브 부표 (Coral Lifebuoy)
  const buoy2 = MeshBuilder.CreateTorus(
    "buoyCoral",
    { diameter: 5.2, thickness: 1.4, tessellation: 32 },
    scene,
  );
  buoy2.material = coralBuoyMat;
  driftingObjects.push({
    mesh: buoy2,
    s: 18,
    t: -16,
    speed: 4.1,
    baseYOffset: 0.0,
    buoyancyScale: 1.0,
    tiltScale: 0.95,
    baseRotX: 0,
    baseRotZ: 0,
    rotSpeedY: -0.12,
  });

  // 3) 비스듬히 잠긴 청록색 기둥 모놀리스 (Submerged Monolith)
  const monolith = MeshBuilder.CreateBox(
    "monolith",
    { width: 3.8, height: 11, depth: 3.8 },
    scene,
  );
  monolith.material = monolithMat;
  driftingObjects.push({
    mesh: monolith,
    s: -8,
    t: -12,
    speed: 2.7,
    baseYOffset: -3.0,
    buoyancyScale: 0.65,
    tiltScale: 0.45,
    baseRotX: 0.15,
    baseRotZ: 0.25,
    rotSpeedY: 0.05,
  });

  // 4) 떠다니는 목재 보급 상자 (Floating Wooden Crate)
  const crate = MeshBuilder.CreateBox(
    "floatingCrate",
    { width: 3.5, height: 3.2, depth: 3.5 },
    scene,
  );
  crate.material = crateMat;
  driftingObjects.push({
    mesh: crate,
    s: 36,
    t: 12,
    speed: 3.4,
    baseYOffset: -0.3,
    buoyancyScale: 0.9,
    tiltScale: 0.75,
    baseRotX: 0.1,
    baseRotZ: -0.1,
    rotSpeedY: 0.07,
  });

  // 5) 붉은색 해상 작은 부표 배럴 (Red Floating Barrel)
  const barrel = MeshBuilder.CreateCylinder(
    "floatingBarrel",
    { height: 3.4, diameter: 2.4, tessellation: 24 },
    scene,
  );
  barrel.material = redMat;
  driftingObjects.push({
    mesh: barrel,
    s: -48,
    t: -20,
    speed: 3.9,
    baseYOffset: 0.1,
    buoyancyScale: 0.95,
    tiltScale: 0.85,
    baseRotX: Math.PI * 0.48, // 옆으로 뉘여서 둥둥 떠다님
    baseRotZ: 0,
    rotSpeedY: -0.15,
  });

  return {
    beaconRoot,
    driftingObjects,
    toonMaterials: [
      redMat,
      whiteMat,
      buoyMat,
      coralBuoyMat,
      monolithMat,
      crateMat,
    ],
  };
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

  // 4. 하늘(Sky Dome) 생성 - 사용자 정의 WGSL/GLSL 스카이 셰이더 적용
  createSky(scene, camera);

  // 5. 수중 굴절용 씬 캡처 RenderTargetTexture (Refraction RTT)
  const refractionRTT = new RenderTargetTexture(
    "refractionRTT",
    {
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
    },
    scene,
    false,
    true,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    false,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
  );
  refractionRTT.clearColor = new Color4(0, 0, 0, 0); // 빈 공간은 투명하게 비움
  refractionRTT.activeCamera = camera;
  refractionRTT.renderListPredicate = (mesh) => {
    // 바다와 하늘을 제외하고 실제 수중/씬 오브젝트만 캡처
    return mesh !== oceanMesh && mesh.name !== "skySphere";
  };
  scene.customRenderTargets.push(refractionRTT);

  engine.onResizeObservable.add(() => {
    refractionRTT.resize({
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
    });
  });

  // 6. 바다에 잠긴/떠 있는 3D 오브젝트 배치 (툰 셰이딩 적용)
  const sunDir = sunLight.direction.scale(-1).normalize();
  const { beaconRoot, driftingObjects, toonMaterials } = createSubmergedObjects(
    scene,
    sunDir,
    sunLight.diffuse,
    camera,
  );

  // 7. FFT 해양 시뮬레이터 초기화 (N=256, domainLength L=256)
  const ocean = new FFTOcean(scene, engine, {
    gridSize: 256,
    domainLength: 256,
    windDirection: new Vector2(1, 1),
    amplitude: 1024,
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
        "view",
        "screenSize",
        "refractionStrength",
        "flipRefractionY",
        "uvScale",
        "domainLength",
        "meshSize",
        "cameraPosition",
        "sunDirection",
        "sunColor",
        "choppiness",
      ],
      samplers: ["displacementMap", "slopeMap", "foamMap", "refractionMap"],
    },
  );

  // 4.0: 4x4 타일링 (16개 타일)으로 텍셀 밀도를 대폭 올려 선명한 디테일 생성
  const uvScale = 3.0;

  oceanMaterial.backFaceCulling = false;
  oceanMaterial.setTexture("displacementMap", ocean.displacementTexture);
  oceanMaterial.setTexture("slopeMap", ocean.slopeTexture);
  oceanMaterial.setTexture("foamMap", ocean.foamTexture);
  oceanMaterial.setTexture("refractionMap", refractionRTT);
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
  oceanMaterial.setMatrix("view", scene.getViewMatrix());
  oceanMaterial.setVector2(
    "screenSize",
    new Vector2(engine.getRenderWidth(), engine.getRenderHeight()),
  );
  oceanMaterial.setFloat("refractionStrength", 0.035);
  oceanMaterial.setFloat("flipRefractionY", 0.0);

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
    effect.setFloat("outlineWidth", 1);
    effect.setFloat("depthThreshold", 0.025);
    effect.setColor3("outlineColor", new Color3(1, 1, 1));
  };

  // 매 프레임 시간 전파 및 IFFT 연산 수행
  let t = 0;
  const lerp = (a: number, b: number, factor: number) => a + (b - a) * factor;

  scene.onBeforeRenderObservable.add(() => {
    t += engine.getDeltaTime() * 0.01;
    ocean.update(t);

    const camPos = camera.position;
    oceanMaterial.setVector3("cameraPosition", camPos);
    oceanMaterial.setMatrix("view", scene.getViewMatrix());
    oceanMaterial.setVector2(
      "screenSize",
      new Vector2(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    oceanDepthMaterial.setVector2(
      "depthValues",
      new Vector2(camera.minZ, camera.maxZ - camera.minZ),
    );

    // 툰 머티리얼 카메라 위치 및 조명 방향 동기화
    for (let i = 0; i < toonMaterials.length; i++) {
      toonMaterials[i].setVector3("cameraPosition", camPos);
      toonMaterials[i].setVector3("sunDirection", sunDir);
    }

    // ------------------------------------------------------------------------
    // [파도 진행 방향을 따라 무한히 떠내려가고 반대편에서 재생성되는 부유 물리 시뮬레이션]
    // ------------------------------------------------------------------------
    const dt = engine.getDeltaTime() * 0.001; // 초 단위 델타 타임

    // 파도 실제 시각적 전파 방향 (FFT 파동 위상 진행 방향: -windDirection)
    const waveDirX = -ocean.windDirection.x;
    const waveDirZ = -ocean.windDirection.y;
    // 파도 파면(횡방향) 단위 벡터
    const wavePerpX = -waveDirZ;
    const wavePerpZ = waveDirX;

    const sMin = -55.0;
    const sMax = 55.0;
    const fadeSpan = 8.0;

    for (let i = 0; i < driftingObjects.length; i++) {
      const obj = driftingObjects[i];

      // 1. 파도 방향으로 계속해서 떠내려감
      obj.s += obj.speed * dt;

      // 2. 바다 하류 끝(sMax)에 도달하면 반대쪽 상류 끝(sMin)에서 재생성
      if (obj.s > sMax) {
        obj.s = sMin;
        // 중앙 메인 비콘(t=0 근처)과 겹치지 않도록 측면 영역에서 무작위 재배치
        const sideSign = Math.random() < 0.5 ? -1 : 1;
        obj.t = sideSign * (8.0 + Math.random() * 18.0);
      }

      // 3. (s, t) 파도 좌표계 -> 월드 (X, Z) 좌표 변환
      const worldX = obj.s * waveDirX + obj.t * wavePerpX;
      const worldZ = obj.s * waveDirZ + obj.t * wavePerpZ;

      // 4. 출현(Fade-in) 및 퇴장(Fade-out) 시 부드러운 스케일링으로 팝인 없는 자연스러운 재생성
      let scale = 1.0;
      if (obj.s < sMin + fadeSpan) {
        scale = Math.max(0.01, (obj.s - sMin) / fadeSpan);
      } else if (obj.s > sMax - fadeSpan) {
        scale = Math.max(0.01, (sMax - obj.s) / fadeSpan);
      }
      obj.mesh.scaling.setAll(scale);

      // 5. 현재 이동 위치에서의 실시간 파도 높이 및 법선(Normal) 샘플링
      const water = ocean.getWaterDisplacementAndNormal(
        worldX,
        worldZ,
        meshSize,
        uvScale,
      );

      // 6. 파도 초피니스(수평 변위) 및 파고(Displacement Y) 반영
      const targetX = worldX - water.dispX * ocean.choppiness * 0.4;
      const targetZ = worldZ - water.dispZ * ocean.choppiness * 0.4;
      const targetY = obj.baseYOffset + water.height * obj.buoyancyScale;

      obj.mesh.position.x = lerp(obj.mesh.position.x, targetX, 0.20);
      obj.mesh.position.z = lerp(obj.mesh.position.z, targetZ, 0.20);
      obj.mesh.position.y = lerp(obj.mesh.position.y, targetY, 0.25);

      // 7. 파도 법선에 따른 피치/롤 틸팅 및 물에 뜬 자전 모션
      const targetPitch =
        Math.atan2(water.normal.z, water.normal.y) * obj.tiltScale +
        obj.baseRotX;
      const targetRoll =
        -Math.atan2(water.normal.x, water.normal.y) * obj.tiltScale +
        obj.baseRotZ;

      obj.mesh.rotation.x = lerp(obj.mesh.rotation.x, targetPitch, 0.20);
      obj.mesh.rotation.z = lerp(obj.mesh.rotation.z, targetRoll, 0.20);
      obj.mesh.rotation.y += obj.rotSpeedY * dt;
    }

    // 8. [가운데 고정 메인 오브젝트] 비콘은 제자리(0, 0)에서 수직 부력 및 파도 너울 모션 유지
    const beaconWater = ocean.getWaterDisplacementAndNormal(
      0,
      0,
      meshSize,
      uvScale,
    );
    const targetBeaconY = beaconWater.height * 0.70;
    const targetBeaconPitch =
      Math.atan2(beaconWater.normal.z, beaconWater.normal.y) * 0.45;
    const targetBeaconRoll =
      -Math.atan2(beaconWater.normal.x, beaconWater.normal.y) * 0.45;

    beaconRoot.position.y = lerp(beaconRoot.position.y, targetBeaconY, 0.14);
    beaconRoot.rotation.x = lerp(
      beaconRoot.rotation.x,
      targetBeaconPitch,
      0.10,
    );
    beaconRoot.rotation.z = lerp(beaconRoot.rotation.z, targetBeaconRoll, 0.10);
  });

  // ShowInspector(scene);

  return scene;
}

// 앱 실행
initializeOceanApp();
