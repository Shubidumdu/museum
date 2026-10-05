/**
 * ============================================================================
 * [FFT Ocean Simulation Engine]
 * Tessendorf 파도 알고리즘에 기반한 5단계 오션 파이프라인
 *
 * 1단계: 초기 스펙트럼 설계 (Phillips Spectrum + Gaussian Random Phase)
 * 2단계: 시간 전파 (Dispersion Relation + Euler Phase Rotation + Choppiness)
 * 3단계: 역 푸리에 변환 (Cooley-Tukey 2D IFFT + Displacement / Normal / Foam Map)
 * ============================================================================
 */

import {
  Constants,
  RawTexture,
  Vector2,
  type Scene,
  type AbstractEngine,
} from "@babylonjs/core";

export interface OceanParameters {
  gridSize: number; // 그리드 해상도 N (2의 거듭제곱: 64, 128, 256)
  domainLength: number; // 바다 패치의 물리적 크기 L (단위: m)
  windSpeed: number; // 풍속 (m/s)
  windDirection: Vector2; // 바람 진행 방향
  amplitude: number; // 파도 진폭 스케일 (Phillips A 계수)
  choppiness: number; // 파도 수평 수축 계수 (거스너 쵸피니스)
}

export class FFTOcean {
  public readonly N: number;
  public readonly L: number;
  public choppiness: number;

  // 1단계: 초기 스펙트럼 데이터
  private h0: Float32Array;
  private h0Minus: Float32Array;
  private omega: Float32Array; // 각속도 배열 sqrt(g * k)
  private kx: Float32Array; // 주파수 kx 성분
  private kz: Float32Array; // 주파수 kz 성분

  // 2단계/3단계: 복소수 버퍼 (실수, 허수 교대 저장)
  private complexHeight: Float32Array; // 수직 변위 h(k, t)
  private complexSlopeX: Float32Array; // x방향 기울기 (노멀용)
  private complexSlopeZ: Float32Array; // z방향 기울기 (노멀용)
  private complexDispX: Float32Array; // 수평 변위 Dx(k, t)
  private complexDispZ: Float32Array; // 수평 변위 Dz(k, t)

  // 3단계 결과 텍스처 데이터 버퍼
  // Displacement: RGBA32F -> (R: Dx, G: Dy(높이), B: Dz, A: 1.0)
  public displacementData: Float32Array;
  public displacementTexture: RawTexture;

  // Normal & Foam: RGBA32F -> (R: Nx, G: Ny, B: Nz, A: Foam)
  public normalFoamData: Float32Array;
  public normalFoamTexture: RawTexture;

  // 비트 반전 테이블 (FFT 가속용)
  private bitReversal: Uint32Array;

  constructor(scene: Scene, _engine: AbstractEngine, params: OceanParameters) {
    this.N = params.gridSize;
    this.L = params.domainLength;
    this.choppiness = params.choppiness;

    const N = this.N;
    const totalElements = N * N;

    // 버퍼 할당
    this.h0 = new Float32Array(totalElements * 2);
    this.h0Minus = new Float32Array(totalElements * 2);
    this.omega = new Float32Array(totalElements);
    this.kx = new Float32Array(totalElements);
    this.kz = new Float32Array(totalElements);

    this.complexHeight = new Float32Array(totalElements * 2);
    this.complexSlopeX = new Float32Array(totalElements * 2);
    this.complexSlopeZ = new Float32Array(totalElements * 2);
    this.complexDispX = new Float32Array(totalElements * 2);
    this.complexDispZ = new Float32Array(totalElements * 2);

    this.displacementData = new Float32Array(totalElements * 4);
    this.normalFoamData = new Float32Array(totalElements * 4);

    // 비트 반전 테이블 초기화 (쿨리-튜키 1D FFT용)
    this.bitReversal = this.initBitReversal(N);

    // [1단계 실행] 초기 Phillips 스펙트럼 및 가우시안 난수 생성 (초기화 시 1회만 계산)
    this.initInitialSpectrum(
      params.windDirection.normalize(),
      params.windSpeed,
      params.amplitude,
    );

    // [3단계 텍스처 초기화]
    // Vertex Shader 텍스처 페치(VTF) 호환성을 위해 NEAREST 샘플링 및 WRAP 래핑 설정
    this.displacementTexture = RawTexture.CreateRGBATexture(
      this.displacementData,
      N,
      N,
      scene,
      false,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT,
    );
    this.displacementTexture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.displacementTexture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;

    this.normalFoamTexture = RawTexture.CreateRGBATexture(
      this.normalFoamData,
      N,
      N,
      scene,
      false,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT,
    );
    this.normalFoamTexture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    this.normalFoamTexture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  }

