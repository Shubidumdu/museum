precision highp float;

// Attributes
attribute vec3 position;
attribute vec2 uv;

// Uniforms
uniform mat4 world;
uniform mat4 worldViewProjection;

uniform sampler2D displacementMap; // R: Dx, G: Dz, B: Dy
uniform float uvScale;
uniform float choppiness;

// Varyings
varying vec3 vWorldPos;
varying vec2 vTiledUV;

void main() {
    vec2 tiledUV = uv * uvScale;
    vTiledUV = tiledUV;

    // 4채널 패킹 변위 맵 단일 샘플링 (R: Dx, G: Dz, B: Dy)
    vec4 disp = texture2D(displacementMap, tiledUV);
    float dispX = disp.r;
    float dispZ = disp.g;
    float dispY = disp.b;
    
    vec3 pos = position;
    // Choppiness 적용: 파도의 마루(crest) 방향으로 수평 수축시켜 뾰족한 파도 형성
    pos.x -= dispX * choppiness;
    pos.y += dispY;
    pos.z -= dispZ * choppiness;

    vec4 worldPos = world * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = worldViewProjection * vec4(pos, 1.0);
}

