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
// MAX_STEPS: 광선(Ray)이 전진할 최대 걸음 수. 높을수록 정밀하지만 연산량이 늘어납니다.
const int MAX_STEPS = 100;
// MAX_DIST: 광선이 탐색할 최대 거리 (클리핑 평면 역할). 이 거리를 넘으면 허공(배경)으로 판정합니다.
const float MAX_DIST = 100.0;
// SURF_DIST: 표면 충돌 판정 임계값 (앱실론). 물체와의 거리가 이 값보다 작아지면 표면에 닿았다고 판단합니다.
const float SURF_DIST = 0.001;

// ============================================================================
// 2. 부호 거리 함수 (SDF: Signed Distance Functions)
// ============================================================================
// SDF는 공간상의 임의의 점 p에서 도형 표면까지의 '최단 거리'를 반환하는 함수입니다.
// - 반환값 > 0 : 점 p가 도형 바깥에 있음
// - 반환값 = 0 : 점 p가 도형 표면에 정확히 위치함
// - 반환값 < 0 : 점 p가 도형 내부에 있음

/**
 * 구(Sphere)의 SDF
 * @param p 현재 샘플링 위치 (구의 중심 기준 로컬 좌표)
 * @param r 구의 반지름
 */
float sdSphere(vec3 p, float r) {
    // 원점으로부터 점 p까지의 거리(length(p))에서 반지름(r)을 빼면 구 표면까지의 최단 거리가 됩니다.
    return length(p) - r;
}

/**
 * 정육면체/박스(Box)의 SDF
 * @param p 현재 샘플링 위치 (박스 중심 기준 로컬 좌표)
 * @param b 박스의 반크기 (가로/2, 세로/2, 깊이/2)
 */
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

/**
 * 수평 바닥 평면(Ground Plane, y = 0)의 SDF
 */
float sdPlane(vec3 p, float height) {
    return p.y - height;
}

/**
 * 부드러운 합집합 (Smooth Union)
 * 두 도형의 거리를 부드럽게 섞어 유기적인 형태(메타볼 효과)를 만듭니다.
 */
float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

/**
 * 씬 전체의 SDF를 정의하는 월드 맵(Scene Map) 함수
 * 공간상의 한 점 p로부터 씬 내의 '가장 가까운 물체까지의 거리'를 반환합니다.
 */
float map(vec3 p) {
    // 1) 시간에 따라 위아래로 움직이는 구 (중심: (sin(time), 1.0, 0.0), 반지름: 1.0)
    vec3 spherePos = vec3(sin(time * 1.5) * 1.2, 1.0 + cos(time * 2.0) * 0.3, 0.0);
    float sphereDist = sdSphere(p - spherePos, 1.0);

    // 2) 중앙에 놓인 모서리가 살짝 둥근 박스
    vec3 boxPos = vec3(0.0, 0.8, 0.0);
    float boxDist = sdBox(p - boxPos, vec3(0.75)) - 0.1; // -0.1로 모서리를 둥글게 만듦

    // 구와 박스를 부드럽게 결합 (Smooth Union)
    float objectDist = opSmoothUnion(sphereDist, boxDist, 0.5);

    // 3) 바닥 평면 (y = 0)
    float planeDist = sdPlane(p, 0.0);

    // 두 거리 중 더 작은 값(가장 가까운 물체까지의 거리)을 반환 -> 기본 합집합(Union)
    return min(objectDist, planeDist);
}

// ============================================================================
// 3. 핵심: 레이 마칭 루프 (Sphere Tracing)
// ============================================================================
/**
 * 광선 원점(ro)에서 광선 방향(rd)으로 전진하며 표면까지의 총 이동 거리를 구합니다.
 * @param ro Ray Origin (광선 출발점 = 카메라 위치)
 * @param rd Ray Direction (광선 진행 방향, 정규화된 단위 벡터)
 * @return 광선이 출발점으로부터 표면에 닿을 때까지 이동한 총 거리 (dO)
 */
float rayMarch(vec3 ro, vec3 rd) {
    // dO (Distance from Origin): 광선이 출발점(ro)에서부터 지금까지 전진한 누적 거리
    float dO = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        // 현재 광선 끝점의 3D 좌표 계산: 출발점 + (방향 * 누적 거리)
        vec3 p = ro + rd * dO;

        // 현재 위치 p에서 가장 가까운 물체까지의 '안전한 반경(최단 거리)'을 조회
        // 이 거리(dS) 안에는 아무런 물체도 없으므로, 광선을 dS만큼 한 번에 성큼 전진시켜도 절대 물체를 뚫고 지나가지 않습니다! (Sphere Tracing 원리)
        float dS = map(p);

        // 안전한 거리만큼 광선을 전진시킴
        dO += dS;

        // 종료 조건 1: 물체 표면에 충분히 가까워졌거나 (충돌 성공: dS < SURF_DIST)
        // 종료 조건 2: 최대 탐색 거리를 벗어난 경우 (배경/허공: dO > MAX_DIST)
        if (dS < SURF_DIST || dO > MAX_DIST) {
            break;
        }
    }

    return dO;
}

// ============================================================================
// 4. 법선 벡터(Normal) 계산 및 조명(Lighting)
// ============================================================================
/**
 * 표면 위 한 점 p에서의 법선 벡터(Normal Vector)를 구합니다.
 * SDF의 기울기(Gradient)가 곧 표면이 향하는 방향이므로, x, y, z축으로 아주 조금(e) 이동한 뒤 거리 변화량을 편미분(Central Difference)하여 구합니다.
 */
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    vec3 n = vec3(
        map(p + e.xyy) - map(p - e.xyy), // x축 방향 거리 변화량 (∂f/∂x)
        map(p + e.yxy) - map(p - e.yxy), // y축 방향 거리 변화량 (∂f/∂y)
        map(p + e.yyx) - map(p - e.yyx)  // z축 방향 거리 변화량 (∂f/∂z)
    );
    return normalize(n);
}

