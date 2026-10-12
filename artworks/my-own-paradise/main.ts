import {
  WebGPUEngine,
  Scene,
  Vector2,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
  DirectionalLight,
  MeshBuilder,
  Effect,
  ShaderMaterial,
  PostProcess,
  Constants,
  Texture,
  TransformNode,
  DracoCompression,
  Scalar,
  ImportMeshAsync,
} from "@babylonjs/core";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/loaders/glTF";
import { setupArtworkViewer } from "../../src/components/viewer-shell.ts";
import { FFTOcean } from "./FFTOcean.ts";
import oceanVertexShader from "./ocean_vertex.glsl?raw";
import oceanFragmentShader from "./ocean_fragment.glsl?raw";
import oceanDepthVertexShader from "./ocean_depth_vertex.glsl?raw";
import oceanDepthFragmentShader from "./ocean_depth_fragment.glsl?raw";
import outlinePostProcessShader from "./outline_postprocess.glsl?raw";
import { createScreentoneMaterial } from "./ScreentoneCelShader.ts";
import bedGlbUrl from "./bed.glb";
import bedBaseColorUrl from "./bed_BaseColor.png";
import bedNormalUrl from "./bed_NormalGL.png";
import bedAOUrl from "./bed_AO.png";
import { degToRad } from "../../src/utils/math";

DracoCompression.Configuration = {
  decoder: {
    wasmUrl: "/draco/draco_wasm_wrapper_gltf.js",
    wasmBinaryUrl: "/draco/draco_decoder_gltf.wasm",
    fallbackUrl: "/draco/draco_decoder_gltf.js",
  },
};

setupArtworkViewer("my-own-paradise");

const canvas = document.getElementById("artworkCanvas") as HTMLCanvasElement;

async function initializeOceanApp() {
  const isWebGPUSupported =
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    (await WebGPUEngine.IsSupportedAsync);

  if (!isWebGPUSupported) {
    console.error(
      "⚠️ WebGPU not available. WebGPU is required for this artwork.",
    );
    return;
  }

  console.info("⚡ WebGPUEngine enabled for FFT Ocean!");
  const engine = new WebGPUEngine(canvas, {
    antialias: false,
    powerPreference: "high-performance",
    enableGPUDebugMarkers: true,
  });
  await engine.initAsync();

  engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
  engine.resize();

  const scene = createFFTOceanScene(engine, canvas);

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
    engine.resize();
  });
}

