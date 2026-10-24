precision highp float;

// PostProcess 기본 화면 UV 좌표 (좌하단 (0,0) ~ 우상단 (1,1))
varying vec2 vUV;

// Babylon.js PostProcess가 기본으로 전달하는 이전 패스(배경) 텍스처
uniform sampler2D textureSampler;

// CPU(Babylon.js)에서 매 프레임 넘겨받는 Uniform 변수들
uniform vec2 resolution;   // 화면 해상도 (가로, 세로 픽셀 크기)
uniform float time;        // 경과 시간 (초 단위)
uniform vec3 cameraPos;    // 카메라(눈)의 3D 월드 좌표 -> Ray Origin (ro)
uniform vec3 cameraTarget; // 카메라가 바라보는 목표 지점의 3D 월드 좌표
uniform float cameraFov;   // 카메라 수직 시야각 (Field of View, 라디안)

// ============================================================================
// 1. 레이 마칭 하이퍼파라미터 설정 (상수)
// ============================================================================
// 도메인 워핑 적용 시 거리를 보수적으로(작게) 줄여서 전진하므로 MAX_STEPS를 넉넉히 잡습니다.
const int MAX_STEPS = 128;
const float MAX_DIST = 100.0;
const float SURF_DIST = 0.001;

// ============================================================================
// 2. 기본 부호 거리 함수 (SDF Primitives)
// ============================================================================

/**
 * 구(Sphere)의 SDF
 */
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

/**
 * 정육면체/박스(Box)의 SDF
 */
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

/**
 * 토러스(Torus, 도넛 형태)의 SDF
 * @param t.x 큰 반지름 (중심에서 튜브 중심까지), t.y 작은 반지름 (튜브 두께)
 */
float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

/**
 * 수평 바닥 평면(Ground Plane)의 SDF
 */
float sdPlane(vec3 p, float height) {
    return p.y - height;
}

/**
 * 부드러운 합집합 (Smooth Union)
 */
float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

/**
 * 부드러운 차집합 (Smooth Subtraction)
 * d2에서 d1을 부드럽게 파내어 조각품의 음각/구멍을 만듭니다.
 */
float opSmoothSubtraction(float d1, float d2, float k) {
    float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
    return mix(d2, -d1, h) + k * h * (1.0 - h);
}

// ============================================================================
// 3. 도메인 워핑 (Domain Warping: 공간 왜곡 연산)
// ============================================================================
// 도형 자체의 수식을 바꾸는 대신, SDF에 넣기 전의 3D 좌표(p) 자체를 휘거나 비틀어서
// 단순한 기하 도형을 복잡하고 유기적인 현대 조형물로 변형하는 기법입니다.

/**
 * 2D 회전 행렬 생성 헬퍼
 */
mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

/**
 * [워핑 1] 비틀기 (Twist)
 * y축 높이에 비례하여 xz 평면 좌표를 회전시킵니다.
 * @param p 원래 3D 좌표
 * @param k 비틀림 강도 (값이 클수록 꽈배기처럼 강하게 꼬임)
 */
vec3 opTwist(vec3 p, float k) {
    float c = cos(k * p.y);
    float s = sin(k * p.y);
    mat2 m = mat2(c, -s, s, c);
    return vec3(m * p.xz, p.y).xzy;
}

/**
 * [워핑 2] 구부리기 (Cheap Bend)
 * 높이에 따라 좌표를 곡선으로 휘어지게 만듭니다.
 */
vec3 opBend(vec3 p, float k) {
    float c = cos(k * p.y);
    float s = sin(k * p.y);
    mat2 m = mat2(c, -s, s, c);
    vec2 xy = m * p.xy;
    return vec3(xy, p.z);
}

/**
 * [워핑 3] 다중 파동 도메인 워핑 (Iterative Sinusoidal Domain Warp)
 * 좌표 p에 삼각함수 파동을 중첩해서 더해, 액체 금속이나 추상 조각처럼 일렁이는 왜곡을 만듭니다.
 * q = p + f(p), r = q + f(q) 형태로 반복할수록 더 오묘한 결이 생깁니다.
 */
vec3 opDomainWarp(vec3 p, float strength) {
    // 1차 워핑: 서로 다른 축(yzx)의 주기로 좌표를 흔듦
    vec3 q = p + strength * sin(p.yzx * 2.2 + time * 0.8);
    // 2차 워핑: 1차로 왜곡된 좌표(q)를 다시 입력으로 넣어 프랙탈처럼 겹주름을 만듦
    vec3 r = q + (strength * 0.5) * cos(q.zxy * 4.0 - time * 0.6);
    return r;
}

