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
}

export class FFTOcean {
  readonly N: number;
  readonly L: number;
  readonly windSpeed: number;
  readonly windDirection: Vector2;
  readonly amplitude: number;

  engine: WebGPUEngine;
  kx: Float32Array;
  kz: Float32Array;
  h0Real: Float32Array;
  h0Imag: Float32Array;
  omega: Float32Array;
  hReal: Float32Array;
  hImag: Float32Array;

  packedSpectrum: Float32Array;
  packedSlopeX: Float32Array;
  packedSlopeZ: Float32Array;

  ifftHelper: IFFT2D;

  spectrumStorageBuffer: StorageBuffer;
  slopeXBuffer: StorageBuffer;
  slopeZBuffer: StorageBuffer;

  displacementTexture: RenderTargetTexture;
  slopeXTexture: RenderTargetTexture;
  slopeZTexture: RenderTargetTexture;

  constructor(
    scene: Scene,
    engine: WebGPUEngine,
    {
      gridSize,
      domainLength,
      windDirection,
      windSpeed,
      amplitude,
    }: OceanParameters,
  ) {
    this.engine = engine;
    this.N = gridSize;
    this.L = domainLength;
    this.windSpeed = windSpeed;
    this.windDirection = windDirection.normalize();
    this.amplitude = amplitude;

    const N = this.N;
    const totalSize = N * N;

    this.kx = new Float32Array(totalSize);
    this.kz = new Float32Array(totalSize);
    this.h0Imag = new Float32Array(totalSize);
    this.h0Real = new Float32Array(totalSize);
    this.hReal = new Float32Array(totalSize);
    this.hImag = new Float32Array(totalSize);
    this.omega = new Float32Array(totalSize);

    this.packedSpectrum = new Float32Array(totalSize * 2); // 256 * 256 * 2
    this.packedSlopeX = new Float32Array(totalSize * 2); // 256 * 256 * 2
    this.packedSlopeZ = new Float32Array(totalSize * 2); // 256 * 256 * 2

    this.spectrumStorageBuffer = new StorageBuffer(
      this.engine,
      this.packedSpectrum.byteLength,
    );
    this.slopeXBuffer = new StorageBuffer(
      this.engine,
      this.packedSlopeX.byteLength,
    );
    this.slopeZBuffer = new StorageBuffer(
      this.engine,
      this.packedSlopeZ.byteLength,
    );

    this.ifftHelper = new IFFT2D(scene, engine, this.N);

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

    this.slopeXTexture = new RenderTargetTexture(
      "ocean_slope_x",
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

    this.slopeZTexture = new RenderTargetTexture(
      "ocean_slope_z",
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

      this.packedSpectrum[i * 2] = h_r;
      this.packedSpectrum[i * 2 + 1] = h_i;

      // 🌟 추가: kx, kz 방향의 주파수 미분 (i * k * h)
      const kx = this.kx[i];
      const kz = this.kz[i];

      // X축 편미분 주파수 (packedSlopeX 버퍼에 [real, imag] 순서로 저장)
      this.packedSlopeX[i * 2] = -kx * h_i;
      this.packedSlopeX[i * 2 + 1] = kx * h_r;

      // Z축 편미분 주파수 (packedSlopeZ 버퍼에 [real, imag] 순서로 저장)
      this.packedSlopeZ[i * 2] = -kz * h_i;
      this.packedSlopeZ[i * 2 + 1] = kz * h_r;
    }

    // 3. GPU StorageBuffer로 데이터 전송
    this.spectrumStorageBuffer.update(this.packedSpectrum);
    this.slopeXBuffer.update(this.packedSlopeX);
    this.slopeZBuffer.update(this.packedSlopeZ);

    // 4. WebGPU 단 2패스 컴퓨트 셰이더로 IFFT 변환 실행!
    this.ifftHelper.execute(
      this.spectrumStorageBuffer,
      this.displacementTexture,
    );
    this.ifftHelper.execute(this.slopeXBuffer, this.slopeXTexture);
    this.ifftHelper.execute(this.slopeZBuffer, this.slopeZTexture);
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
