struct Uniforms {
    N: u32,
    log2N: u32,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
@group(0) @binding(1)
var<storage, read> inputSpectrum: array<vec4<f32>>;
@group(0) @binding(2)
var outputTex: texture_storage_2d<rgba32float, write>;

var<workgroup> s_val: array<vec4<f32>, 256>;

const PI: f32 = 3.141592653589793;

@compute @workgroup_size(256, 1)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let row = wid.x;

    let revIdx = reverseBits(tid) >> (32u - uniforms.log2N);
    let val = inputSpectrum[row * uniforms.N + tid];
    s_val[revIdx] = val;

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

            let u = s_val[uIdx];
            let v = s_val[vIdx];

            let t1_R = v.x * cosW - v.y * sinW;
            let t1_I = v.x * sinW + v.y * cosW;

            let t2_R = v.z * cosW - v.w * sinW;
            let t2_I = v.z * sinW + v.w * cosW;

            let t = vec4<f32>(t1_R, t1_I, t2_R, t2_I);

            s_val[uIdx] = u + t;
            s_val[vIdx] = u - t;
        }
        workgroupBarrier();
    }

    textureStore(outputTex, vec2<u32>(tid, row), s_val[tid]);
}