  /**
   * ==========================================================================
   * [1단계: 초기 스펙트럼 설계 (Initial Spectrum Generation)]
   * ==========================================================================
   */
  private initInitialSpectrum(windDir: Vector2, windSpeed: number, A: number) {
    const N = this.N;
    const L = this.L;
    const g = 9.81;
    const L_wind = (windSpeed * windSpeed) / g;

    for (let m = 0; m < N; m++) {
      const kzVal = (2 * Math.PI * (m - N / 2)) / L;
      for (let n = 0; n < N; n++) {
        const kxVal = (2 * Math.PI * (n - N / 2)) / L;
        const idx = m * N + n;

        this.kx[idx] = kxVal;
        this.kz[idx] = kzVal;

        const kSq = kxVal * kxVal + kzVal * kzVal;
        const kLen = Math.sqrt(kSq);

        if (kLen < 1e-5) {
          this.h0[idx * 2] = 0;
          this.h0[idx * 2 + 1] = 0;
          this.omega[idx] = 0;
          continue;
        }

        // 분산 관계: omega = sqrt(g * k)
        this.omega[idx] = Math.sqrt(g * kLen);

        // Phillips Spectrum
        const kDotW = (kxVal / kLen) * windDir.x + (kzVal / kLen) * windDir.y;
        const damp = 0.05; // 잔물결 감쇠
        let phillips =
          A *
          (Math.exp(-1.0 / (kSq * L_wind * L_wind)) / (kSq * kSq)) *
          Math.pow(kDotW, 2.0) *
          Math.exp(-kSq * damp * damp);

        if (kDotW < 0) {
          phillips *= 0.12; // 역풍 성분 억제
        }

        // Box-Muller 가우시안 정규분포 난수
        const u1 = Math.max(1e-7, Math.random());
        const u2 = Math.random();
        const randStd = Math.sqrt(-2.0 * Math.log(u1));
        const xi_r = randStd * Math.cos(2.0 * Math.PI * u2);
        const xi_i = randStd * Math.sin(2.0 * Math.PI * u2);

        const amp = Math.SQRT1_2 * Math.sqrt(phillips);
        this.h0[idx * 2] = xi_r * amp;
        this.h0[idx * 2 + 1] = xi_i * amp;
      }
    }

    // -k 대칭 위치 h0*(-k) 계산
    for (let m = 0; m < N; m++) {
      for (let n = 0; n < N; n++) {
        const idx = m * N + n;
        const negM = (N - m) % N;
        const negN = (N - n) % N;
        const negIdx = negM * N + negN;

        this.h0Minus[idx * 2] = this.h0[negIdx * 2];
        this.h0Minus[idx * 2 + 1] = -this.h0[negIdx * 2 + 1];
      }
    }
  }

