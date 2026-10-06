precision highp float;

varying vec3 vWorldPos;
varying vec2 vTiledUV;

uniform sampler2D slopeMap;
uniform sampler2D foamMap;
uniform float uvScale;
uniform float domainLength;
uniform float meshSize;
uniform float choppiness;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 sunColor;

void main() {
    // 1. 단일 slopeMap 샘플링 (R: slopeX, G: slopeZ)
    vec2 slopes = texture2D(slopeMap, vTiledUV).rg;
    float slopeX = slopes.r;
    float slopeZ = slopes.g;

    // 2. 물리적 법선 벡터 복원
    float slopeScale = uvScale * (domainLength / meshSize);
    vec3 normal = normalize(vec3(-slopeX * slopeScale, 1.0, -slopeZ * slopeScale));

    // 3. Tessendorf Jacobian 행렬식 기반 Foam (거품/포말) 계산
    // R: Jxx (dDx/dx), G: Jzz (dDz/dz), B: Jxz (dDx/dz)
    vec3 J_data = texture2D(foamMap, vTiledUV).rgb;
    float Jxx = J_data.r * slopeScale;
    float Jzz = J_data.g * slopeScale;
    float Jxz = J_data.b * slopeScale;

    // 자코비안 행렬식 Det(J) = (1 - chop*Jxx) * (1 - chop*Jzz) - (chop*Jxz)^2
    float c = choppiness;
    float jacobian = (1.0 - c * Jxx) * (1.0 - c * Jzz) - (c * Jxz) * (c * Jxz);

    // 파도가 자가 교차하거나 수축이 극대화될 때 (jacobian < threshold) 하얀 포말 생성
    float foamThreshold = 0.6;
    float foam = clamp((foamThreshold - jacobian) * 1.6, 0.0, 1.0);

    // 4. 주요 방향 벡터 계산 (빛, 시선, 반사, 하프 벡터)
    vec3 L = normalize(sunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);
    vec3 R = reflect(-V, normal);

    float NdotL = max(0.0, dot(normal, L));
    float NdotV = max(0.001, dot(normal, V)); // 스침각 및 음수 각도 보호

    // 5. Fresnel 계수 계산 (Schlick's approximation)
    // 물의 굴절률(IOR ≈ 1.333) 기준 수직 입사 반사율 F0 = ((1.333 - 1) / (1.333 + 1))^2 ≈ 0.02
    float F0 = 0.02;
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    // 6. 절차적 하늘 반사광 계산 (반사 벡터의 고도 및 태양광 헤이즈)
    vec3 skyHorizonColor = vec3(0.50, 0.70, 0.88);
    vec3 skyZenithColor  = vec3(0.06, 0.22, 0.48);
    float skyGradient = clamp(R.y, 0.0, 1.0);
    vec3 skyReflection = mix(skyHorizonColor, skyZenithColor, skyGradient);

    // 태양 방향으로의 은은한 반사광 (Sun Glare / Haze)
    float RdotL = max(0.0, dot(R, L));
    skyReflection += sunColor * pow(RdotL, 16.0) * 0.25;

    // 7. 바다 자체 색상 (수체 투과광 및 확산광)
    vec3 deepWaterColor    = vec3(0.015, 0.08, 0.18);
    vec3 shallowWaterColor = vec3(0.04, 0.25, 0.45);
    vec3 waterBody = mix(deepWaterColor, shallowWaterColor, 0.3 + 0.7 * NdotL);

    // 8. 태양광 직접 스펙큘러 하이라이트 (바다 전용 듀얼 로브 모델)
    // 태양 반대편으로 빛이 새는 현상(Light Leaking) 방지
    float sunFacing = smoothstep(-0.05, 0.15, dot(normal, L));

    // 1) 넓은 태양광 경로 (Sun Road): 넓은 파도면에 길게 퍼지는 부드러운 빛
    float specWide = pow(max(0.0, dot(normal, H)), 24.0) * 0.35;
    // 2) 잔물결 반짝임 (Sharp Glints): 파도 첨두에서 강하게 튀는 눈부신 섬광
    float specSharp = pow(max(0.0, dot(normal, H)), 256.0) * 1.5;

    // 스펙큘러에도 프레넬을 반영하여 스침각에서 더욱 사실적으로 빛남
    vec3 specular = sunColor * (specWide + specSharp) * sunFacing * (0.6 + 0.4 * fresnel);

    // 9. 최종 색상 합성: 프레넬에 따라 바다 본체 색상과 하늘 반사광 블렌딩 + 스펙큘러
    vec3 finalColor = mix(waterBody, skyReflection, fresnel) + specular;

    // 10. 포말(Foam) 합성: 파도 첨두에서 부서지는 하얀 거품 블렌딩
    vec3 foamColor = vec3(0.92, 0.96, 1.0);
    finalColor = mix(finalColor, foamColor * (0.8 + 0.3 * NdotL), foam);

    gl_FragColor = vec4(finalColor, 1.0);
}

