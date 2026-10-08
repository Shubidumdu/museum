precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler; // 기본 씬 렌더링 컬러
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

    // Sobel 8방향 뎁스 샘플링
    float d_tl = texture2D(depthSampler, vUV + vec2(-texel.x,  texel.y)).r;
    float d_tc = texture2D(depthSampler, vUV + vec2( 0.0,      texel.y)).r;
    float d_tr = texture2D(depthSampler, vUV + vec2( texel.x,  texel.y)).r;
    float d_ml = texture2D(depthSampler, vUV + vec2(-texel.x,  0.0)).r;
    float d_mr = texture2D(depthSampler, vUV + vec2( texel.x,  0.0)).r;
    float d_bl = texture2D(depthSampler, vUV + vec2(-texel.x, -texel.y)).r;
    float d_bc = texture2D(depthSampler, vUV + vec2( 0.0,     -texel.y)).r;
    float d_br = texture2D(depthSampler, vUV + vec2( texel.x, -texel.y)).r;

    // Sobel 필터 경사도(Gradient) 계산
    float gx = (d_tr + 2.0 * d_mr + d_br) - (d_tl + 2.0 * d_ml + d_bl);
    float gy = (d_tl + 2.0 * d_tc + d_tr) - (d_bl + 2.0 * d_bc + d_br);
    float edge = sqrt(gx * gx + gy * gy);

    // 거리별 깊이 스케일 보정 (카메라 거리에 상관없이 균일하고 선명한 펜선 추출)
    float normalizedEdge = edge / max(0.001, centerDepth * 0.5 + 0.02);

    // 외곽선 마스크
    float outlineMask = smoothstep(depthThreshold, depthThreshold * 1.8, normalizedEdge);

    // 씬 색상 위에 깔끔한 만화 잉크 외곽선 합성
    vec3 finalColor = mix(sceneColor.rgb, outlineColor, outlineMask);

    gl_FragColor = vec4(finalColor, sceneColor.a);
}

