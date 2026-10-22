import * as THREE from './vendor/three.module.js';

// One presentation rig shared by the interactive scene and the exported film.
// It never changes acquisition camera calibration or geometry coordinates.
export function installSceneLighting(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  scene.add(new THREE.HemisphereLight(0xe9f1f5, 0x617183, 1.35));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.65);
  key.position.set(-2.6, 6, 3.2);
  key.target.position.set(0, .7, -.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left:-4.5,right:4.5,top:4.5,bottom:-4.5,near:.1,far:16});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00006;
  key.shadow.normalBias = .0015;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const windowLight = new THREE.DirectionalLight(0xcbdfe8, 1.1);
  windowLight.position.set(-1, 2.7, -4);
  scene.add(windowLight);
  const fill = new THREE.DirectionalLight(0xe8f1f7, .72);
  fill.position.set(4, 2, 4);
  scene.add(fill);
  const bounce = new THREE.DirectionalLight(0xdce9f1, 1.1);
  bounce.position.set(.2, .25, 2.2);
  bounce.target.position.set(0, 1.7, -.22);
  scene.add(bounce, bounce.target);
  return {key, windowLight, fill, bounce};
}
