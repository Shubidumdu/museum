precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;
uniform sampler2D displacementMap;
uniform float uvScale;
uniform float choppiness;
uniform vec2 depthValues; // x: minZ, y: maxZ - minZ

varying float vDepthMetric;

void main() {
    vec2 tiledUV = uv * uvScale;
    vec4 disp = texture2D(displacementMap, tiledUV);
    float dispX = disp.r;
    float dispZ = disp.g;
    float dispY = disp.b;

    vec3 pos = position;
    pos.x -= dispX * choppiness;
    pos.y += dispY;
    pos.z -= dispZ * choppiness;

    vec4 clipPos = worldViewProjection * vec4(pos, 1.0);
    gl_Position = clipPos;
    vDepthMetric = (clipPos.z + depthValues.x) / depthValues.y;
}

