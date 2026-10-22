import * as THREE from './vendor/three.module.js';

// Presentation lighting only. Camera projection and model coordinates are unchanged.
// Neutral key light keeps the anatomy legible; blue rim and warm bounce add depth.
export function installSceneLighting(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  const ambient = new THREE.HemisphereLight(0xd5e7f4, 0x273847, .76);
  ambient.name = 'presentation-ambient';
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xf7f4ed, 2.55);
  key.name = 'presentation-key';
  key.position.set(-2.5, 5.8, 3.4);
  key.target.position.set(0, .7, -.3);
  key.castShadow = true;
  const compactViewport = typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;
  const shadowSize = compactViewport ? 1024 : 2048;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(key.shadow.camera, {left:-4.5,right:4.5,top:4.5,bottom:-4.5,near:.1,far:16});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00006;
  key.shadow.normalBias = .0015;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  // This cyan light represents stylised room illumination, not an emitted camera beam.
  // Only the key casts shadows, keeping the spatial UI lightweight on smaller devices.
  const windowLight = new THREE.DirectionalLight(0x74dcf5, 1.72);
  windowLight.name = 'presentation-cyan-rim';
  windowLight.position.set(-.7, 3.0, -4);
  windowLight.target.position.set(.2, 1.0, -.1);
  scene.add(windowLight, windowLight.target);
  const fill = new THREE.DirectionalLight(0xadc9f3, .58);
  fill.name = 'presentation-cool-fill';
  fill.position.set(4, 2.2, 3.0);
  fill.target.position.set(0, 1.1, 0);
  scene.add(fill, fill.target);
  const bounce = new THREE.DirectionalLight(0xf1d6bb, .58);
  bounce.name = 'presentation-warm-bounce';
  bounce.position.set(.4, .25, 2.2);
  bounce.target.position.set(0, 1.7, -.22);
  scene.add(bounce, bounce.target);
  return {key, windowLight, fill, bounce, ambient};
}
