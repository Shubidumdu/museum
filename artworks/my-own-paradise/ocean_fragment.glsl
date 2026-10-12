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
    vec2 slopes = texture2D(slopeMap, vTiledUV).rg;
    float slopeX = slopes.r;
    float slopeZ = slopes.g;

    float slopeScale = uvScale * (domainLength / meshSize);
    vec3 normal = normalize(vec3(-slopeX * slopeScale, 1.0, -slopeZ * slopeScale));

    vec3 J_data = texture2D(foamMap, vTiledUV).rgb;
    float Jxx = J_data.r * slopeScale;
    float Jzz = J_data.g * slopeScale;
    float Jxz = J_data.b * slopeScale;

    float c = choppiness;
    float jacobian = (1.0 - c * Jxx) * (1.0 - c * Jzz) - (c * Jxz) * (c * Jxz);

    float foamThreshold = 0.8;
    float foam = clamp((foamThreshold - jacobian) * 1.6, 0.0, 1.0);

    vec3 L = normalize(sunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);
    vec3 R = reflect(-V, normal);

    float NdotL = max(0.0, dot(normal, L));
    float NdotV = max(0.001, dot(normal, V));

    float F0 = 0.02;
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    vec3 skyHorizonColor = vec3(0.50, 0.70, 0.88);
    vec3 skyZenithColor  = vec3(0.06, 0.22, 0.48);
    float skyGradient = clamp(R.y, 0.0, 1.0);
    vec3 skyReflection = mix(skyHorizonColor, skyZenithColor, skyGradient);

    float RdotL = max(0.0, dot(R, L));
    skyReflection += sunColor * pow(RdotL, 16.0) * 0.25;

    vec3 deepWaterColor    = vec3(0.0, .0, .0) * 1.;
    vec3 shallowWaterColor = vec3(0.2, 0.2, 0.2) * 1.;
    vec3 waterBody;
    if  (NdotL >= 0.7) { waterBody = shallowWaterColor; }
    else                   { waterBody = deepWaterColor; }

    float sunFacing = smoothstep(-0.05, 0.15, dot(normal, L));

    float specWide = pow(max(0.0, dot(normal, H)), 24.0) * 0.35;
    float specSharp = pow(max(0.0, dot(normal, H)), 256.0) * 1.5;

    vec3 specular = sunColor * (specWide + specSharp) * sunFacing * (0.6 + 0.4 * fresnel);

    vec3 finalColor = log(vec3(foam) + fresnel);

    gl_FragColor = vec4(finalColor, 1.0);
}
