precision highp float;

// Attributes
attribute vec3 position;
attribute vec2 uv;

// Uniforms
uniform mat4 world;
uniform mat4 worldViewProjection;

uniform sampler2D displacementMap;
uniform sampler2D displacementXMap;
uniform sampler2D displacementZMap;
uniform float uvScale;
uniform float choppiness;

// Varyings
varying vec3 vWorldPos;
varying vec2 vTiledUV;

void main() {
    vec2 tiledUV = uv * uvScale;
    vTiledUV = tiledUV;

    // 수직(높이) 및 수평 변위 샘플링
    float dispY = texture2D(displacementMap, tiledUV).r;
    float dispX = texture2D(displacementXMap, tiledUV).r;
    float dispZ = texture2D(displacementZMap, tiledUV).r;
    
    vec3 pos = position;
    // Choppiness 적용: 파도의 마루(crest) 방향으로 수평 수축시켜 뾰족한 파도 형성
    pos.x -= dispX * choppiness;
    pos.y += dispY;
    pos.z -= dispZ * choppiness;

    vec4 worldPos = world * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = worldViewProjection * vec4(pos, 1.0);
}

