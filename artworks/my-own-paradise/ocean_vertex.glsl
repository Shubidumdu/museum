precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

uniform sampler2D displacementMap;
uniform float uvScale;
uniform float choppiness;

varying vec3 vWorldPos;
varying vec2 vTiledUV;

void main() {
    vec2 tiledUV = uv * uvScale;
    vTiledUV = tiledUV;

    vec4 disp = texture2D(displacementMap, tiledUV);
    float dispX = disp.r;
    float dispZ = disp.g;
    float dispY = disp.b;
    
    vec3 pos = position;
    pos.x -= dispX * choppiness;
    pos.y += dispY;
    pos.z -= dispZ * choppiness;

    vec4 worldPos = world * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = worldViewProjection * vec4(pos, 1.0);
}
