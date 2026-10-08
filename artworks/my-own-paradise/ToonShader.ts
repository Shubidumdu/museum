import {
  Scene,
  Camera,
  ShaderMaterial,
  Vector3,
  Color3,
  Effect,
} from "@babylonjs/core";

const toonVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
    vec4 worldPos = world * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(world) * normal);
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const toonFragmentShader = `
precision highp float;

varying vec3 vWorldPos;
varying vec3 vNormal;

uniform vec3 baseColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 cameraPosition;

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(sunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    float NdotL = max(0.0, dot(N, L));

    // 바다 셰이더의 스텝 밴딩과 완벽히 조화되는 3단계 만화(Toon) 음영
    // 1. 하이라이트 (NdotL >= 0.70): 직사광을 강하게 받는 양지
    // 2. 미드톤 (0.20 <= NdotL < 0.70): 물체 고유의 선명한 카툰 색상
    // 3. 섀도우 (NdotL < 0.20): 짙은 만화풍 그림자
    vec3 shadowColor = baseColor * 0.38;
    vec3 midColor    = baseColor;
    vec3 highColor   = min(vec3(1.0), baseColor * 1.22 + vec3(0.04));

    vec3 diffuse;
    if (NdotL >= 0.70) {
        diffuse = highColor;
    } else if (NdotL >= 0.20) {
        diffuse = midColor;
    } else {
        diffuse = shadowColor;
    }

    // 만화풍 선명한 원형 스펙큘러 하이라이트 (Cartoon Specular Glint)
    float NdotH = max(0.0, dot(N, H));
    float specMask = (NdotH > 0.965 && NdotL > 0.20) ? 1.0 : 0.0;
    vec3 specular = sunColor * specMask * 0.5;

    // 만화 림 라이트 (실루엣 에지광)
    float rim = 1.0 - max(0.0, dot(N, V));
    float rimMask = (rim > 0.78 && NdotL > 0.15) ? 1.0 : 0.0;
    vec3 rimLight = baseColor * rimMask * 0.35;

    vec3 finalColor = diffuse + specular + rimLight;

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

let shadersRegistered = false;

function registerShaders() {
  if (!shadersRegistered) {
    Effect.ShadersStore["toonVertexShader"] = toonVertexShader;
    Effect.ShadersStore["toonFragmentShader"] = toonFragmentShader;
    shadersRegistered = true;
  }
}

/**
 * 바다의 카툰 렌더링 스타일과 완벽히 일치하는 Toon ShaderMaterial 생성
 */
export function createToonMaterial(
  name: string,
  baseColor: Color3,
  scene: Scene,
  sunDirection: Vector3,
  sunColor: Color3,
  camera: Camera,
): ShaderMaterial {
  registerShaders();

  const mat = new ShaderMaterial(
    name,
    scene,
    {
      vertex: "toon",
      fragment: "toon",
    },
    {
      attributes: ["position", "normal"],
      uniforms: [
        "world",
        "worldViewProjection",
        "baseColor",
        "sunDirection",
        "sunColor",
        "cameraPosition",
      ],
    },
  );

  mat.setColor3("baseColor", baseColor);
  mat.setVector3("sunDirection", sunDirection);
  mat.setColor3("sunColor", sunColor);
  mat.setVector3("cameraPosition", camera.position);

  return mat;
}

