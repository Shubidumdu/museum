import {
  Vector2,
  type Scene,
  RenderTargetTexture,
  StorageBuffer,
  WebGPUEngine,
  Constants,
} from "@babylonjs/core";
import { IFFT2D } from "../../src/helpers/ifft2d";

export interface OceanParameters {
  gridSize: number;
  domainLength: number;
  windSpeed: number;
  windDirection: Vector2;
  amplitude: number;
  choppiness?: number;
}

export class FFTOcean {
  readonly N: number;
  readonly L: number;
  readonly windSpeed: number;
  readonly windDirection: Vector2;
  readonly amplitude: number;
  choppiness: number;

  engine: WebGPUEngine;
  kx: Float32Array;
  kz: Float32Array;
  h0Real: Float32Array;
  h0Imag: Float32Array;
  omega: Float32Array;
  hReal: Float32Array;
  hImag: Float32Array;

  packedDisplacement: Float32Array; // [real(Dx+i*Dz), imag(Dx+i*Dz), real(h), imag(h)]
  packedSlope: Float32Array; // [real(Sx+i*Sz), imag(Sx+i*Sz), 0, 0]

  ifftHelper: IFFT2D;

  dispStorageBuffer: StorageBuffer;
  slopeStorageBuffer: StorageBuffer;

  displacementTexture: RenderTargetTexture; // R: Dx, G: Dz, B: Dy(h), A: 0
  slopeTexture: RenderTargetTexture; // R: SlopeX, G: SlopeZ, B: 0, A: 0

  constructor(
    scene: Scene,
    engine: WebGPUEngine,
    {
      gridSize,
      domainLength,
      windDirection,
      windSpeed,
      amplitude,
      choppiness = 1.2,
    }: OceanParameters,
  ) {
    this.engine = engine;
    this.N = gridSize;
    this.L = domainLength;
    this.windSpeed = windSpeed;
    this.windDirection = windDirection.normalize();
    this.amplitude = amplitude;
    this.choppiness = choppiness;

    const N = this.N;
    const totalSize = N * N;

    this.kx = new Float32Array(totalSize);
    this.kz = new Float32Array(totalSize);
    this.h0Imag = new Float32Array(totalSize);
    this.h0Real = new Float32Array(totalSize);
    this.hReal = new Float32Array(totalSize);
    this.hImag = new Float32Array(totalSize);
    this.omega = new Float32Array(totalSize);

    // 4채널(vec4) 패킹 버퍼 할당
    this.packedDisplacement = new Float32Array(totalSize * 4); // [real(Dx+i*Dz), imag(Dx+i*Dz), real(h), imag(h)]
    this.packedSlope = new Float32Array(totalSize * 4); // [real(Sx+i*Sz), imag(Sx+i*Sz), 0, 0]

    this.dispStorageBuffer = new StorageBuffer(
      this.engine,
      this.packedDisplacement.byteLength,
    );
    this.slopeStorageBuffer = new StorageBuffer(
      this.engine,
      this.packedSlope.byteLength,
    );

    this.ifftHelper = new IFFT2D(scene, engine, this.N);

    // 4채널 통합 변위 텍스처 (R: Dx, G: Dz, B: Dy, A: 0)
    this.displacementTexture = new RenderTargetTexture(
      "ocean_displacement",
      this.N,
      scene,
      {
        generateMipMaps: false,
        type: Constants.TEXTURETYPE_FLOAT,
        format: Constants.TEXTUREFORMAT_RGBA,
        samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        generateDepthBuffer: false,
        generateStencilBuffer: false,
        creationFlags: Constants.TEXTURE_CREATIONFLAG_STORAGE,
      },
    );

    // 4채널 통합 기울기 텍스처 (R: SlopeX, G: SlopeZ, B: 0, A: 0)
    this.slopeTexture = new RenderTargetTexture("ocean_slope", this.N, scene, {
      generateMipMaps: false,
      type: Constants.TEXTURETYPE_FLOAT,
      format: Constants.TEXTUREFORMAT_RGBA,
      samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      generateDepthBuffer: false,
      generateStencilBuffer: false,
      creationFlags: Constants.TEXTURE_CREATIONFLAG_STORAGE,
    });

    this.displacementTexture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.displacementTexture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;

    this.slopeTexture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.slopeTexture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;

    this.initSpectrum();
  }