  /**
   * ==========================================================================
   * [2단계: 시간 전파 (Time Dispersion & Evolution)]
   * ==========================================================================
   */
  public update(t: number) {
    const N = this.N;
    const totalElements = N * N;

    for (let i = 0; i < totalElements; i++) {
      const om = this.omega[i] * t;
      const cosOm = Math.cos(om);
      const sinOm = Math.sin(om);

      const r0 = this.h0[i * 2];
      const i0 = this.h0[i * 2 + 1];

      const r0m = this.h0Minus[i * 2];
      const i0m = this.h0Minus[i * 2 + 1];

      // h(k, t) = h0(k)*e^(i*wt) + h0*(-k)*e^(-i*wt)
      const h_real = (r0 + r0m) * cosOm - (i0 + i0m) * sinOm;
      const h_imag = (r0 - r0m) * sinOm + (i0 - i0m) * cosOm;

      const idx2 = i * 2;
      this.complexHeight[idx2] = h_real;
      this.complexHeight[idx2 + 1] = h_imag;

      const kxVal = this.kx[i];
      const kzVal = this.kz[i];
      const kSq = kxVal * kxVal + kzVal * kzVal;
      const kLen = Math.sqrt(kSq);

      if (kLen > 1e-5) {
        const invK = 1.0 / kLen;
        const normKx = kxVal * invK;
        const normKz = kzVal * invK;

        // 수평 변위 (Choppiness)
        this.complexDispX[idx2] = h_imag * normKx;
        this.complexDispX[idx2 + 1] = -h_real * normKx;

        this.complexDispZ[idx2] = h_imag * normKz;
        this.complexDispZ[idx2 + 1] = -h_real * normKz;

        // 노멀용 경사도 (Slope)
        this.complexSlopeX[idx2] = -h_imag * kxVal;
        this.complexSlopeX[idx2 + 1] = h_real * kxVal;

        this.complexSlopeZ[idx2] = -h_imag * kzVal;
        this.complexSlopeZ[idx2 + 1] = h_real * kzVal;
      } else {
        this.complexDispX[idx2] = 0;
        this.complexDispX[idx2 + 1] = 0;
        this.complexDispZ[idx2] = 0;
        this.complexDispZ[idx2 + 1] = 0;
        this.complexSlopeX[idx2] = 0;
        this.complexSlopeX[idx2 + 1] = 0;
        this.complexSlopeZ[idx2] = 0;
        this.complexSlopeZ[idx2 + 1] = 0;
      }
    }

    // [3단계 실행] 2D IFFT 및 맵 생성
    this.computeIFFTAndMaps();

    // 텍스처 GPU 버퍼 갱신
    this.displacementTexture.update(this.displacementData);
    this.normalFoamTexture.update(this.normalFoamData);
  }

