// Lichtbrechung für facettierte Edelsteine.
//
// Für jeden Bildpunkt wird ein Lichtstrahl in den Stein verfolgt: Er wird beim Eintritt
// gebrochen, im Inneren an den Facetten gespiegelt (Totalreflexion) und beim Austritt wieder
// gebrochen. Danach wird die Studio-Umgebung in diese Richtung abgefragt – getrennt für Rot,
// Grün und Blau mit leicht unterschiedlicher Brechzahl. Daraus entstehen Brillanz und "Feuer".
// Schnelle Strahlsuche im Stein über three-mesh-bvh. Idee nach MeshRefractionMaterial (drei, MIT).

import * as THREE from '../vendor/three.module.min.js';
import { MeshBVH, MeshBVHUniformStruct, BVHShaderGLSL } from '../vendor/three-mesh-bvh.module.js';

const vertexShader = /* glsl */`
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying mat4 vModelMatrixInverse;
  varying vec3 vTint;
  void main() {
    #ifdef USE_COLOR
      vTint = color;
    #else
      vTint = vec3(1.0);
    #endif
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vModelMatrixInverse = inverse(modelMatrix);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  #define BVH_STACK_DEPTH 40
  precision highp isampler2D;
  precision highp usampler2D;
  ${BVHShaderGLSL.common_functions}
  ${BVHShaderGLSL.bvh_struct_definitions}
  ${BVHShaderGLSL.bvh_ray_functions}

  uniform mat4 modelMatrix;
  uniform samplerCube envMap;
  uniform BVH bvh;
  uniform float bounces;
  uniform float ior;
  uniform float dispersion;
  uniform float fresnel;
  uniform float exposure;
  uniform vec3 color;
  uniform vec3 glowColor;
  uniform float glow;
  uniform float body;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying mat4 vModelMatrixInverse;
  varying vec3 vTint;

  vec3 traceInside(vec3 rd, vec3 n, float eta) {
    vec3 dir = refract(rd, n, 1.0 / eta);
    vec3 ro = (vModelMatrixInverse * vec4(vWorldPosition + dir * 0.001, 1.0)).xyz;
    dir = normalize((vModelMatrixInverse * vec4(dir, 0.0)).xyz);
    for (float i = 0.0; i < 6.0; i++) {
      if (i >= bounces) break;
      uvec4 faceIndices = uvec4(0u);
      vec3 faceNormal = vec3(0.0, 0.0, 1.0);
      vec3 barycoord = vec3(0.0);
      float side = 1.0;
      float dist = 0.0;
      bvhIntersectFirstHit(bvh, ro, dir, faceIndices, faceNormal, barycoord, side, dist);
      vec3 hit = ro + dir * max(dist - 0.001, 0.0);
      vec3 outDir = refract(dir, faceNormal, eta);
      if (length(outDir) != 0.0) { dir = outDir; break; }
      dir = reflect(dir, faceNormal);
      ro = hit + dir * 0.01;
    }
    return normalize((modelMatrix * vec4(dir, 0.0)).xyz);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 rd = normalize(vWorldPosition - cameraPosition);
    vec3 dirG = traceInside(rd, n, max(ior, 1.0));
    vec3 dirR = traceInside(rd, n, max(ior * (1.0 - dispersion), 1.0));
    vec3 dirB = traceInside(rd, n, max(ior * (1.0 + dispersion), 1.0));
    vec3 c = vec3(textureCube(envMap, dirR).r, textureCube(envMap, dirG).g, textureCube(envMap, dirB).b);
    c *= color * vTint * exposure;
    // Körperfarbe: auch wo kein Licht ankommt, leuchtet ein farbiger Stein leicht in seiner Farbe
    c += color * vTint * body;
    // Spiegelung an der Oberfläche (Fresnel)
    vec3 refl = textureCube(envMap, reflect(rd, n)).rgb;
    float f = fresnel * pow(1.0 + dot(rd, n), 5.0);
    c = mix(c, refl, clamp(f, 0.0, 1.0));
    c += glowColor * glow;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Studio-Umgebung als Würfel-Textur (für die Strahlen im Stein)
export function cubeFromScene(renderer, scene, size = 256) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cam = new THREE.CubeCamera(0.1, 50, rt);
  cam.update(renderer, scene);
  return rt;
}

export function refractionMaterial(geometry, envCube, { color = '#ffffff', ior = 2.4, dispersion = 0.02, bounces = 4, exposure = 1.25, glow = 0, body = 0, vertexColors = false } = {}) {
  const bvh = new MeshBVH(geometry);
  const bvhUniform = new MeshBVHUniformStruct();
  bvhUniform.updateFrom(bvh);
  return new THREE.ShaderMaterial({
    uniforms: {
      envMap: { value: envCube },
      bvh: { value: bvhUniform },
      bounces: { value: bounces },
      ior: { value: ior },
      dispersion: { value: dispersion },
      fresnel: { value: 0.55 },
      exposure: { value: exposure },
      color: { value: new THREE.Color(color) },
      glowColor: { value: new THREE.Color(color) },
      glow: { value: glow },
      body: { value: body },
    },
    vertexShader,
    fragmentShader,
    vertexColors,
    toneMapped: true,
  });
}