  private initSpectrum() {
    const N = this.N;
    const L = this.L;
    const g = 9.81;
    const windDirection = this.windDirection;
    const windSpeed = this.windSpeed;
    const A = this.amplitude;
    const Lwind = Math.pow(windSpeed, 2) / g;

    for (let m = 0; m < N; m++) {
      const kz = (2 * Math.PI * (m - N / 2)) / L;

      for (let n = 0; n < N; n++) {
        const kx = (2 * Math.PI * (n - N / 2)) / L;
        const idx = m * N + n;

        this.kx[idx] = kx;
        this.kz[idx] = kz;

        const kSquared = kx * kx + kz * kz;
        const kLength = Math.sqrt(kSquared);

        // 1. 0 주파수(중심점) 완벽 방어
        if (kLength < 1e-6) {
          this.h0Real[idx] = 0.0;
          this.h0Imag[idx] = 0.0;
          this.omega[idx] = 0.0;
          continue;
        }

        // 2. 방향 단위 벡터 내적
        const kDotW =
          (kx / kLength) * windDirection.x + (kz / kLength) * windDirection.y;

        // 3. Phillips Spectrum 올바른 차수 계산
        // - 분모는 k^4 (즉 kSquared^2)
        // - 지수 분모는 (k * Lwind)^2 (즉 kSquared * Lwind^2)
        const kL2 = kSquared * (Lwind * Lwind);
        const decay = Math.exp(-1.0 / kL2) / (kSquared * kSquared);

        // 역풍 억제 및 방향 제곱 항
        let phillips = 0.0;
        if (kDotW > 0.0) {
          phillips = A * decay * (kDotW * kDotW);
        }

        // 4. Box-Muller 가우시안 복소 난수
        const u1 = Math.max(1e-7, Math.random());
        const u2 = Math.random();
        const randStd = Math.sqrt(-2.0 * Math.log(u1));
        const xi_r = randStd * Math.cos(2.0 * Math.PI * u2);
        const xi_i = randStd * Math.sin(2.0 * Math.PI * u2);

        // 5. 초기 진폭 결합
        const amp = Math.sqrt(phillips / 2.0);
        this.h0Real[idx] = xi_r * amp;
        this.h0Imag[idx] = xi_i * amp;

        // 6. 각속도
        this.omega[idx] = Math.sqrt(g * kLength);
      }
    }
  }

  update(t: number) {
    this.updateSpectrum(t);

    const total = this.N * this.N;

    for (let i = 0; i < total; i++) {
      const h_r = this.hReal[i];
      const h_i = this.hImag[i];

      const kx = this.kx[i];
      const kz = this.kz[i];

      const idx4 = i * 4;

      // 1. 수평 변위(Dx, Dz) 및 수직 높이(Dy) 패킹
      // 복소 결합: D_xz = Dx + i * Dz
      // IFFT 후: R 채널 = Dx, G 채널 = Dz, B 채널 = Dy (h_r)
      const kLenSq = kx * kx + kz * kz;
      if (kLenSq > 1e-10) {
        const invK = 1.0 / Math.sqrt(kLenSq);
        const normKx = kx * invK;
        const normKz = kz * invK;

        // D_xz = (Dx_real - Dz_imag) + i*(Dx_imag + Dz_real)
        // Dx_real = h_i * normKx, Dx_imag = -h_r * normKx
        // Dz_real = h_i * normKz, Dz_imag = -h_r * normKz
        // D_xz_real = h_i * normKx - (-h_r * normKz) = h_i * normKx + h_r * normKz
        // D_xz_imag = -h_r * normKx + h_i * normKz = h_i * normKz - h_r * normKx
        this.packedDisplacement[idx4] = h_i * normKx + h_r * normKz;
        this.packedDisplacement[idx4 + 1] = h_i * normKz - h_r * normKx;
      } else {
        this.packedDisplacement[idx4] = 0.0;
        this.packedDisplacement[idx4 + 1] = 0.0;
      }
      // 수직 높이 h (Real, Imag) -> IFFT 후 B 채널에 h_r 기록
      this.packedDisplacement[idx4 + 2] = h_r;
      this.packedDisplacement[idx4 + 3] = h_i;

      // 2. 기울기(SlopeX, SlopeZ) 패킹
      // 복소 결합: S_comb = SlopeX + i * SlopeZ
      // IFFT 후: R 채널 = SlopeX, G 채널 = SlopeZ
      // Sx_real = -kx * h_i, Sx_imag = kx * h_r
      // Sz_real = -kz * h_i, Sz_imag = kz * h_r
      // S_comb_real = -kx * h_i - (kz * h_r)
      // S_comb_imag = kx * h_r + (-kz * h_i)
      this.packedSlope[idx4] = -kx * h_i - kz * h_r;
      this.packedSlope[idx4 + 1] = kx * h_r - kz * h_i;
      this.packedSlope[idx4 + 2] = 0.0;
      this.packedSlope[idx4 + 3] = 0.0;
    }

    // 3. GPU StorageBuffer로 데이터 전송
    this.dispStorageBuffer.update(this.packedDisplacement);
    this.slopeStorageBuffer.update(this.packedSlope);

    // 4. WebGPU 단 2번의 IFFT 변환 실행! (Displacement 1회 + Slope 1회)
    this.ifftHelper.execute(this.dispStorageBuffer, this.displacementTexture);
    this.ifftHelper.execute(this.slopeStorageBuffer, this.slopeTexture);
  }

  updateSpectrum(t: number) {
    const N = this.N;

    for (let m = 0; m < N; m++) {
      const neg_m = (N - m) % N;

      for (let n = 0; n < N; n++) {
        const neg_n = (N - n) % N;

        const idx = m * N + n;
        const neg_idx = neg_m * N + neg_n;

        const r1 = this.h0Real[idx];
        const i1 = this.h0Imag[idx];

        const r2 = this.h0Real[neg_idx];
        const i2 = this.h0Imag[neg_idx];

        const om = this.omega[idx] * t;
        const cosW = Math.cos(om);
        const sinW = Math.sin(om);

        // Tessendorf
        this.hReal[idx] = (r1 + r2) * cosW - (i1 + i2) * sinW;
        this.hImag[idx] = (r1 - r2) * sinW + (i1 - i2) * cosW;
      }
    }
  }
}
