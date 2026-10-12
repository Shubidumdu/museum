precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 screenSize;
uniform float outlineWidth;
uniform float depthThreshold;
uniform vec3 outlineColor;

void main() {
    vec4 sceneColor = texture2D(textureSampler, vUV);
    float centerDepth = texture2D(depthSampler, vUV).r;

    vec2 texel = (1.0 / screenSize) * outlineWidth;

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

    float gx = (d_tr + 2.0 * d_mr + d_br) - (d_tl + 2.0 * d_ml + d_bl);
    float gy = (d_tl + 2.0 * d_tc + d_tr) - (d_bl + 2.0 * d_bc + d_br);
    float edge = sqrt(gx * gx + gy * gy);

    float normalizedEdge = edge / max(0.001, centerDepth * 0.5 + 0.02);
    float depthMask = smoothstep(depthThreshold, depthThreshold * 1.8, normalizedEdge);

    float gax = (a_tr + 2.0 * a_mr + a_br) - (a_tl + 2.0 * a_ml + a_bl);
    float gay = (a_tl + 2.0 * a_tc + a_tr) - (a_bl + 2.0 * a_bc + a_br);
    float idEdge = sqrt(gax * gax + gay * gay);
    float idMask = smoothstep(0.15, 0.45, idEdge);

    float outlineMask = max(depthMask, idMask);

    vec3 finalColor = mix(sceneColor.rgb, outlineColor, outlineMask);

    gl_FragColor = vec4(finalColor, 1.0);
}
