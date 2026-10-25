import {
  Engine,
  Scene,
  Vector3,
  Color4,
  ArcRotateCamera,
  Effect,
  PostProcess,
  Constants,
} from "@babylonjs/core";
import { setupArtworkViewer } from "../../src/components/viewer-shell.ts";
import { CustomLoadingScreen } from "../../src/components/loading-screen.ts";
import { degToRad } from "../../src/utils/math.ts";
import raymarchFragmentShader from "./raymarch_fragment.glsl?raw";

const canvas = document.getElementById("artworkCanvas") as HTMLCanvasElement;

/**
 * 개별 심비오트 유기체(클러스터)의 물리 상태
 */
interface SymbioteNode {
  pos: Vector3;
  vel: Vector3;
  stiffness: number; // 마우스로 끌려가는 탄성 강도
  damping: number;   // 점성 저항 (감쇠)
  phase: number;     // 고유 꿈틀거림 위상
  orbitRadius: number;
  orbitSpeed: number;
}

/**
 * 레이 마칭 아트워크("march") 초기화 함수
 */
function initializeMarchApp() {
  setupArtworkViewer("march");

  const engine = new Engine(canvas, false, {
    powerPreference: "high-performance",
  });

  engine.loadingScreen = new CustomLoadingScreen(
    "#d03f2c",
    `${import.meta.env.BASE_URL}logo.png`,
  );
  engine.displayLoadingUI();

  engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
  engine.resize();

  const scene = createRaymarchScene(engine, canvas);

  scene.executeWhenReady(() => {
    engine.hideLoadingUI();
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
    engine.resize();
  });
}

/**
 * 심비오트 레이 마칭 씬을 구성합니다.
 * 마우스 커서의 2D 화면 좌표를 카메라 기준 3D 월드 평면에 투영하고,
 * 스프링-댐퍼(Spring-Damper) 물리로 움직이는 여러 유기체 노드들의 좌표를 매 프레임 셰이더에 전달합니다.
 */
