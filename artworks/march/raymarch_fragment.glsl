precision highp float;

// PostProcess 기본 화면 UV 좌표 (좌하단 (0,0) ~ 우상단 (1,1))
varying vec2 vUV;

// Babylon.js PostProcess가 기본으로 전달하는 이전 패스(배경) 텍스처
uniform sampler2D textureSampler;

// CPU(Babylon.js)에서 매 프레임 넘겨받는 기본 Uniform 변수들
uniform vec2 resolution;    // 화면 해상도
uniform float time;         // 경과 시간 (초)
uniform vec3 cameraPos;     // 카메라 3D 월드 좌표 (Ray Origin)
uniform vec3 cameraTarget;  // 카메라 타겟 3D 월드 좌표
uniform float cameraFov;    // 카메라 수직 시야각 (라디안)

// 심비오트 인터랙션 Uniform 변수들
uniform vec3 mouseWorldPos; // 마우스 커서가 가리키는 3D 월드 좌표 (핵심 응집점)
uniform float pulseTension; // 마우스 클릭 시 수축/긴장 강도 (0.0 ~ 1.0)

// 스프링-댐퍼 물리로 마우스를 따라 유영하는 8개의 심비오트 유기체 노드 좌표
uniform vec3 node0;
uniform vec3 node1;
uniform vec3 node2;
uniform vec3 node3;
uniform vec3 node4;
uniform vec3 node5;
uniform vec3 node6;
uniform vec3 node7;

// ============================================================================
// 1. 레이 마칭 하이퍼파라미터 설정
// ============================================================================
const int MAX_STEPS = 110;
const float MAX_DIST = 40.0;
const float SURF_DIST = 0.0012;

// ============================================================================
// 2. 부호 거리 함수 (SDF Primitives & Smooth Operators)
// ============================================================================

/**
 * 구(Sphere)의 SDF - 개별 액체 방울(Blob)의 기본 형태
 */
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

/**
 * 캡슐/선분(Capsule)의 SDF
 * 두 유기체 노드(a, b) 사이를 잇는 끈적한 심비오트 점액 사슬(Tendril)을 표현합니다.
 */
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

/**
 * 부드러운 합집합 (Smooth Minimum / Smooth Union)
 * 두 도형이 가까워질 때 경계면이 액체 자석(Ferrofluid)처럼 끈적하게 달라붙으며 합쳐지게 만듭니다.
 * @param k 융합 반경 (값이 클수록 멀리서부터 끈적하게 엉겨 붙음)
 */
float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ============================================================================
// 3. 심비오트 도메인 워핑 (유기적 근육 결 & 촉수 일렁임)
// ============================================================================
/**
 * 공간 좌표 p를 다중 주파수 삼각파(Gyroid/Sinusoidal wave)로 일그러뜨려
 * 매끈한 구가 아니라 살아 숨 쉬며 꿈틀대는 외계 액체 생명체의 표면 질감을 만듭니다.
 */
vec3 opSymbioteWarp(vec3 p) {
    // 1차 큰 물결: 전체 덩어리가 울컥거리며 맥동하는 움직임
    vec3 q = p + 0.14 * sin(p.yzx * 2.6 + time * 2.8);
    // 2차 잔물결: 심비오트 특유의 핏줄/근육 결처럼 얽히는 고주파 일렁임
    q += (0.065 + pulseTension * 0.045) * cos(q.zxy * 6.2 - time * 4.2);
    return q;
}

/**
 * 두 노드 사이의 거리에 따라 늘어나다가 너무 멀어지면 끊어지는 점액질 촉수(Tendril) SDF
 */
float sdTendril(vec3 p, vec3 a, vec3 b, float baseRadius) {
    float span = length(b - a);
    // 두 노드가 멀어질수록 사슬이 얇아지도록 설정 (가까울 땐 두꺼운 줄기, 멀어지면 실처럼 가늘어짐)
    float stretchThinning = clamp(1.0 - span * 0.28, 0.02, 1.0);
    return sdCapsule(p, a, b, baseRadius * stretchThinning);
}