  /**
   * ==========================================================================
   * [3단계: 역 푸리에 변환 (IFFT: 주파수 공간 -> 공간 영역)]
   * ==========================================================================
   */
  private computeIFFTAndMaps() {
    const N = this.N;

    // 2D IFFT 실행
    this.fft2D(this.complexHeight);
    this.fft2D(this.complexDispX);
    this.fft2D(this.complexDispZ);
    this.fft2D(this.complexSlopeX);
    this.fft2D(this.complexSlopeZ);

    const chop = this.choppiness;
    // 시각적으로 뚜렷한 파고를 형성하기 위한 배율
    const waveScale = 120.0;
    const invN2 = (1.0 / (N * N)) * waveScale;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        const idx2 = idx * 2;
        const texIdx = idx * 4;

        // 체스판 부호 반전 (중앙 정렬)
        const sign = ((x + y) & 1) === 1 ? -1 : 1;

        // 변위 값 계산 (미터 단위 파고)
        const dy = this.complexHeight[idx2] * sign * invN2;
        const dx = this.complexDispX[idx2] * sign * invN2 * chop;
        const dz = this.complexDispZ[idx2] * sign * invN2 * chop;

        // 1) Displacement Map (R: dx, G: dy, B: dz, A: 1.0)
        this.displacementData[texIdx] = dx;
        this.displacementData[texIdx + 1] = dy;
        this.displacementData[texIdx + 2] = dz;
        this.displacementData[texIdx + 3] = 1.0;

        // 2) Normal Map 계산 (경사도 증폭 적용)
        const normalStrength = 2.8;
        const slopeX = this.complexSlopeX[idx2] * sign * invN2 * normalStrength;
        const slopeZ = this.complexSlopeZ[idx2] * sign * invN2 * normalStrength;
        const len = Math.sqrt(slopeX * slopeX + 1.0 + slopeZ * slopeZ);
        const nx = -slopeX / len;
        const ny = 1.0 / len;
        const nz = -slopeZ / len;

        // 3) Foam Map 계산 (자코비안 행렬식 기반)
        const xPrev = (x - 1 + N) % N;
        const xNext = (x + 1) % N;
        const yPrev = (y - 1 + N) % N;
        const yNext = (y + 1) % N;

        const signXP = ((xPrev + y) & 1) === 1 ? -1 : 1;
        const signXN = ((xNext + y) & 1) === 1 ? -1 : 1;
        const signYP = ((x + yPrev) & 1) === 1 ? -1 : 1;
        const signYN = ((x + yNext) & 1) === 1 ? -1 : 1;

        const dxL =
          this.complexDispX[(y * N + xPrev) * 2] * signXP * invN2 * chop;
        const dxR =
          this.complexDispX[(y * N + xNext) * 2] * signXN * invN2 * chop;
        const dzD =
          this.complexDispZ[(yPrev * N + x) * 2] * signYP * invN2 * chop;
        const dzU =
          this.complexDispZ[(yNext * N + x) * 2] * signYN * invN2 * chop;

        const dDxdx = (dxR - dxL) * 0.5;
        const dDzdz = (dzU - dzD) * 0.5;

        // 자코비안 J: 수평 변위의 수축률 측정
        const jacobian = (1.0 + dDxdx) * (1.0 + dDzdz);
        const foamThreshold = 0.55;
        const foam = Math.max(
          0.0,
          Math.min(1.0, (foamThreshold - jacobian) * 2.5),
        );

        // Normal & Foam Map (R: nx, G: ny, B: nz, A: foam)
        this.normalFoamData[texIdx] = nx;
        this.normalFoamData[texIdx + 1] = ny;
        this.normalFoamData[texIdx + 2] = nz;
        this.normalFoamData[texIdx + 3] = foam;
      }
    }
  }

  /**
   * Cooley-Tukey 2D Radix-2 IFFT
   */
  private fft2D(data: Float32Array) {
    const N = this.N;

    // 1. 행(Row)별 1D IFFT
    const rowBuf = new Float32Array(N * 2);
    for (let y = 0; y < N; y++) {
      const offset = y * N * 2;
      for (let x = 0; x < N; x++) {
        rowBuf[x * 2] = data[offset + x * 2];
        rowBuf[x * 2 + 1] = data[offset + x * 2 + 1];
      }
      this.fft1D(rowBuf, N);
      for (let x = 0; x < N; x++) {
        data[offset + x * 2] = rowBuf[x * 2];
        data[offset + x * 2 + 1] = rowBuf[x * 2 + 1];
      }
    }

    // 2. 열(Column)별 1D IFFT
    const colBuf = new Float32Array(N * 2);
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        const offset = (y * N + x) * 2;
        colBuf[y * 2] = data[offset];
        colBuf[y * 2 + 1] = data[offset + 1];
      }
      this.fft1D(colBuf, N);
      for (let y = 0; y < N; y++) {
        const offset = (y * N + x) * 2;
        data[offset] = colBuf[y * 2];
        data[offset + 1] = colBuf[y * 2 + 1];
      }
    }
  }

  /**
   * Cooley-Tukey 1D IFFT
   */
  private fft1D(buffer: Float32Array, N: number) {
    for (let i = 0; i < N; i++) {
      const j = this.bitReversal[i];
      if (j > i) {
        const rTemp = buffer[i * 2];
        const iTemp = buffer[i * 2 + 1];
        buffer[i * 2] = buffer[j * 2];
        buffer[i * 2 + 1] = buffer[j * 2 + 1];
        buffer[j * 2] = rTemp;
        buffer[j * 2 + 1] = iTemp;
      }
    }

    for (let len = 2; len <= N; len <<= 1) {
      const halfLen = len >> 1;
      const angle = (2.0 * Math.PI) / len;
      const wStepR = Math.cos(angle);
      const wStepI = Math.sin(angle);

      for (let i = 0; i < N; i += len) {
        let wR = 1.0;
        let wI = 0.0;

        for (let j = 0; j < halfLen; j++) {
          const uIdx = (i + j) * 2;
          const vIdx = (i + j + halfLen) * 2;

          const vR = buffer[vIdx];
          const vI = buffer[vIdx + 1];

          const tR = vR * wR - vI * wI;
          const tI = vR * wI + vI * wR;

          const uR = buffer[uIdx];
          const uI = buffer[uIdx + 1];

          buffer[uIdx] = uR + tR;
          buffer[uIdx + 1] = uI + tI;
          buffer[vIdx] = uR - tR;
          buffer[vIdx + 1] = uI - tI;

          const nextWR = wR * wStepR - wI * wStepI;
          wI = wR * wStepI + wI * wStepR;
          wR = nextWR;
        }
      }
    }
  }

  private initBitReversal(N: number): Uint32Array {
    const table = new Uint32Array(N);
    const bits = Math.round(Math.log2(N));
    for (let i = 0; i < N; i++) {
      let rev = 0;
      for (let b = 0; b < bits; b++) {
        rev = (rev << 1) | ((i >> b) & 1);
      }
      table[i] = rev;
    }
    return table;
  }
}
