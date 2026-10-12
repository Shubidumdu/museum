precision highp float;

varying float vDepthMetric;

void main() {
    gl_FragColor = vec4(vDepthMetric, 0.0, 0.0, 1.0);
}

