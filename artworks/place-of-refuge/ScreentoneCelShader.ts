import {
  Scene,
  Camera,
  ShaderMaterial,
  Vector2,
  Vector3,
  Color3,
  Texture,
  Effect,
} from "@babylonjs/core";
import screentoneVertexShader from "./screentone_vertex.glsl?raw";
import screentoneFragmentShader from "./screentone_fragment.glsl?raw";

let shadersRegistered = false;

function registerShaders() {
  if (!shadersRegistered) {
    Effect.ShadersStore["screentoneVertexShader"] = screentoneVertexShader;
    Effect.ShadersStore["screentoneFragmentShader"] = screentoneFragmentShader;
    shadersRegistered = true;
  }
}

export interface ScreentoneMaterialOptions {
  baseColorTexture: Texture;
  normalTexture: Texture;
  aoTexture: Texture;
  screentoneDensity?: number;
}

export function createScreentoneMaterial(
  name: string,
  scene: Scene,
  camera: Camera,
  sunDirection: Vector3,
  sunColor: Color3,
  options: ScreentoneMaterialOptions,
): ShaderMaterial {
  registerShaders();

  const mat = new ShaderMaterial(
    name,
    scene,
    {
      vertex: "screentone",
      fragment: "screentone",
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "sunDirection",
        "sunColor",
        "screentoneDensity",
        "screenSize",
      ],
      samplers: ["baseColorMap", "normalMap", "aoMap"],
    },
  );

  const engine = scene.getEngine();
  mat.setVector2(
    "screenSize",
    new Vector2(engine.getRenderWidth(), engine.getRenderHeight()),
  );
  mat.setVector3("cameraPosition", camera.position);
  mat.setVector3("sunDirection", sunDirection);
  mat.setColor3("sunColor", sunColor);
  mat.setFloat("screentoneDensity", options.screentoneDensity ?? 7.0);

  mat.setTexture("baseColorMap", options.baseColorTexture);
  mat.setTexture("normalMap", options.normalTexture);
  mat.setTexture("aoMap", options.aoTexture);

  return mat;
}
