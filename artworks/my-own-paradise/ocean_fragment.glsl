precision highp float;

varying vec3 vWorldPos;
varying vec2 vTiledUV;

uniform sampler2D slopeXMap;
uniform sampler2D slopeZMap;
uniform float uvScale;
uniform float domainLength;
uniform float meshSize;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;

void main() {
    // 1. 단순 slopeX, slopeZ 샘플링 (bilinear 필터링 없이 직접 샘플링)
    float slopeX = texture2D(slopeXMap, vTiledUV).r;
    float slopeZ = texture2D(slopeZMap, vTiledUV).r;

    // 2. 물리적 법선 벡터 복원
    float slopeScale = uvScale * (domainLength / meshSize);
    vec3 normal = normalize(vec3(-slopeX * slopeScale, 1.0, -slopeZ * slopeScale));

    // 3. 노멀 매핑 시각화 확인용 기본 조명 (Diffuse + Specular)
    vec3 L = normalize(sunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    float diff = max(0.0, dot(normal, L));
    float spec = pow(max(0.0, dot(normal, H)), 32.0);

    vec3 oceanColor = vec3(0.05, 0.25, 0.45);
    vec3 ambient = vec3(0.02, 0.08, 0.15);
    vec3 color = ambient + oceanColor * (0.3 + 0.7 * diff) + sunColor * spec * 0.6;

    gl_FragColor = vec4(color, 1.0);
}

