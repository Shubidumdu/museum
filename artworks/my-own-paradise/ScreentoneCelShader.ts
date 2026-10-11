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

// 안티앨리어싱 빗금 선 마스크 함수 (1-bit 날카로운 펜선 + 0.5px 서브픽셀 안정화)
float calcHatch(float dist, float thickness) {
    float r = thickness * 0.5;
    return 1.0 - smoothstep(r - 0.5, r + 0.5, dist);
}

// 안티앨리어싱 망점 원형 마스크 함수
float calcDot(float dist, float radius) {
    return 1.0 - smoothstep(radius - 0.5, radius + 0.5, dist);
}

void main() {
    vec4 baseTex = texture2D(baseColorMap, vUV);
    // 텍스처 자체의 명암(디테일, 주름 등)을 반영하기 위한 휘도(Luminance) 계산
    float texLuma = dot(baseTex.rgb, vec3(0.299, 0.587, 0.114));

    // NormalGL 텍스처에서 미세 요철 및 주름 복원
    vec3 normalTex = texture2D(normalMap, vUV).rgb;
    vec3 N = perturbNormal(vNormal, vWorldPos, vUV, normalTex);

    // 앰비언트 오클루전 (AO) 샘플링
    float ao = texture2D(aoMap, vUV).r;

    vec3 L = normalize(sunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    float NdotL = max(0.0, dot(N, L));

    // 전체 조명 유효 강도: 빛 방향(NdotL), AO, 텍스처 명암을 결합하여 음영 유효값(E) 산출
    float light = NdotL;
    float E = clamp((light * 0.70 + 0.30 * ao) * (0.20 + 0.80 * texLuma), 0.0, 1.0);

    // -------------------------------------------------------------------------
    // [만화 인쇄풍 스크린톤 패턴 계산 (Screen-Space Halftone Dots & Hatching Lines)]
    // -------------------------------------------------------------------------
    vec2 screenPos = gl_FragCoord.xy;
    float density = max(4.0, screentoneDensity);

    // 1차 빗금 (45도 및 -45도, 기본 간격 D)
    float distH1 = abs(mod(screenPos.x + screenPos.y, density) - density * 0.5);
    float distH2 = abs(mod(screenPos.x - screenPos.y, density) - density * 0.5);

    // 2차 중간 삽입 빗금 (1차 빗금 사이사이에 배치하여 간격 D/2로 밀도 2배 구현)
    float distH3 = abs(mod(screenPos.x + screenPos.y + density * 0.5, density) - density * 0.5);
    float distH4 = abs(mod(screenPos.x - screenPos.y + density * 0.5, density) - density * 0.5);

    // -------------------------------------------------------------------------
    // [1-Bit 셰이딩: 순백 종이(PAPER) 위에 검은색 잉크(INK) 빗금의 밀도로 명암 조절]
    // -------------------------------------------------------------------------
    const vec3 PAPER = vec3(1.0, 1.0, 1.0); // 순백 종이 바탕
    const vec3 INK   = vec3(0.0, 0.0, 0.0); // 검은색 잉크선
    float inkMask = 0.0;

    if (screentoneType < 0.5) {
        // =====================================================================
        // [0. 순수 1-bit 빗금 밀도 모드 (1-Bit Hatching Density Mode)]
        // =====================================================================
        // 음영 임계값에 따라 빗금의 밀도(간격 및 교차)를 4단계로 조절
        if (E >= 0.72) {
            // 하이라이트: 완전한 흰색 (빗금 없음)
            inkMask = 0.0;
        } else if (E >= 0.48) {
            // 1차 음영: 성긴 단일 빗금 (45도 기본 간격 D)
            inkMask = calcHatch(distH1, density * 0.22);
        } else if (E >= 0.28) {
            // 2차 음영: 교차 빗금 (45도 + -45도 교차 빗금, 간격 D)
            float m1 = calcHatch(distH1, density * 0.26);
            float m2 = calcHatch(distH2, density * 0.26);
            inkMask = max(m1, m2);
        } else if (E >= 0.12) {
            // 3차 심층 음영: 고밀도 교차 빗금 (중간선 삽입으로 밀도 2배, 간격 D/2)
            float m1 = max(calcHatch(distH1, density * 0.24), calcHatch(distH2, density * 0.24));
            float m2 = max(calcHatch(distH3, density * 0.24), calcHatch(distH4, density * 0.24));
            inkMask = max(m1, m2);
        } else {
            // 최심층 음영 / 틈새: 잉크 먹칠 (완전한 검은색)
            inkMask = 1.0;
        }
    } else if (screentoneType < 1.5) {
        // =====================================================================
        // [1. 순수 1-bit 점 무늬 모드 (1-Bit Halftone Dot Mode)]
        // =====================================================================
        float rotAngle = 0.785398; // 45도 회전 정방 격자
        mat2 rotMat = mat2(cos(rotAngle), -sin(rotAngle), sin(rotAngle), cos(rotAngle));
        vec2 rotCoord = rotMat * screenPos;
        vec2 dotGrid1 = mod(rotCoord, density) - vec2(density * 0.5);
        float dotDist1 = length(dotGrid1);

        vec2 dotGrid2 = mod(rotCoord + vec2(density * 0.5), density) - vec2(density * 0.5);
        float dotDist2 = length(dotGrid2);

        if (E >= 0.72) {
            inkMask = 0.0;
        } else if (E >= 0.48) {
            // 미세하고 성긴 점 무늬
            inkMask = calcDot(dotDist1, density * 0.16);
        } else if (E >= 0.28) {
            // 중간 크기 점 무늬
            inkMask = calcDot(dotDist1, density * 0.30);
        } else if (E >= 0.12) {
            // 고밀도 복합 망점 (점 개수 2배 증가)
            float m1 = calcDot(dotDist1, density * 0.32);
            float m2 = calcDot(dotDist2, density * 0.24);
            inkMask = max(m1, m2);
        } else {
            inkMask = 1.0;
        }
    } else {
        // =====================================================================
        // [2. 순수 1-bit 하이브리드 모드 (1-Bit Hybrid Mode)]
        // =====================================================================
        // 밝은 곳은 섬세한 망점 -> 어두워질수록 단일 빗금 -> 교차 빗금 -> 먹칠
        float rotAngle = 0.785398;
        mat2 rotMat = mat2(cos(rotAngle), -sin(rotAngle), sin(rotAngle), cos(rotAngle));
        vec2 dotGrid = mod(rotMat * screenPos, density) - vec2(density * 0.5);
        float dotDist = length(dotGrid);

        if (E >= 0.72) {
            inkMask = 0.0;
        } else if (E >= 0.48) {
            // 섬세한 망점
            inkMask = calcDot(dotDist, density * 0.18);
        } else if (E >= 0.28) {
            // 45도 단일 빗금
            inkMask = calcHatch(distH1, density * 0.26);
        } else if (E >= 0.12) {
            // 교차 빗금
            float m1 = calcHatch(distH1, density * 0.26);
            float m2 = calcHatch(distH2, density * 0.26);
            inkMask = max(m1, m2);
        } else {
            inkMask = 1.0;
        }
    }

    // 만화풍 스펙큘러 하이라이트 (하이라이트 영역은 잉크를 깎아내어 순백 강조)
    float NdotH = max(0.0, dot(N, H));
    if (NdotH > 0.95 && NdotL > 0.25) {
        inkMask = 0.0;
    }

    // 만화풍 실루엣 림 라이트 (역광 하이라이트)
    float rim = 1.0 - max(0.0, dot(N, V));
    if (rim > 0.85 && NdotL > 0.15) {
        inkMask = 0.0;
    }

    // 최종 1-bit 합성: 흰색 종이(PAPER) 바탕 위에 검은색 잉크(INK)
    vec3 finalColor = mix(PAPER, INK, inkMask);

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
