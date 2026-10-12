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