export function createFFTOceanScene(
  engine: WebGPUEngine,
  canvas: HTMLCanvasElement,
): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 1, 1.0);

  const camera = new ArcRotateCamera(
    "Camera",
    degToRad(78),
    degToRad(81.6),
    18.7843,
    new Vector3(0, 1, 0),
    scene,
  );

  camera.attachControl(canvas, true);
  camera.wheelPrecision = 25;
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 32;
  camera.upperBetaLimit = degToRad(90);

  const sunLight = new DirectionalLight(
    "sunLight",
    new Vector3(-0.6, -0.7, 0.4).normalize(),
    scene,
  );
  sunLight.intensity = 1.6;
  sunLight.diffuse = new Color3(1.5, 1.5, 1.5);

  const meshSize = 140;
  const oceanMesh = MeshBuilder.CreateGround(
    "oceanPlane",
    {
      width: meshSize,
      height: meshSize,
      subdivisions: 256,
    },
    scene,
  );
  oceanMesh.forceSharedVertices();

  const ocean = new FFTOcean(scene, engine, {
    gridSize: 256,
    domainLength: 256,
    windDirection: new Vector2(1, 1),
    amplitude: 32,
    windSpeed: 120,
    choppiness: 1,
  });

  Effect.ShadersStore["oceanVertexShader"] = oceanVertexShader;
  Effect.ShadersStore["oceanFragmentShader"] = oceanFragmentShader;

  const oceanMaterial = new ShaderMaterial(
    "oceanShader",
    scene,
    {
      vertex: "ocean",
      fragment: "ocean",
    },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "uvScale", "choppiness"],
      samplers: ["displacementMap"],
    },
  );

  const uvScale = 6.0;

  oceanMaterial.backFaceCulling = false;
  oceanMaterial.setTexture("displacementMap", ocean.displacementTexture);
  oceanMaterial.setFloat("uvScale", uvScale);
  oceanMaterial.setFloat("choppiness", ocean.choppiness);

  oceanMesh.material = oceanMaterial;

  const depthRenderer = scene.enableDepthRenderer(
    camera,
    false,
    true,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
  );

  engine.onResizeObservable.add(() => {
    const depthMap = depthRenderer.getDepthMap();
    if (depthMap) {
      depthMap.resize({
        width: engine.getRenderWidth(),
        height: engine.getRenderHeight(),
      });
    }
  });

  Effect.ShadersStore["oceanDepthVertexShader"] = oceanDepthVertexShader;
  Effect.ShadersStore["oceanDepthFragmentShader"] = oceanDepthFragmentShader;

  const oceanDepthMaterial = new ShaderMaterial(
    "oceanDepthShader",
    scene,
    {
      vertex: "oceanDepth",
      fragment: "oceanDepth",
    },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "uvScale", "choppiness", "depthValues"],
      samplers: ["displacementMap"],
    },
  );
  oceanDepthMaterial.backFaceCulling = false;
  oceanDepthMaterial.setTexture("displacementMap", ocean.displacementTexture);
  oceanDepthMaterial.setFloat("uvScale", uvScale);
  oceanDepthMaterial.setFloat("choppiness", ocean.choppiness);
  oceanDepthMaterial.setVector2(
    "depthValues",
    new Vector2(camera.minZ, camera.maxZ - camera.minZ),
  );
  depthRenderer.setMaterialForRendering(oceanMesh, oceanDepthMaterial);

  Effect.ShadersStore["outlinePostProcessFragmentShader"] =
    outlinePostProcessShader;

  const outlinePostProcess = new PostProcess(
    "outlinePostProcess",
    "outlinePostProcess",
    ["screenSize", "outlineWidth", "depthThreshold", "outlineColor"],
    ["depthSampler"],
    1.0,
    camera,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    engine,
    false,
  );

  outlinePostProcess.onApply = (effect) => {
    effect.setTexture("depthSampler", depthRenderer.getDepthMap());
    effect.setFloat2(
      "screenSize",
      engine.getRenderWidth(),
      engine.getRenderHeight(),
    );
    effect.setFloat("outlineWidth", 1.2);
    effect.setFloat("depthThreshold", 0.025);
    effect.setColor3("outlineColor", new Color3(1, 1, 1));
  };

  const bedBaseColorTex = new Texture(bedBaseColorUrl, scene, false, false);
  const bedNormalTex = new Texture(bedNormalUrl, scene, false, false);
  const bedAOTex = new Texture(bedAOUrl, scene, false, false);

  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1.0 : 1.0;

  const bedMaterial = createScreentoneMaterial(
    "bedScreentoneShader",
    scene,
    camera,
    sunLight.direction.scale(-1).normalize(),
    sunLight.diffuse,
    {
      baseColorTexture: bedBaseColorTex,
      normalTexture: bedNormalTex,
      aoTexture: bedAOTex,
      screentoneDensity: 6 * dpr,
    },
  );

  const bedRoot = new TransformNode("bedRoot", scene);
  bedRoot.position.set(0, 0, 0);
  bedRoot.scaling.setAll(6.0);
  bedRoot.rotation.y = Math.PI * 0.25;

  ImportMeshAsync(bedGlbUrl, scene)
    .then((result) => {
      for (const mesh of result.meshes) {
        if (mesh.getTotalVertices() > 0) {
          mesh.material = bedMaterial;
          mesh.position.set(0, -0.2, 0);
        }
      }
      if (result.meshes[0]) {
        result.meshes[0].parent = bedRoot;
      }
    })
    .catch((err) => {
      console.error("Failed to load bed.glb:", err);
    });

  let currentPitch = 0;
  let currentRoll = 0;

  let t = 0;

  scene.onBeforeRenderObservable.add(() => {
    t += engine.getDeltaTime() * 0.01;
    ocean.update(t);

    oceanDepthMaterial.setVector2(
      "depthValues",
      new Vector2(camera.minZ, camera.maxZ - camera.minZ),
    );

    bedMaterial.setVector3("cameraPosition", camera.position);

    const water = ocean.getWaterDisplacementAndNormal(
      bedRoot.position.x,
      bedRoot.position.z,
      meshSize,
      uvScale,
    );

    const dt = engine.getDeltaTime() * 0.001;
    const tiltDamping = 1;
    const heaveDamping = 0.8;

    const heaveSmooth = 1.0 - Math.exp(-2.6 * dt);
    const tiltSmooth = 1.0 - Math.exp(-2.0 * dt);

    const waterlineOffset = -0.15;
    const targetY = water.height * heaveDamping + waterlineOffset;
    bedRoot.position.y = Scalar.Lerp(bedRoot.position.y, targetY, heaveSmooth);

    const targetPitch =
      -Math.asin(Math.min(1.0, Math.max(-1.0, water.normal.z))) * tiltDamping;
    const targetRoll =
      Math.asin(Math.min(1.0, Math.max(-1.0, water.normal.x))) * tiltDamping;

    currentPitch = Scalar.Lerp(currentPitch, targetPitch, tiltSmooth);
    currentRoll = Scalar.Lerp(currentRoll, targetRoll, tiltSmooth);

    bedRoot.rotation.x = currentPitch;
    bedRoot.rotation.z = currentRoll;
    bedRoot.rotation.y = Math.PI * 0.25 + Math.sin(t * 0.08) * 0.035;
  });

  return scene;
}

initializeOceanApp();
