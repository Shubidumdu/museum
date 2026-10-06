import {
  Constants,
  ComputeShader,
  RenderTargetTexture,
  Scene,
  StorageBuffer,
  UniformBuffer,
  WebGPUEngine,
} from "@babylonjs/core";
import ifftHorizontalComputeShader from "../shaders/ifft_horizontal.wgsl?raw";
import ifftVerticalComputeShader from "../shaders/ifft_vertical.wgsl?raw";

export class IFFT2D {
  private uniformsUBO: UniformBuffer;
  private horizontalCS: ComputeShader;
  private verticalCS: ComputeShader;

  // 중간 연산용 Storage Texture
  private intermediateTex: RenderTargetTexture;

  public readonly N: number;
  public readonly log2N: number;

  constructor(scene: Scene, engine: WebGPUEngine, N = 256) {
    if (N !== 256) {
      throw new Error(
        `[WebGPU_IFFT2D] Current shader workgroup is fixed to N=256.`,
      );
    }

    this.N = N;
    this.log2N = Math.log2(N);

    // 1. 중간 Storage Texture 생성 (WebGPU Storage Binding 지원)
    this.intermediateTex = new RenderTargetTexture(
      "ifft_intermediate",
      N,
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

    // 2. Uniform Buffer 생성 및 설정
    this.uniformsUBO = new UniformBuffer(engine);
    this.uniformsUBO.addUniform("N", 1);
    this.uniformsUBO.addUniform("log2N", 1);
    this.uniformsUBO.create();

    this.uniformsUBO.updateUInt("N", this.N);
    this.uniformsUBO.updateUInt("log2N", this.log2N);
    this.uniformsUBO.update();

    // 3. Compute Shader 인스턴스 빌드
    this.horizontalCS = new ComputeShader(
      "horizontalIFFT_CS",
      engine,
      { computeSource: ifftHorizontalComputeShader },
      {
        bindingsMapping: {
          uniforms: { group: 0, binding: 0 },
          inputSpectrum: { group: 0, binding: 1 },
          outputTex: { group: 0, binding: 2 },
        },
      },
    );
    this.horizontalCS.setUniformBuffer("uniforms", this.uniformsUBO);

    this.verticalCS = new ComputeShader(
      "verticalIFFT_CS",
      engine,
      { computeSource: ifftVerticalComputeShader },
      {
        bindingsMapping: {
          uniforms: { group: 0, binding: 0 },
          inputTex: { group: 0, binding: 1 },
          outputTex: { group: 0, binding: 2 },
        },
      },
    );
    this.verticalCS.setUniformBuffer("uniforms", this.uniformsUBO);
  }

  /**
   * 주파수 데이터를 담은 StorageBuffer를 받아 2D IFFT를 실행하고 targetTexture에 높이 맵을 기록합니다.
   */
  public execute(
    inputSpectrumBuffer: StorageBuffer,
    targetTexture: RenderTargetTexture,
  ): void {
    // 1. 가로 패스 (Row IFFT): StorageBuffer -> intermediateTex
    this.horizontalCS.setStorageBuffer("inputSpectrum", inputSpectrumBuffer);
    this.horizontalCS.setStorageTexture("outputTex", this.intermediateTex);
    this.horizontalCS.dispatch(this.N, 1, 1);

    // 2. 세로 패스 (Column IFFT): intermediateTex -> targetTexture
    this.verticalCS.setStorageTexture("inputTex", this.intermediateTex);
    this.verticalCS.setStorageTexture("outputTex", targetTexture);
    this.verticalCS.dispatch(this.N, 1, 1);
  }

  public dispose(): void {
    this.intermediateTex.dispose();
    this.uniformsUBO.dispose();
  }
}
