precision highp float;

// Attributes
attribute vec3 position;
attribute vec2 uv;

// Uniforms
uniform mat4 world;
uniform mat4 worldViewProjection;

uniform sampler2D displacementMap;
uniform float uvScale;

// Varyings
varying vec3 vWorldPos;
varying vec2 vTiledUV;

void main() {
    vec2 tiledUV = uv * uvScale;
    vTiledUV = tiledUV;

    // 단순 displacement 샘플링 (bilinear 필터링 없이 직접 샘플링)
    vec4 disp = texture2D(displacementMap, tiledUV);
    
    vec3 pos = position;
    pos.y += disp.r;

    vec4 worldPos = world * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = worldViewProjection * vec4(pos, 1.0);
}

