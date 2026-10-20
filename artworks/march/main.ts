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
 * 레이 마칭 아트워크("march") 초기화 함수
 * 프래그먼트 셰이더만으로 동작하므로 호환성과 초기 구동 속도가 뛰어난 WebGL(Engine)을 사용합니다.
 */
function initializeMarchApp() {
  // 아트워크 뷰어 UI(헤더, 도슨트 명판, UI 숨김 단축키 등) 초기화
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
 * 레이 마칭 씬을 구성합니다.
 * 폴리곤 메쉬를 직접 그리는 대신, 화면 전체를 덮는 PostProcess(Fullscreen Quad)에서
 * 프래그먼트 셰이더(`raymarch_fragment.glsl`)를 실행하여 모든 픽셀에서 광선을 쏩니다.
 */
export function createRaymarchScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.08, 0.09, 0.12, 1.0);

  // 1. 카메라 설정:
  // 마우스 드래그 및 휠로 자유롭게 시점을 회전/확대할 수 있도록 ArcRotateCamera를 사용합니다.
  // 여기서 계산된 카메라의 위치(position)와 타겟(target)이 매 프레임 레이 마칭 셰이더로 전달됩니다.
  const target = new Vector3(0, 1.0, 0);
  const camera = new ArcRotateCamera(
    "RaymarchCamera",
    degToRad(-60), // 수평 회전각 (Alpha)
    degToRad(70),  // 수직 회전각 (Beta)
    6.0,           // 타겟으로부터의 거리 (Radius)
    target,
    scene,
  );

  camera.attachControl(canvas, true);
  camera.wheelPrecision = 30;
  camera.lowerRadiusLimit = 2.5;
  camera.upperRadiusLimit = 20.0;
  camera.upperBetaLimit = degToRad(88); // 바닥 아래로 카메라가 파고들지 않도록 제한

  // 2. 레이 마칭 프래그먼트 셰이더 등록
  // Babylon.js의 PostProcess는 이름 뒤에 "FragmentShader"가 붙은 키를 Effect.ShadersStore에서 찾습니다.
  Effect.ShadersStore["raymarchFragmentShader"] = raymarchFragmentShader;

  // 3. 화면 전체에 레이 마칭을 수행할 PostProcess 생성
  const raymarchPass = new PostProcess(
    "raymarchPass",
    "raymarch", // Effect.ShadersStore["raymarchFragmentShader"] 참조
    [
      "resolution",   // 화면 가로/세로 픽셀 크기
      "time",         // 애니메이션용 경과 시간
      "cameraPos",    // 카메라 월드 위치 (Ray Origin)
      "cameraTarget", // 카메라가 바라보는 목표점
      "cameraFov",    // 카메라 시야각 (라디안)
    ],
    [], // 추가 텍스처 샘플러 목록 (필요 시 여기에 텍스처 이름 추가)
    1.0,
    camera,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
    engine,
    false,
  );

  let elapsedSeconds = 0;

  // 4. 매 프레임마다 셰이더 Uniform 값 업데이트
  raymarchPass.onApply = (effect) => {
    elapsedSeconds += engine.getDeltaTime() * 0.001;

    effect.setFloat2(
      "resolution",
      engine.getRenderWidth(),
      engine.getRenderHeight(),
    );
    effect.setFloat("time", elapsedSeconds);
    effect.setVector3("cameraPos", camera.position);
    effect.setVector3("cameraTarget", camera.target);
    effect.setFloat("cameraFov", camera.fov);
  };

  return scene;
}

initializeMarchApp();
