import {
  Vector2,
  Vector3,
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

export interface DominantWaveMode {
  idx: number;
  deltaN: number;
  deltaM: number;
  kx: number;
  kz: number;
  normKx: number;
  normKz: number;
  amp: number;
}

export class FFTOcean {
  readonly N: number;
  readonly L: number;
  readonly windSpeed: number;
  readonly windDirection: Vector2;
  readonly amplitude: number;
  choppiness: number;
  dominantModes: DominantWaveMode[] = [];

  engine: WebGPUEngine;
  kx: Float32Array;
  kz: Float32Array;
  h0Real: Float32Array;
  h0Imag: Float32Array;
  omega: Float32Array;
  hReal: Float32Array;
  hImag: Float32Array;

  packedDisplacement: Float32Array;
  packedSlope: Float32Array;
  packedFoam: Float32Array;

  ifftHelper: IFFT2D;

  dispStorageBuffer: StorageBuffer;
  slopeStorageBuffer: StorageBuffer;
  foamStorageBuffer: StorageBuffer;

  displacementTexture: RenderTargetTexture;
  slopeTexture: RenderTargetTexture;
  foamTexture: RenderTargetTexture;

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

    this.packedDisplacement = new Float32Array(totalSize * 4);
    this.packedSlope = new Float32Array(totalSize * 4);
    this.packedFoam = new Float32Array(totalSize * 4);

    this.dispStorageBuffer = new StorageBuffer(
      this.engine,
      this.packedDisplacement.byteLength,
    );
    this.slopeStorageBuffer = new StorageBuffer(
      this.engine,
      this.packedSlope.byteLength,
    );
    this.foamStorageBuffer = new StorageBuffer(
      this.engine,
      this.packedFoam.byteLength,
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

    this.slopeTexture = new RenderTargetTexture("ocean_slope", this.N, scene, {
      generateMipMaps: false,
      type: Constants.TEXTURETYPE_FLOAT,
      format: Constants.TEXTUREFORMAT_RGBA,
      samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
      generateDepthBuffer: false,
      generateStencilBuffer: false,
      creationFlags: Constants.TEXTURE_CREATIONFLAG_STORAGE,
    });

    this.foamTexture = new RenderTargetTexture("ocean_foam", this.N, scene, {
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

    this.foamTexture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.foamTexture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;

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

        if (kLength < 1e-6) {
          this.h0Real[idx] = 0.0;
          this.h0Imag[idx] = 0.0;
          this.omega[idx] = 0.0;
          continue;
        }

        const kDotW =
          (kx / kLength) * windDirection.x + (kz / kLength) * windDirection.y;

        const kL2 = kSquared * (Lwind * Lwind);
        const decay = Math.exp(-1.0 / kL2) / (kSquared * kSquared);

        let phillips = 0.0;
        if (kDotW > 0.0) {
          phillips = A * decay * (kDotW * kDotW);
        }

        const u1 = Math.max(1e-7, Math.random());
        const u2 = Math.random();
        const randStd = Math.sqrt(-2.0 * Math.log(u1));
        const xi_r = randStd * Math.cos(2.0 * Math.PI * u2);
        const xi_i = randStd * Math.sin(2.0 * Math.PI * u2);

        const amp = Math.sqrt(phillips / 2.0);
        this.h0Real[idx] = xi_r * amp;
        this.h0Imag[idx] = xi_i * amp;

        this.omega[idx] = Math.sqrt(g * kLength);
      }
    }

    const modeList: DominantWaveMode[] = [];
    for (let m = 0; m < N; m++) {
      for (let n = 0; n < N; n++) {
        const idx = m * N + n;
        const r = this.h0Real[idx];
        const i = this.h0Imag[idx];
        const amp = Math.sqrt(r * r + i * i);
        if (amp > 1e-4) {
          const kx = this.kx[idx];
          const kz = this.kz[idx];
          const kLen = Math.sqrt(kx * kx + kz * kz);
          modeList.push({
            idx,
            deltaN: n - N / 2,
            deltaM: m - N / 2,
            kx,
            kz,
            normKx: kLen > 1e-6 ? kx / kLen : 0,
            normKz: kLen > 1e-6 ? kz / kLen : 0,
            amp,
          });
        }
      }
    }
    modeList.sort((a, b) => b.amp - a.amp);
    this.dominantModes = modeList.slice(0, 48);
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

      const kLenSq = kx * kx + kz * kz;
      if (kLenSq > 1e-10) {
        const invK = 1.0 / Math.sqrt(kLenSq);
        const normKx = kx * invK;
        const normKz = kz * invK;

        this.packedDisplacement[idx4] = h_i * normKx + h_r * normKz;
        this.packedDisplacement[idx4 + 1] = h_i * normKz - h_r * normKx;
      } else {
        this.packedDisplacement[idx4] = 0.0;
        this.packedDisplacement[idx4 + 1] = 0.0;
      }
      this.packedDisplacement[idx4 + 2] = h_r;
      this.packedDisplacement[idx4 + 3] = h_i;

      this.packedSlope[idx4] = -kx * h_i - kz * h_r;
      this.packedSlope[idx4 + 1] = kx * h_r - kz * h_i;
      this.packedSlope[idx4 + 2] = 0.0;
      this.packedSlope[idx4 + 3] = 0.0;

      if (kLenSq > 1e-10) {
        const invK = 1.0 / Math.sqrt(kLenSq);
        const kx2_invK = kx * kx * invK;
        const kz2_invK = kz * kz * invK;
        const kxkz_invK = kx * kz * invK;

        this.packedFoam[idx4] = kx2_invK * h_r - kz2_invK * h_i;
        this.packedFoam[idx4 + 1] = kx2_invK * h_i + kz2_invK * h_r;
        this.packedFoam[idx4 + 2] = kxkz_invK * h_r;
        this.packedFoam[idx4 + 3] = kxkz_invK * h_i;
      } else {
        this.packedFoam[idx4] = 0.0;
        this.packedFoam[idx4 + 1] = 0.0;
        this.packedFoam[idx4 + 2] = 0.0;
        this.packedFoam[idx4 + 3] = 0.0;
      }
    }

    this.dispStorageBuffer.update(this.packedDisplacement);
    this.slopeStorageBuffer.update(this.packedSlope);
    this.foamStorageBuffer.update(this.packedFoam);

    this.ifftHelper.execute(this.dispStorageBuffer, this.displacementTexture);
    this.ifftHelper.execute(this.slopeStorageBuffer, this.slopeTexture);
    this.ifftHelper.execute(this.foamStorageBuffer, this.foamTexture);
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

        this.hReal[idx] = (r1 + r2) * cosW - (i1 + i2) * sinW;
        this.hImag[idx] = (r1 - r2) * sinW + (i1 - i2) * cosW;
      }
    }
  }

  getWaterDisplacementAndNormal(
    worldX: number,
    worldZ: number,
    meshSize: number,
    uvScale: number,
  ): {
    height: number;
    dispX: number;
    dispZ: number;
    normal: Vector3;
  } {
    const N = this.N;
    const invNorm = 1.0 / (N * N);

    const u = ((worldX / meshSize + 0.5) * uvScale) % 1.0;
    const v = ((worldZ / meshSize + 0.5) * uvScale) % 1.0;
    const fracU = u < 0 ? u + 1.0 : u;
    const fracV = v < 0 ? v + 1.0 : v;

    let height = 0;
    let dispX = 0;
    let dispZ = 0;
    let slopeX = 0;
    let slopeZ = 0;

    const modes = this.dominantModes;
    const count = modes.length;

    for (let i = 0; i < count; i++) {
      const mode = modes[i];
      const idx = mode.idx;

      const hr = this.hReal[idx];
      const hi = this.hImag[idx];

      const phi = 2.0 * Math.PI * (mode.deltaN * fracU + mode.deltaM * fracV);
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      height += (hr * cosP - hi * sinP) * invNorm;

      const dCommon = (hi * cosP + hr * sinP) * invNorm;
      dispX -= mode.normKx * dCommon;
      dispZ -= mode.normKz * dCommon;

      const sCommon = (hr * sinP + hi * cosP) * invNorm;
      slopeX += -mode.kx * sCommon;
      slopeZ += -mode.kz * sCommon;
    }

    const slopeScale = uvScale * (this.L / meshSize);
    const normal = new Vector3(
      -slopeX * slopeScale,
      1.0,
      -slopeZ * slopeScale,
    ).normalize();

    return { height, dispX, dispZ, normal };
  }
}
