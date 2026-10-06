struct Uniforms {
    N: u32,
    log2N: u32,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
@group(0) @binding(1)
var inputTex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2)
var outputTex: texture_storage_2d<rgba32float, write>;

var<workgroup> s_real: array<f32, 256>;
var<workgroup> s_imag: array<f32, 256>;

const PI: f32 = 3.141592653589793;

@compute @workgroup_size(256, 1)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let col = wid.x;

    let revIdx = reverseBits(tid) >> (32u - uniforms.log2N);
    let val = textureLoad(inputTex, vec2<u32>(col, tid));
    s_real[revIdx] = val.r;
    s_imag[revIdx] = val.g;

    workgroupBarrier();

    for(var s: u32 = 1u; s <= uniforms.log2N; s = s + 1u) {
        let m = 1u << s;
        let halfM = m >> 1u;
        let k = tid % halfM;
        let group = (tid / halfM) * m;
        let uIdx = group + k;
        let vIdx = uIdx + halfM;

        if tid < 128u {
            let angle = 2.0 * PI * f32(k) / f32(m);
            let cosW = cos(angle);
            let sinW = sin(angle);

            let uR = s_real[uIdx];
            let uI = s_imag[uIdx];
            let vR = s_real[vIdx];
            let vI = s_imag[vIdx];

            let tR = vR * cosW - vI * sinW;
            let tI = vR * sinW + vI * cosW;

            s_real[uIdx] = uR + tR;
            s_imag[uIdx] = uI + tI;
            s_real[vIdx] = uR - tR;
            s_imag[vIdx] = uI - tI;
        }
        workgroupBarrier();
    }

    // 정규화 및 (-1)^(x+y) 주파수 중심 이동 부호 보정
    let x = col;
    let y = tid;
    let sign = select(1.0, -1.0, ((x + y) & 1u) == 1u);
    let normFactor = f32(uniforms.N * uniforms.N);

    let finalHeight = (s_real[tid] * sign) / normFactor;
    let finalImag = (s_imag[tid] * sign) / normFactor; // 검증용 (0에 수렴해야 함)

    // R: 실수 수면 높이, G: 잔여 허수부, B: 0, A: 1
    textureStore(outputTex, vec2<u32>(col, tid), vec4<f32>(finalHeight, finalImag, 0.0, 1.0));
}
