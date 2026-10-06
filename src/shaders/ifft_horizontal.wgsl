struct Uniforms {
    N: u32,
    log2N: u32,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
@group(0) @binding(1)
var<storage, read> inputSpectrum: array<vec2<f32>>;
@group(0) @binding(2)
var outputTex: texture_storage_2d<rgba32float, write>;

var<workgroup> s_real: array<f32, 256>;
var<workgroup> s_imag: array<f32, 256>;

const PI: f32 = 3.141592653589793;

@compute @workgroup_size(256, 1)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let row = wid.x;

    // Bit-reversal 인덱스로 공유 메모리에 적재
    let revIdx = reverseBits(tid) >> (32u - uniforms.log2N);
    let val = inputSpectrum[row * uniforms.N + tid];
    s_real[revIdx] = val.x;
    s_imag[revIdx] = val.y;

    workgroupBarrier();

    // Cooley-Tukey Butterfly
    for(var s: u32 = 1u; s <= uniforms.log2N; s = s + 1u) {
        let m = 1u << s;
        let halfM = m >> 1u;
        let k = tid % halfM;
        let group = (tid / halfM) * m;
        let uIdx = group + k;
        let vIdx = uIdx + halfM;

        if tid < 128u {
            let angle = 2.0 * PI * f32(k) / f32(m); // IFFT: +angle
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

    textureStore(outputTex, vec2<u32>(tid, row), vec4<f32>(s_real[tid], s_imag[tid], 0.0, 1.0));
}