/**
 * 표면 위치 p에서의 조명(확산광 + 그림자)을 계산합니다.
 */
float getLight(vec3 p) {
    // 광원 위치 (위쪽 대각선에서 비추는 조명)
    vec3 lightPos = vec3(3.0, 5.0, -4.0);

    // 표면 점 p에서 광원을 향하는 단위 벡터 (Light Direction)
    vec3 l = normalize(lightPos - p);
    // 표면 점 p에서의 법선 벡터 (Surface Normal)
    vec3 n = getNormal(p);

    // 람베르트 확산광 (Lambertian Diffuse): 내적(dot)을 통해 빛을 정면으로 받을수록 밝아짐 (0.0 ~ 1.0)
    float dif = clamp(dot(n, l), 0.0, 1.0);

    // 레이 마칭 그림자(Hard Shadow) 계산:
    // 표면 점 p에서 광원 방향(l)으로 새로운 광선을 쏴서, 광원에 도달하기 전에 다른 물체에 가려지는지 확인합니다.
    // 주의: 자기 자신의 표면에 바로 부딪히는 현상(Self-intersection)을 막기 위해 법선 방향(n)으로 살짝(SURF_DIST * 2.0) 띄워서 출발합니다.
    float d = rayMarch(p + n * SURF_DIST * 2.0, l);
    if (d < length(lightPos - p)) {
        // 광원까지의 거리보다 짧은 거리에서 물체에 부딪혔다면 그림자 영역임!
        dif *= 0.2;
    }

    return dif;
}

// ============================================================================
// 5. 메인 함수: 카메라 레이(Ray) 생성 및 픽셀 색상 결정
// ============================================================================
void main() {
    // 1) 화면 UV 좌표 (0 ~ 1)를 중앙이 (0, 0)인 정규화 좌표 (-1 ~ 1)로 변환하고,
    // 화면 가로/세로 비율(Aspect Ratio)을 보정하여 도형이 찌그러지지 않게 합니다.
    vec2 uv = (vUV - 0.5) * 2.0;
    uv.x *= resolution.x / max(resolution.y, 1.0);

    // 2) 카메라 좌표계(Orthonormal Basis) 구성 및 광선(Ray) 생성
    // - ro (Ray Origin): 광선의 시작점 (카메라 위치)
    vec3 ro = cameraPos;

    // - 카메라가 바라보는 정면 방향(Forward), 오른쪽(Right), 위쪽(Up) 단위 벡터 계산
    vec3 forward = normalize(cameraTarget - cameraPos);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    // Babylon.js와 같은 왼손/오른손 좌표계 정렬을 위해 외적(cross)으로 카메라 축 생성
    vec3 right = normalize(cross(worldUp, forward));
    vec3 up = cross(forward, right);

    // - FOV(시야각)에 따른 가상 스크린 평면까지의 거리(초점 거리, Focal Length) 계산
    float focalLength = 1.0 / tan(cameraFov * 0.5);

    // - rd (Ray Direction): 카메라에서 현재 픽셀(uv.x, uv.y)을 향해 쏘아 보내는 광선의 방향 단위 벡터
    vec3 rd = normalize(forward * focalLength + right * uv.x + up * uv.y);

    // 3) 레이 마칭 실행!
    float d = rayMarch(ro, rd);

    // 4) 색상 렌더링
    // 기본 배경색 (Babylon.js scene.clearColor가 담긴 textureSampler에서 가져옴)
    vec3 bgColor = texture2D(textureSampler, vUV).rgb;
    vec3 col = bgColor;

    if (d < MAX_DIST) {
        // 광선이 물체 표면에 닿은 경우: 충돌 지점의 3D 월드 좌표 p를 계산
        vec3 p = ro + rd * d;

        // 조명 밝기 계산
        float dif = getLight(p);
        vec3 normal = getNormal(p);

        // 바닥 체커보드 패턴과 물체 기본 색상 구분
        vec3 baseColor = vec3(0.9, 0.88, 0.84);
        if (p.y < 0.01) {
            // 바닥(y ≈ 0)인 경우 격자 무늬를 입혀 공간감을 시각적으로 쉽게 확인하도록 함
            float checker = mod(floor(p.x) + floor(p.z), 2.0);
            baseColor = mix(vec3(0.25, 0.27, 0.32), vec3(0.45, 0.48, 0.54), checker);
        } else {
            // 물체인 경우 법선 벡터를 살짝 섞어 입체감 부여
            baseColor = mix(baseColor, normal * 0.5 + 0.5, 0.25);
        }

        // 주변광(Ambient) + 확산광(Diffuse) 결합
        vec3 ambient = vec3(0.18, 0.20, 0.25);
        col = baseColor * (ambient + dif * vec3(1.0, 0.96, 0.9));

        // 거리에 따른 안개(Distance Fog) 효과: 멀어질수록 배경색으로 자연스럽게 페이드아웃
        float fog = 1.0 - exp(-0.0015 * d * d);
        col = mix(col, bgColor, clamp(fog, 0.0, 1.0));
    }

    // 5) 감마 보정 (Linear -> sRGB 색공간 변환)
    col = pow(col, vec3(1.0 / 2.2));

    gl_FragColor = vec4(col, 1.0);
}