// ============================================================================
// 4. 월드 맵 (Scene Map): 도메인 워핑 조형물 설계
// ============================================================================
float map(vec3 p) {
    // --- 조형물 중심 좌표 설정 (바닥 위 y = 1.35 높이에 배치) ---
    vec3 q = p - vec3(0.0, 1.35, 0.0);

    // 전체 조형물을 천천히 회전시킴
    q.xz *= rot2D(time * 2.);

    // [단계 1] 비틀기(Twist): y축 높이에 따라 좌표를 꽈배기처럼 비틉니다.
    // 시간에 따라 비틀림 강도가 서서히 호흡하듯 변합니다.
    float twistAmount = 1.35 + cos(time * 0.5) * 0.45;
    vec3 warpedP = opTwist(q, twistAmount);

    // [단계 2] 살짝 휘어주기(Bend): 비대칭적인 조형미를 위해 약간의 곡률을 줍니다.
    warpedP = opBend(warpedP, 0.8 * cos(time * 0.4));

    // [단계 3] 파동 도메인 워핑: 표면에 유기적인 결을 주입합니다.
    warpedP = opDomainWarp(warpedP, 0.16);

    // --- 왜곡된 좌표(warpedP)를 단순한 기본 도형(Box + Torus)에 대입 ---
    // 1) 길쭉한 사각 기둥 (이미 좌표가 비틀려 있으므로 기둥이 나선형 조각으로 변함)
    float column = sdBox(warpedP, vec3(0.55, 1.05, 0.55)) - 0.08;

    // 2) 기둥을 감싸며 교차하는 토러스 링
    vec3 ringP = warpedP;
    ringP.xy *= rot2D(0.8);
    float ring = sdTorus(ringP, vec2(0.75, 0.22));

    // 3) 기둥과 링을 부드럽게 융합 (Smooth Union)
    float sculpture = opSmoothUnion(column, ring, 0.35);

    // 4) 안쪽을 구 형태로 부드럽게 파내어(Smooth Subtraction) 뚫린 공간감 형성
    float hollowSphere = sdSphere(q, 0.65);
    sculpture = opSmoothSubtraction(hollowSphere, sculpture, 0.25);

    // ⚠️ [중요: 립시츠 상수(Lipschitz) 보정]
    // 도메인 워핑으로 공간을 늘리고 비틀면, SDF가 반환하는 거리가 실제 유클리드 거리보다 커질 수 있습니다.
    // 그대로 전진하면 광선이 표면을 뚫고 지나가는 아티팩트(Over-stepping)가 생기므로,
    // 안전 계수(0.5)를 곱해 보폭을 줄여주어야 매끈한 표면이 렌더링됩니다.
    sculpture *= 0.5;

    // --- 바닥 평면 (왜곡하지 않은 원래 월드 좌표 p 사용) ---
    float planeDist = sdPlane(p, 0.0);

    return min(sculpture, planeDist);
}

// ============================================================================
// 5. 핵심: 레이 마칭 루프 (Sphere Tracing)
// ============================================================================
float rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = map(p);
        dO += dS;

        if (dS < SURF_DIST || dO > MAX_DIST) {
            break;
        }
    }

    return dO;
}

// ============================================================================
// 6. 법선 벡터(Normal), 앰비언트 오클루전(AO), 조명(Lighting)
// ============================================================================
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    vec3 n = vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    );
    return normalize(n);
}

/**
 * 앰비언트 오클루전 (Ambient Occlusion, AO)
 * 뒤틀린 조형물의 움푹 파인 주름이나 바닥 경계면에 자연스러운 음영을 더해 입체감을 극대화합니다.
 */
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.12 * float(i) / 4.0;
        float d = map(pos + h * nor);
        occ += (h - d) * sca;
        sca *= 0.95;
    }
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// ============================================================================
// 7. 메인 함수: 카메라 레이 생성 및 픽셀 셰이딩
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

    // 3) 레이 마칭 실행
    float d = rayMarch(ro, rd);

    // 4) 색상 및 조명 렌더링
    vec3 bgColor = texture2D(textureSampler, vUV).rgb;
    vec3 col = bgColor;

    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);
        vec3 v = -rd; // 시선 벡터 (표면 -> 카메라)

        // 주 광원 방향 및 확산광(Diffuse)
        vec3 lightPos = vec3(3.5, 6.0, -4.0);
        vec3 l = normalize(lightPos - p);
        float dif = clamp(dot(n, l), 0.0, 1.0);

        // 레이 마칭 그림자
        float shadowRay = rayMarch(p + n * SURF_DIST * 3.0, l);
        if (shadowRay < length(lightPos - p)) {
            dif *= 0.2;
        }

        // 하이라이트 반사광 (Blinn-Phong Specular) & 프레넬(Fresnel) 림 라이트
        vec3 halfVec = normalize(l + v);
        float spec = pow(clamp(dot(n, halfVec), 0.0, 1.0), 32.0) * dif;
        float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);

        // 앰비언트 오클루전(틈새 음영)
        float ao = calcAO(p, n);

        // 바닥과 조형물 재질 분리
        vec3 baseColor = vec3(0.88, 0.85, 0.80); // 조형물: 따뜻한 석고/세라믹 톤
        if (p.y < 0.01) {
            float checker = mod(floor(p.x) + floor(p.z), 2.0);
            baseColor = mix(vec3(0.20, 0.22, 0.27), vec3(0.36, 0.39, 0.45), checker);
            spec *= 0.2;
        } else {
            // 조형물에는 법선 방향에 따른 미세한 색조 변화를 섞어 곡면을 강조
            baseColor = mix(baseColor, n * 0.5 + 0.5, 0.18);
        }

        vec3 ambient = vec3(0.20, 0.23, 0.30) * ao;
        col = baseColor * (ambient + dif * vec3(1.0, 0.95, 0.88))
            + spec * vec3(1.0, 0.97, 0.92) * 0.45
            + fresnel * vec3(0.35, 0.45, 0.65) * 0.35 * ao;

        // 원거리 안개(Fog)
        float fog = 1.0 - exp(-0.0015 * d * d);
        col = mix(col, bgColor, clamp(fog, 0.0, 1.0));
    }

    // 5) 감마 보정 (Linear -> sRGB)
    col = pow(col, vec3(1.0 / 2.2));

    gl_FragColor = vec4(col, 1.0);
}