// ============================================================================
// 4. 월드 맵 (Scene Map): 마우스를 따라 군집하는 심비오트 유기체
// ============================================================================
float map(vec3 p) {
    // 공간을 심비오트 파동으로 왜곡한 좌표 생성
    vec3 wp = opSymbioteWarp(p);

    // 1) 마우스 위치에 자리 잡은 심비오트 코어(중심 핵)
    float coreRadius = 0.48 + 0.05 * sin(time * 4.0) + pulseTension * 0.12;
    float d = sdSphere(wp - mouseWorldPos, coreRadius);

    // 2) 물리 시뮬레이션으로 마우스를 쫓아다니는 8개의 유기체 클러스터 결합
    // 각 노드는 고유한 주기로 크기가 미세하게 맥동하며, opSmoothUnion으로 끈적하게 융합됩니다.
    float blendK = 0.52; // 액체처럼 서로 엉겨 붙는 점성 강도

    d = opSmoothUnion(d, sdSphere(wp - node0, 0.42 + 0.04 * sin(time * 3.1 + 0.0)), blendK);
    d = opSmoothUnion(d, sdSphere(wp - node1, 0.38 + 0.04 * sin(time * 3.5 + 1.0)), blendK);
    d = opSmoothUnion(d, sdSphere(wp - node2, 0.36 + 0.04 * sin(time * 2.9 + 2.0)), blendK);
    d = opSmoothUnion(d, sdSphere(wp - node3, 0.34 + 0.04 * sin(time * 3.8 + 3.0)), blendK);
    d = opSmoothUnion(d, sdSphere(wp - node4, 0.32 + 0.04 * sin(time * 3.3 + 4.0)), blendK);
    d = opSmoothUnion(d, sdSphere(wp - node5, 0.30 + 0.04 * sin(time * 4.1 + 5.0)), blendK);
    d = opSmoothUnion(d, sdSphere(wp - node6, 0.27 + 0.04 * sin(time * 3.6 + 6.0)), blendK);
    d = opSmoothUnion(d, sdSphere(wp - node7, 0.24 + 0.04 * sin(time * 4.4 + 7.0)), blendK);

    // 3) 심비오트 특유의 늘어나는 점액 사슬(Tendrils) 추가
    // 마우스를 빠르게 움직여 노드들이 벌어질 때, 노드들 사이에 거미줄/촉수 같은 액체 줄기가 연결됩니다.
    float tendrilK = 0.35;
    d = opSmoothUnion(d, sdTendril(wp, mouseWorldPos, node1, 0.14), tendrilK);
    d = opSmoothUnion(d, sdTendril(wp, node0, node2, 0.13), tendrilK);
    d = opSmoothUnion(d, sdTendril(wp, node1, node3, 0.12), tendrilK);
    d = opSmoothUnion(d, sdTendril(wp, node2, node4, 0.11), tendrilK);
    d = opSmoothUnion(d, sdTendril(wp, node3, node5, 0.10), tendrilK);
    d = opSmoothUnion(d, sdTendril(wp, node4, node6, 0.09), tendrilK);
    d = opSmoothUnion(d, sdTendril(wp, node5, node7, 0.08), tendrilK);
    d = opSmoothUnion(d, sdTendril(wp, node6, node0, 0.09), tendrilK);

    // 4) 주변을 맴돌며 본체로 흡수되거나 튀어나오는 작은 기생 방울(Micro-droplets)들
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float angle = time * (1.6 + fi * 0.35) + fi * 2.1;
        float dist = 0.85 + 0.45 * sin(time * 2.2 + fi * 1.7);
        vec3 dropOffset = vec3(
            cos(angle) * dist,
            sin(angle * 1.3) * dist * 0.8,
            sin(angle * 0.7) * dist
        );
        d = opSmoothUnion(d, sdSphere(wp - (mouseWorldPos + dropOffset), 0.13), 0.38);
    }

    // 5) 표면에 흐르는 자이로이드(Gyroid) 미세 근육 주름 변위
    float veins = dot(sin(wp * 9.0 + time * 3.0), cos(wp.yzx * 9.0 - time * 2.5)) * 0.012;
    d += veins;

    // 도메인 워핑으로 인한 Over-stepping 아티팩트 방지용 립시츠 보정 계수
    return d * 0.65;
}

// ============================================================================
// 5. 핵심: 레이 마칭 루프 (Sphere Tracing + 외곽 글로우 누적)
// ============================================================================
/**
 * 광선을 전진시키며 표면까지의 거리(x)와 광선이 물체 근처를 스쳐 지나간 최소 거리(y)를 함께 반환합니다.
 */
vec2 rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    float minDist = MAX_DIST;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = map(p);
        minDist = min(minDist, dS);
        dO += dS;

        if (dS < SURF_DIST || dO > MAX_DIST) {
            break;
        }
    }

    return vec2(dO, minDist);
}

// ============================================================================
// 6. 법선 벡터(Normal) 및 앰비언트 오클루전(AO)
// ============================================================================
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.002, 0.0);
    vec3 n = vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    );
    return normalize(n);
}

float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.02 + 0.14 * float(i) / 4.0;
        float d = map(pos + h * nor);
        occ += (h - d) * sca;
        sca *= 0.9;
    }
    return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

