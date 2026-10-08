import {
  Scene,
  Camera,
  MeshBuilder,
  Mesh,
  ShaderMaterial,
  Vector3,
  Color3,
  Effect,
} from "@babylonjs/core";

// -----------------------------------------------------------------------------
// [사용자 제공 WGSL 셰이더 원본 보존]
// -----------------------------------------------------------------------------
export const SKY_WGSL = `
struct SkyUniforms {
    cameraPos: vec3<f32>,
    time: f32,
    moonDir: vec3<f32>,       // 달의 방향 (예: normalize(vec3(0.2, 0.4, -0.9)))
    horizonColor: vec3<f32>,  // 수평선 색상 (예: vec3(0.08, 0.08, 0.10))
    zenithColor: vec3<f32>,   // 천장 색상 (예: vec3(0.01, 0.01, 0.02))
};

@group(0) @binding(0) var<uniform> sky: SkyUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
    var out: VertexOutput;
    // 거대한 역구체(Inverted Sphere) 메시 사용 기준
    out.worldPos = position + sky.cameraPos;
    // 카메라를 중심으로 따라다니도록 프로젝션
    // (Babylon ViewProjection 곱셈 적용)
    return out;
}

@fragment
fn fs_main(@location(0) worldPos: vec3<f32>) -> @location(0) vec4<f32> {
    let V = normalize(worldPos - sky.cameraPos);
    
    // 1. 수직 계조 (수평선 -> 천장 그라데이션)
    let heightFactor = clamp(V.y * 3.0, 0.0, 1.0);
    var color = mix(sky.horizonColor, sky.zenithColor, heightFactor);

    // 2. 미니멀한 원형 달 (Graphic Moon Silhouette)
    let dotM = dot(V, normalize(sky.moonDir));
    let moonRadius = 0.998; // 달 크기
    
    if (dotM > moonRadius) {
        // 단색의 창백한 흰색 원
        let moonIntensity = smoothstep(moonRadius, moonRadius + 0.0005, dotM);
        color = mix(color, vec3<f32>(0.92, 0.92, 0.95), moonIntensity);
    } else {
        // 달 주변의 미세한 발광 림(Halo)
        let halo = pow(max(dotM, 0.0), 128.0) * 0.25;
        color += vec3<f32>(halo);
    }

    return vec4<f32>(color, 1.0);
}
`;

// -----------------------------------------------------------------------------
// [Babylon.js WebGPU 런타임 호환 셰이더]
// -----------------------------------------------------------------------------
const skyVertexShader = `
precision highp float;

attribute vec3 position;

uniform mat4 worldViewProjection;
uniform vec3 cameraPos;

varying vec3 vWorldPos;

void main() {
    // 거대한 역구체(Inverted Sphere) 메시 사용 기준
    vec3 worldPos = position + cameraPos;
    vWorldPos = worldPos;
    vec4 clipPos = worldViewProjection * vec4(position, 1.0);
    // 무한 원점(Far Plane)에 위치하도록 z = w 트릭 적용 (어떤 오브젝트도 가리지 않음)
    gl_Position = vec4(clipPos.xy, clipPos.w * 0.99999, clipPos.w);
}
`;

const skyFragmentShader = `
precision highp float;

varying vec3 vWorldPos;

uniform vec3 cameraPos;
uniform vec3 moonDir;
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform float time;

void main() {
    vec3 V = normalize(vWorldPos - cameraPos);

    // 1. 수직 계조 (수평선 -> 천장 그라데이션)
    float heightFactor = clamp(V.y * 3.0, 0.0, 1.0);
    vec3 color = mix(horizonColor, zenithColor, heightFactor);

    // 2. 미니멀한 원형 달 (Graphic Moon Silhouette)
    float dotM = dot(V, normalize(moonDir));
    float moonRadius = 0.998; // 달 크기

    if (dotM > moonRadius) {
        // 단색의 창백한 흰색 원
        float moonIntensity = smoothstep(moonRadius, moonRadius + 0.0005, dotM);
        color = mix(color, vec3(0.92, 0.92, 0.95), moonIntensity);
    } else {
        // 달 주변의 미세한 발광 림(Halo)
        float halo = pow(max(dotM, 0.0), 128.0) * 0.25;
        color += vec3(halo);
    }

    gl_FragColor = vec4(color, 1.0);
}
`;

export interface SkyOptions {
  moonDir?: Vector3;
  horizonColor?: Color3;
  zenithColor?: Color3;
  diameter?: number;
}

/**
 * 사용자 제공 셰이더를 기반으로 거대한 역구체 하늘(Sky Dome)을 생성 및 씬에 배치합니다.
 */
export function createSky(
  scene: Scene,
  camera: Camera,
  options: SkyOptions = {},
): Mesh {
  Effect.ShadersStore["skyVertexShader"] = skyVertexShader;
  Effect.ShadersStore["skyFragmentShader"] = skyFragmentShader;

  const diameter = options.diameter ?? 1000;
  const skySphere = MeshBuilder.CreateSphere(
    "skySphere",
    {
      diameter,
      segments: 32,
      sideOrientation: Mesh.BACKSIDE, // 역구체 (Inverted Sphere)
    },
    scene,
  );

  skySphere.infiniteDistance = true;
  skySphere.ignoreCameraMaxZ = true;
  skySphere.isPickable = false;

  const skyMaterial = new ShaderMaterial(
    "skyShader",
    scene,
    {
      vertex: "sky",
      fragment: "sky",
    },
    {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        "cameraPos",
        "moonDir",
        "horizonColor",
        "zenithColor",
        "time",
      ],
    },
  );

  skyMaterial.backFaceCulling = false;
  // 깊이 버퍼 쓰기를 비활성화하여 뎁스 렌더러 및 포스트프로세스 외곽선 검출과 충돌 방지
  skyMaterial.disableDepthWrite = true;

  const moonDir = options.moonDir ?? new Vector3(0.2, 0.4, -0.9).normalize();
  const horizonColor = options.horizonColor ?? new Color3(0.08, 0.08, 0.10);
  const zenithColor = options.zenithColor ?? new Color3(0.01, 0.01, 0.02);

  skyMaterial.setVector3("cameraPos", camera.position);
  skyMaterial.setVector3("moonDir", moonDir);
  skyMaterial.setColor3("horizonColor", horizonColor);
  skyMaterial.setColor3("zenithColor", zenithColor);
  skyMaterial.setFloat("time", 0.0);

  skySphere.material = skyMaterial;

  // 카메라 이동 및 시간 동기화
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    skyMaterial.setVector3("cameraPos", camera.position);
    t += scene.getEngine().getDeltaTime() * 0.001;
    skyMaterial.setFloat("time", t);
  });

  return skySphere;
}

