import {
  Scene,
  Camera,
  ShaderMaterial,
  Vector3,
  Color3,
  Texture,
  Effect,
} from "@babylonjs/core";

const screentoneVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUV;

void main() {
    vec4 worldPos = world * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(world) * normal);
    vUV = uv;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const screentoneFragmentShader = `
precision highp float;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUV;

uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;

uniform sampler2D baseColorMap;
uniform sampler2D normalMap;
uniform sampler2D aoMap;

// 0.0: 하이브리드 (밝은 곳 점 무늬 -> 어두운 곳 빗금 / 교차 빗금)
// 0.0: 순수 빗금 무늬 (Hatching Mode - 단일 빗금 -> 굵은 빗금 -> 교차 빗금)
// 1.0: 순수 점 무늬 (Halftone Dot Mode - 미세 점 -> 중간 점 -> 대형 망점)
// 2.0: 하이브리드 (Hybrid Mode - 점 무늬 -> 단일 빗금 -> 교차 빗금)
uniform float screentoneType;
uniform float screentoneDensity; // 스크린톤 패턴 주기/밀도 (px)

// Cotangent frame 기반 노멀 매핑 (파생 함수 dFdx, dFdy 활용)
vec3 perturbNormal(vec3 normal, vec3 worldPos, vec2 uv, vec3 normalSample) {
    vec3 q0 = dFdx(worldPos);
    vec3 q1 = dFdy(worldPos);
    vec2 st0 = dFdx(uv);
    vec2 st1 = dFdy(uv);

    vec3 N = normalize(normal);
    vec3 dp2perp = cross(N, q0);
    vec3 dp1perp = cross(q1, N);
    vec3 T = dp2perp * st1.x + dp1perp * st0.x;
    vec3 B = dp2perp * st1.y + dp1perp * st0.y;

    float invmax = inversesqrt(max(1e-6, max(dot(T, T), dot(B, B))));
    mat3 TBN = mat3(T * invmax, B * invmax, N);

    vec3 mapN = normalSample * 2.0 - 1.0;
    return normalize(TBN * mapN);
}

// 안티앨리어싱 빗금 선 마스크 함수
float calcHatch(float dist, float thickness) {
    float r = thickness * 0.5;
    return 1.0 - smoothstep(r - 0.75, r + 0.75, dist);
}

// 안티앨리어싱 망점 원형 마스크 함수
float calcDot(float dist, float radius) {
    return 1.0 - smoothstep(radius - 0.75, radius + 0.75, dist);
}

void main() {
    vec4 baseTex = texture2D(baseColorMap, vUV);
    vec3 baseColor = baseTex.rgb;

    // NormalGL 텍스처에서 미세 요철 및 주름 복원
    vec3 normalTex = texture2D(normalMap, vUV).rgb;
    vec3 N = perturbNormal(vNormal, vWorldPos, vUV, normalTex);

    // 앰비언트 오클루전 (AO) 샘플링
    float ao = texture2D(aoMap, vUV).r;

    vec3 L = normalize(sunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    float NdotL = max(0.0, dot(N, L));

    // 전체 조명 유효 강도 (빛 방향 및 AO 결합)
    float E = NdotL * (0.35 + 0.65 * ao);

    // -------------------------------------------------------------------------
    // [만화 인쇄풍 스크린톤 패턴 계산 (Screen-Space Halftone Dots & Hatching Lines)]
    // -------------------------------------------------------------------------
    vec2 screenPos = gl_FragCoord.xy;
    float density = max(4.0, screentoneDensity);

    // 1. 점 무늬 (Halftone Dot Screentone) - 45도 회전 정방 격자
    float rotAngle = 0.785398; // 45도
    mat2 rotMat = mat2(cos(rotAngle), -sin(rotAngle), sin(rotAngle), cos(rotAngle));
    vec2 rotCoord = rotMat * screenPos;
    vec2 dotGrid = mod(rotCoord, density) - vec2(density * 0.5);
    float dotDist = length(dotGrid);

    // 2. 빗금 무늬 (Diagonal Hatching Lines) - 45도(/) 및 -45도(\) 선 중심과의 거리
    float distHatch1 = abs(mod(screenPos.x + screenPos.y, density) - density * 0.5);
    float distHatch2 = abs(mod(screenPos.x - screenPos.y, density) - density * 0.5);

    // -------------------------------------------------------------------------
    // [임계값(Threshold)에 따른 셀 셰이딩 & 스크린톤 톤 매핑]
    // -------------------------------------------------------------------------
    // 4단계 만화 음영 티어:
    // Tier 3: 하이라이트 (E >= 0.70) -> 순수한 밝은 톤 (노 스크린톤)
    // Tier 2: 1차 음영 (0.45 <= E < 0.70) -> 얇은 빗금 또는 미세 점 무늬 (연한 톤)
    // Tier 1: 2차 음영 (0.22 <= E < 0.45) -> 굵은 빗금 또는 중간 점 무늬 (진한 톤)
    // Tier 0: 짙은 그림자/틈새 (E < 0.22) -> 교차 빗금 또는 대형 망점 (매우 진한 톤)

    vec3 toneColor = baseColor;
    vec3 darkInk = baseColor * 0.20; // 스크린톤 잉크 색상

    if (screentoneType < 0.5) {
        // =====================================================================
        // [0. 순수 빗금 무늬 모드 (Hatching Lines Mode)]
        // =====================================================================
        if (E >= 0.70) {
            // 하이라이트: 깨끗하고 화사한 원본 컬러
            toneColor = baseColor * 1.10;
        } else if (E >= 0.45) {
            // 1차 음영: 얇은 45도 단일 빗금 (연한 빗금)
            float mask = calcHatch(distHatch1, density * 0.18);
            toneColor = mix(baseColor * 0.95, darkInk, mask);
        } else if (E >= 0.22) {
            // 2차 음영: 굵고 선명한 45도 단일 빗금 (진한 빗금)
            float mask = calcHatch(distHatch1, density * 0.38);
            toneColor = mix(baseColor * 0.75, darkInk, mask);
        } else {
            // 3차 심층 음영: 45도 + -45도 이중 교차 빗금 (Cross-Hatching)
            float mask1 = calcHatch(distHatch1, density * 0.32);
            float mask2 = calcHatch(distHatch2, density * 0.32);
            float crossMask = max(mask1, mask2);
            toneColor = mix(baseColor * 0.50, darkInk, crossMask);
        }
    } else if (screentoneType < 1.5) {
        // =====================================================================
        // [1. 순수 점 무늬 모드 (Halftone Dot Mode)]
        // =====================================================================
        if (E >= 0.70) {
            // 하이라이트: 깨끗한 원본 컬러
            toneColor = baseColor * 1.10;
        } else if (E >= 0.45) {
            // 1차 음영: 미세한 점 무늬 (연한 점 무늬)
            float mask = calcDot(dotDist, density * 0.16);
            toneColor = mix(baseColor * 0.95, darkInk, mask);
        } else if (E >= 0.22) {
            // 2차 음영: 중간 크기 점 무늬 (진한 점 무늬)
            float mask = calcDot(dotDist, density * 0.32);
            toneColor = mix(baseColor * 0.75, darkInk, mask);
        } else {
            // 3차 심층 음영: 굵직하고 빽빽한 망점 (매우 진한 점 무늬)
            float mask = calcDot(dotDist, density * 0.46);
            toneColor = mix(baseColor * 0.50, darkInk, mask);
        }
    } else {
        // =====================================================================
        // [2. 하이브리드 모드 (Hybrid: 밝은 곳 점 무늬 -> 어두운 곳 빗금/교차 빗금)]
        // =====================================================================
        if (E >= 0.70) {
            toneColor = baseColor * 1.10;
        } else if (E >= 0.45) {
            // 밝은 음영: 섬세한 점 무늬
            float mask = calcDot(dotDist, density * 0.18);
            toneColor = mix(baseColor * 0.95, darkInk, mask);
        } else if (E >= 0.22) {
            // 중간 음영: 45도 단일 빗금
            float mask = calcHatch(distHatch1, density * 0.35);
            toneColor = mix(baseColor * 0.75, darkInk, mask);
        } else {
            // 깊은 음영: 교차 빗금
            float mask1 = calcHatch(distHatch1, density * 0.32);
            float mask2 = calcHatch(distHatch2, density * 0.32);
            float crossMask = max(mask1, mask2);
            toneColor = mix(baseColor * 0.50, darkInk, crossMask);
        }
    }

    // 만화풍 스펙큘러 글린트 (Cartoon Specular Glint)
    float NdotH = max(0.0, dot(N, H));
    float specMask = (NdotH > 0.96 && NdotL > 0.25) ? 1.0 : 0.0;
    vec3 specular = sunColor * specMask * 0.45;

    // 만화풍 실루엣 림 라이트 (Rim Light)
    float rim = 1.0 - max(0.0, dot(N, V));
    float rimMask = (rim > 0.76 && NdotL > 0.15) ? 1.0 : 0.0;
    vec3 rimLight = baseColor * rimMask * 0.35;

    vec3 finalColor = toneColor + specular + rimLight;
    // 침대 고유 오브젝트 식별 ID(알파 0.5): 포스트 프로세스에서 바다(알파 1.0)와의 경계선 검출에 활용
    gl_FragColor = vec4(finalColor, 0.5);
}
`;