// ============================================================================
// 7. 메인 함수: 심비오트 유체 재질(Wet Obsidian & Iridescent Rim) 셰이딩
// ============================================================================
void main() {
    // 1) 화면 UV 정규화 (-1 ~ 1) 및 화면비 보정
    vec2 uv = (vUV - 0.5) * 2.0;
    uv.x *= resolution.x / max(resolution.y, 1.0);

    // 2) 카메라 좌표계 및 광선(Ray) 생성
    vec3 ro = cameraPos;
    vec3 forward = normalize(cameraTarget - cameraPos);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(worldUp, forward));
    vec3 up = cross(forward, right);

    float focalLength = 1.0 / tan(cameraFov * 0.5);
    vec3 rd = normalize(forward * focalLength + right * uv.x + up * uv.y);

    // 3) 배경 설정: 중심부가 은은하게 밝은 다크 비네팅(Vignette) 배경
    vec3 baseBg = texture2D(textureSampler, vUV).rgb;
    float radial = length(uv * 0.45);
    vec3 bgColor = mix(baseBg + vec3(0.03, 0.04, 0.07), baseBg * 0.4, clamp(radial, 0.0, 1.0));

    // 4) 레이 마칭 실행
    vec2 marchResult = rayMarch(ro, rd);
    float d = marchResult.x;
    float minDist = marchResult.y;

    vec3 col = bgColor;

    // 광선이 심비오트 주변을 스쳐 지나갈 때 은은한 다크 블루 바이오 오라(Glow) 추가
    float aura = exp(-minDist * 6.5) * 0.18;
    col += vec3(0.10, 0.22, 0.48) * aura;

    if (d < MAX_DIST) {
        // 심비오트 표면 충돌 지점
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        vec3 v = -rd; // 시선 벡터

        // 2개의 대비되는 조명 (위쪽 메인 키 라이트 + 아래쪽 차가운 림 보조광)
        vec3 lightDir1 = normalize(vec3(3.5, 5.5, -4.0) - p);
        vec3 lightDir2 = normalize(vec3(-4.0, -3.0, -2.0) - p);

        float dif1 = clamp(dot(n, lightDir1), 0.0, 1.0);
        float dif2 = clamp(dot(n, lightDir2), 0.0, 1.0);

        // 틈새 음영 (Ambient Occlusion)
        float ao = calcAO(p, n);

        // --- 심비오트 특유의 칠흑 같은 액체 타르(Obsidian Tar) 베이스 컬러 ---
        vec3 baseColor = vec3(0.012, 0.015, 0.022);

        // --- 이중 하이라이트 (Dual Specular Lobes) ---
        // 1) 넓은 유막 광택 (Oily Sheen): 근육의 덩어리감과 곡률을 보여줌
        vec3 h1 = normalize(lightDir1 + v);
        float broadSpec = pow(clamp(dot(n, h1), 0.0, 1.0), 16.0);

        // 2) 날카로운 젖은 점액 하이라이트 (Razor-sharp Wet Gloss): 표면이 촉촉하게 젖어 있는 느낌
        float wetSpec1 = pow(clamp(dot(n, h1), 0.0, 1.0), 110.0);
        vec3 h2 = normalize(lightDir2 + v);
        float wetSpec2 = pow(clamp(dot(n, h2), 0.0, 1.0), 80.0);

        // --- 프레넬 가장자리 반사광 (Iridescent Fresnel Rim Light) ---
        // 시선과 표면이 비스듬해지는 외곽 실루엣에 푸른빛/보랏빛 오일 광택을 입혀
        // 검은 액체가 어두운 배경 속에서도 선명한 입체감을 갖도록 합니다.
        float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.2);
        vec3 rimColor = mix(vec3(0.12, 0.30, 0.68), vec3(0.42, 0.18, 0.72), 0.5 + 0.5 * n.y);

        // --- 가짜 환경 반사 (Procedural Studio Reflection) ---
        // 반사 벡터(ref)의 방향에 따라 스튜디오 조명이 비치는 듯한 줄무늬 반사 추가
        vec3 ref = reflect(rd, n);
        float envBand = smoothstep(0.65, 0.92, sin(ref.y * 6.0 + ref.x * 2.5));

        // 최종 표면 색상 합성
        col = baseColor * (0.2 + 0.8 * dif1) * ao;
        col += vec3(0.09, 0.13, 0.22) * broadSpec * dif1 * ao;       // 은은한 속광택
        col += rimColor * fresnel * (0.55 + 0.45 * ao);              // 푸른/보랏빛 실루엣 림 라이트
        col += vec3(0.25, 0.38, 0.65) * dif2 * 0.25 * ao;            // 하단 반사광
        col += vec3(0.85, 0.92, 1.0) * envBand * fresnel * 0.45;     // 스튜디오 환경 반사
        col += vec3(1.0, 0.98, 0.95) * (wetSpec1 * 1.15 + wetSpec2 * 0.45); // 날카로운 하이라이트
    }

    // 5) 감마 보정 (Linear -> sRGB)
    col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));

    gl_FragColor = vec4(col, 1.0);
}
