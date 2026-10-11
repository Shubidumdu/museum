precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler; // 기본 씬 렌더링 컬러 및 알파 채널(오브젝트 식별 ID)
uniform sampler2D depthSampler;   // 뎁스 맵 (Depth Texture)
uniform vec2 screenSize;          // 화면 해상도 (픽셀)
uniform float outlineWidth;       // 외곽선 굵기 (픽셀)
uniform float depthThreshold;     // 깊이 차이 판별 임계값
uniform vec3 outlineColor;        // 외곽선 잉크 색상

void main() {
    vec4 sceneColor = texture2D(textureSampler, vUV);
    float centerDepth = texture2D(depthSampler, vUV).r;

    // 픽셀 단위 텍셀 오프셋
    vec2 texel = (1.0 / screenSize) * outlineWidth;

    // Sobel 8방향 뎁스 및 알파(오브젝트 ID) 샘플링
    float d_tl = texture2D(depthSampler, vUV + vec2(-texel.x,  texel.y)).r;
    float d_tc = texture2D(depthSampler, vUV + vec2( 0.0,      texel.y)).r;
    float d_tr = texture2D(depthSampler, vUV + vec2( texel.x,  texel.y)).r;
    float d_ml = texture2D(depthSampler, vUV + vec2(-texel.x,  0.0)).r;
    float d_mr = texture2D(depthSampler, vUV + vec2( texel.x,  0.0)).r;
    float d_bl = texture2D(depthSampler, vUV + vec2(-texel.x, -texel.y)).r;
    float d_bc = texture2D(depthSampler, vUV + vec2( 0.0,     -texel.y)).r;
    float d_br = texture2D(depthSampler, vUV + vec2( texel.x, -texel.y)).r;

    float a_tl = texture2D(textureSampler, vUV + vec2(-texel.x,  texel.y)).a;
    float a_tc = texture2D(textureSampler, vUV + vec2( 0.0,      texel.y)).a;
    float a_tr = texture2D(textureSampler, vUV + vec2( texel.x,  texel.y)).a;
    float a_ml = texture2D(textureSampler, vUV + vec2(-texel.x,  0.0)).a;
    float a_mr = texture2D(textureSampler, vUV + vec2( texel.x,  0.0)).a;
    float a_bl = texture2D(textureSampler, vUV + vec2(-texel.x, -texel.y)).a;
    float a_bc = texture2D(textureSampler, vUV + vec2( 0.0,     -texel.y)).a;
    float a_br = texture2D(textureSampler, vUV + vec2( texel.x, -texel.y)).a;

    // 1. Sobel 필터 뎁스 경사도 (파도 능선 및 원거리 실루엣 외곽선)
    float gx = (d_tr + 2.0 * d_mr + d_br) - (d_tl + 2.0 * d_ml + d_bl);
    float gy = (d_tl + 2.0 * d_tc + d_tr) - (d_bl + 2.0 * d_bc + d_br);
    float edge = sqrt(gx * gx + gy * gy);

    // 거리별 깊이 스케일 보정 (카메라 거리에 상관없이 균일하고 선명한 펜선 추출)
    float normalizedEdge = edge / max(0.001, centerDepth * 0.5 + 0.02);
    float depthMask = smoothstep(depthThreshold, depthThreshold * 1.8, normalizedEdge);

    // 2. Sobel 필터 오브젝트 ID 경사도 (침대-바다 수면 접촉선 완전 검출)
    // 침대는 alpha=0.5, 바다 및 하늘은 alpha=1.0으로 구분
    float gax = (a_tr + 2.0 * a_mr + a_br) - (a_tl + 2.0 * a_ml + a_bl);
    float gay = (a_tl + 2.0 * a_tc + a_tr) - (a_bl + 2.0 * a_bc + a_br);
    float idEdge = sqrt(gax * gax + gay * gay);
    float idMask = smoothstep(0.15, 0.45, idEdge);

    // 뎁스 외곽선 및 침대-바다 경계 외곽선 결합
    float outlineMask = max(depthMask, idMask);

    // 씬 색상 위에 깔끔한 만화 외곽선 합성 (최종 캔버스 알파는 완전 불투명 1.0 유지)
    vec3 finalColor = mix(sceneColor.rgb, outlineColor, outlineMask);

    gl_FragColor = vec4(finalColor, 1.0);
}