let shadersRegistered = false;

function registerShaders() {
  if (!shadersRegistered) {
    Effect.ShadersStore["screentoneVertexShader"] = screentoneVertexShader;
    Effect.ShadersStore["screentoneFragmentShader"] = screentoneFragmentShader;
    shadersRegistered = true;
  }
}

export interface ScreentoneMaterialOptions {
  baseColorTexture: Texture;
  normalTexture: Texture;
  aoTexture: Texture;
  screentoneType?: number; // 0: 빗금(Hatching), 1: 점 무늬(Dots), 2: 하이브리드(Hybrid)
  screentoneDensity?: number; // 기본 7.0
}

/**
 * 만화 스크린톤(빗금 및 점 무늬)과 셀 셰이딩을 융합한 ShaderMaterial 생성
 */
export function createScreentoneMaterial(
  name: string,
  scene: Scene,
  camera: Camera,
  sunDirection: Vector3,
  sunColor: Color3,
  options: ScreentoneMaterialOptions,
): ShaderMaterial {
  registerShaders();

  const mat = new ShaderMaterial(
    name,
    scene,
    {
      vertex: "screentone",
      fragment: "screentone",
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "sunDirection",
        "sunColor",
        "screentoneType",
        "screentoneDensity",
      ],
      samplers: ["baseColorMap", "normalMap", "aoMap"],
    },
  );

  mat.setVector3("cameraPosition", camera.position);
  mat.setVector3("sunDirection", sunDirection);
  mat.setColor3("sunColor", sunColor);
  mat.setFloat("screentoneType", options.screentoneType ?? 0.0);
  mat.setFloat("screentoneDensity", options.screentoneDensity ?? 7.0);

  mat.setTexture("baseColorMap", options.baseColorTexture);
  mat.setTexture("normalMap", options.normalTexture);
  mat.setTexture("aoMap", options.aoTexture);

  return mat;
}