export function createRaymarchScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
): Scene {
  const scene = new Scene(engine);
  // 심비오트의 검은 윤광과 푸른 프레넬 반사가 돋보이도록 어두운 심해/실험실 톤 배경 설정
  scene.clearColor = new Color4(0.03, 0.035, 0.055, 1.0);

  const target = new Vector3(0, 0, 0);
  const camera = new ArcRotateCamera(
    "RaymarchCamera",
    degToRad(-90),
    degToRad(82),
    6.5,
    target,
    scene,
  );

  // 마우스 휠로 줌 조절 및 우클릭/드래그로 시점 회전 가능
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 30;
  camera.lowerRadiusLimit = 3.5;
  camera.upperRadiusLimit = 14.0;

  // 1. 마우스 입력 상태 추적 (정규화 화면 좌표: -1 ~ +1)
  const mouseNDC = { x: 0, y: 0 };
  let isMouseActive = false;
  let isPointerDown = false;

  window.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
      // 화면 Y축은 아래가 +이므로, 3D 위쪽(+Y)과 맞추기 위해 부호 반전
      mouseNDC.y = -(((e.clientY - rect.top) / rect.height) * 2.0 - 1.0);
      isMouseActive = true;
    }
  });

  window.addEventListener("pointerdown", () => {
    isPointerDown = true;
  });
  window.addEventListener("pointerup", () => {
    isPointerDown = false;
  });

  // 2. 심비오트 군집(8개 유기체 노드) 초기화
  // 각 노드는 서로 다른 탄성(stiffness)과 점성(damping)을 가져,
  // 마우스를 움직일 때 선발대와 후발대가 시간차를 두고 끈적하게 끌려오며 합쳐집니다.
  const NODE_COUNT = 8;
  const nodes: SymbioteNode[] = Array.from({ length: NODE_COUNT }, (_, i) => {
    const angle = (i / NODE_COUNT) * Math.PI * 2;
    return {
      pos: new Vector3(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0),
      vel: new Vector3(0, 0, 0),
      stiffness: 14.0 - i * 1.25, // 0번 노드가 가장 민첩하게 마우스를 쫓고, 뒤쪽 노드는 묵직하게 따라옴
      damping: 0.84 + (i % 3) * 0.03,
      phase: i * 1.73,
      orbitRadius: 0.35 + (i % 4) * 0.22,
      orbitSpeed: (i % 2 === 0 ? 1 : -1) * (1.2 + (i % 3) * 0.45),
    };
  });

  // 셰이더로 전달할 마우스 3D 월드 좌표
  const mouseWorldPos = new Vector3(0, 0, 0);

  // 3. 레이 마칭 프래그먼트 셰이더 등록
  Effect.ShadersStore["raymarchFragmentShader"] = raymarchFragmentShader;

  const uniformNames = [
    "resolution",
    "time",
    "cameraPos",
    "cameraTarget",
    "cameraFov",
    "mouseWorldPos",
    "pulseTension",
    "node0",
    "node1",
    "node2",
    "node3",
    "node4",
    "node5",
    "node6",
    "node7",
  ];

  const raymarchPass = new PostProcess(
    "raymarchPass",
    "raymarch",
    uniformNames,
    [],
    1.0,
    camera,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
    engine,
    false,
  );

  let elapsedSeconds = 0;
  let pulseTension = 0;

  // 4. 매 프레임 물리 시뮬레이션 업데이트 및 셰이더 Uniform 전달
  raymarchPass.onApply = (effect) => {
    const dt = Math.min(engine.getDeltaTime() * 0.001, 0.05);
    elapsedSeconds += dt;

    // (A) 마우스 2D 정규화 좌표를 카메라 시선 수직 평면(3D 월드 공간)으로 변환
    const forward = camera.target.subtract(camera.position).normalize();
    const worldUp = new Vector3(0, 1, 0);
    const right = Vector3.Cross(worldUp, forward).normalize();
    const up = Vector3.Cross(forward, right).normalize();

    const aspect =
      engine.getRenderWidth() / Math.max(engine.getRenderHeight(), 1);
    const distToTarget = Vector3.Distance(camera.position, camera.target);
    const halfHeight = Math.tan(camera.fov * 0.5) * distToTarget;
    const halfWidth = halfHeight * aspect;

    if (isMouseActive) {
      // 마우스가 가리키는 3D 월드 지점 계산
      const target3D = camera.target
        .add(right.scale(mouseNDC.x * halfWidth * 0.85))
        .add(up.scale(mouseNDC.y * halfHeight * 0.85));
      mouseWorldPos.copyFrom(target3D);
    } else {
      // 마우스를 움직이기 전에는 중앙에서 천천히 8자 형태로 유영
      mouseWorldPos.set(
        Math.sin(elapsedSeconds * 0.8) * 0.8,
        Math.cos(elapsedSeconds * 1.1) * 0.5,
        Math.sin(elapsedSeconds * 0.6) * 0.4,
      );
    }

    // 마우스 클릭 시 심비오트가 강하게 수축/응집하는 긴장도(pulseTension) 보간
    const targetTension = isPointerDown ? 1.0 : 0.0;
    pulseTension += (targetTension - pulseTension) * Math.min(1.0, dt * 8.0);

    // (B) 각 심비오트 노드의 스프링-댐퍼 물리 업데이트
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = nodes[i];
      const t = elapsedSeconds * node.orbitSpeed + node.phase;

      // 클릭 시에는 마우스 중심점으로 강하게 응집하고, 평소에는 마우스 주변에서 꿈틀대며 공전
      const spreadFactor = 1.0 - pulseTension * 0.65;
      const offsetR = node.orbitRadius * spreadFactor;

      // 카메라 평면 기준으로 자연스러운 3차원 와류(Swirl) 오프셋 생성
      const swirlOffset = right
        .scale(Math.cos(t) * offsetR)
        .add(up.scale(Math.sin(t * 1.3) * offsetR))
        .add(forward.scale(Math.sin(t * 0.7 + i) * offsetR * 0.8));

      const desiredPos = mouseWorldPos.add(swirlOffset);

      // 스프링 가속도 = (목표 위치 - 현재 위치) * 탄성 계수
      const force = desiredPos.subtract(node.pos).scale(node.stiffness);

      // 인접 노드와의 미세한 반발력/교란을 추가해 한 점으로 완전히 겹치지 않고 꿈틀거리게 함
      node.vel.addInPlace(force.scale(dt));
      node.vel.scaleInPlace(Math.pow(node.damping, dt * 60.0));
      node.pos.addInPlace(node.vel.scale(dt));
    }

    // (C) Uniform 전달
    effect.setFloat2(
      "resolution",
      engine.getRenderWidth(),
      engine.getRenderHeight(),
    );
    effect.setFloat("time", elapsedSeconds);
    effect.setVector3("cameraPos", camera.position);
    effect.setVector3("cameraTarget", camera.target);
    effect.setFloat("cameraFov", camera.fov);
    effect.setVector3("mouseWorldPos", mouseWorldPos);
    effect.setFloat("pulseTension", pulseTension);

    for (let i = 0; i < NODE_COUNT; i++) {
      effect.setVector3(`node${i}`, nodes[i].pos);
    }
  };

  return scene;
}

initializeMarchApp();
