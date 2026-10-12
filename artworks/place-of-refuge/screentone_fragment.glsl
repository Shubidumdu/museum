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

uniform float screentoneDensity;
uniform vec2 screenSize;

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

float calcHatch(float dist, float thickness) {
	float r = thickness * 0.5;
	return 1.0 - smoothstep(r - 0.5, r + 0.5, dist);
}

void main() {
	vec4 baseTex = texture2D(baseColorMap, vUV);
	float texLuma = dot(baseTex.rgb, vec3(0.299, 0.587, 0.114));

	vec3 normalTex = texture2D(normalMap, vUV).rgb;
	vec3 N = perturbNormal(vNormal, vWorldPos, vUV, normalTex);

	float ao = texture2D(aoMap, vUV).r;

	vec3 L = normalize(sunDirection);
	vec3 V = normalize(cameraPosition - vWorldPos);
	vec3 H = normalize(L + V);

	float NdotL = max(0.0, dot(N, L));

	float light = NdotL;
	float E = clamp((light * 0.70 + 0.30 * ao) * (0.20 + 0.80 * texLuma), 0.0, 1.0);

	vec2 screenPos = gl_FragCoord.xy - screenSize * 0.5;
	float density = max(3.0, screentoneDensity);

	float distH1 = abs(mod(mod(screenPos.x + screenPos.y, density) + density, density) - density * 0.5);
	float distH2 = abs(mod(mod(screenPos.x - screenPos.y, density) + density, density) - density * 0.5);

	float distH3 = abs(mod(mod(screenPos.x + screenPos.y + density * 0.5, density) + density, density) - density * 0.5);
	float distH4 = abs(mod(mod(screenPos.x - screenPos.y + density * 0.5, density) + density, density) - density * 0.5);

	const vec3 PAPER = vec3(1.0, 1.0, 1.0);
	const vec3 INK   = vec3(0.0, 0.0, 0.0);
	float inkMask = 0.0;

	if (E >= 0.35) {
		inkMask = 0.0;
	} else if (E >= 0.325) {
		inkMask = calcHatch(distH1, density * 0.22);
	} else if (E >= 0.28) {
		float m1 = calcHatch(distH1, density * 0.26);
		float m2 = calcHatch(distH2, density * 0.26);
		inkMask = max(m1, m2);
	} else if (E >= 0.175) {
		float m1 = max(calcHatch(distH1, density * 0.24), calcHatch(distH2, density * 0.24));
		float m2 = max(calcHatch(distH3, density * 0.24), calcHatch(distH4, density * 0.24));
		inkMask = max(m1, m2);
	} else {
		inkMask = 1.0;
	}

	float NdotH = max(0.0, dot(N, H));
	if (NdotH > 0.95 && NdotL > 0.25) {
		inkMask = 0.0;
	}

	float rim = 1.0 - max(0.0, dot(N, V));
	if (rim > 0.85 && NdotL > 0.15) {
		inkMask = 0.0;
	}

	vec3 finalColor = mix(PAPER, INK, inkMask);

	gl_FragColor = vec4(finalColor, 0.5);
}
