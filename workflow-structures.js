import * as THREE from './vendor/three.module.js';
import {createRoom,createArm} from './spatial-models.js';

const CARPALS=[
 {id:'scaphoid',label:'舟骨',offset:[-.025,.004,.013]},
 {id:'lunate',label:'月骨',offset:[-.009,.014,.019]},
 {id:'triquetrum',label:'三角骨',offset:[.015,.012,.018]},
 {id:'pisiform',label:'豌豆骨',offset:[.038,.028,.012]},
 {id:'trapezium',label:'大多角骨',offset:[-.040,-.003,-.015]},
 {id:'trapezoid',label:'小多角骨',offset:[-.016,.004,-.023]},
 {id:'capitate',label:'头状骨',offset:[.011,.002,-.025]},
 {id:'hamate',label:'钩骨',offset:[.038,.006,-.020]}
];
const CAPTURE_COLORS=[0xe88e86,0x7fd5b0,0x85bde8];
const TARGET_CORNERS=[[-.092,.032,-.195],[.092,.032,-.195],[.092,.032,.235],[-.092,.032,.235]];

function focus(box,offset){
 const target=box.getCenter(new THREE.Vector3());
 return {box:box.clone(),target,position:target.clone().add(new THREE.Vector3(...offset))};
}
function objectBox(objects){
 const box=new THREE.Box3();
 for(const object of objects){object.updateWorldMatrix(true,true);box.union(new THREE.Box3().setFromObject(object));}
 return box;
}
function cameraDetail(camera){
 // Existing glass is a cylinder along Y and its visible optical face points -Y.
 // Add local mechanical rings; these do not imply calibrated lens specifications.
 const glass=camera.getObjectByName('camera-lens-glass');
 const ringMat=new THREE.MeshStandardMaterial({color:0x587382,metalness:.67,roughness:.3});
 const blackMat=new THREE.MeshStandardMaterial({color:0x12242e,metalness:.30,roughness:.3});
 const pos=glass.position;
 for(const [radius,tube,dy,mat] of [[.0135,.0015,-.007,blackMat],[.0108,.00065,-.008,ringMat],[.015,.00045,-.007,ringMat]]){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,8,48),mat);
  ring.position.set(pos.x,pos.y+dy,pos.z);ring.rotation.x=Math.PI/2;ring.name='RGB-lens-retaining-ring';camera.add(ring);
 }
 const inner=new THREE.Mesh(new THREE.CircleGeometry(.0088,32),new THREE.MeshPhysicalMaterial({color:0x2e627a,metalness:.62,roughness:.12,clearcoat:1,clearcoatRoughness:.08}));
 inner.rotation.x=Math.PI/2;inner.position.set(pos.x,pos.y-.0079,pos.z);inner.name='RGB-lens-optical-face';camera.add(inner);
 for(const [dx,dz] of [[-.025,-.021],[.025,-.021],[-.025,.021],[.025,.021]]){
  const screw=new THREE.Mesh(new THREE.CylinderGeometry(.0015,.0015,.0016,8),ringMat);
  screw.position.set(pos.x+dx,pos.y-.005,pos.z+dz);screw.name='RGB-camera-housing-screw';camera.add(screw);
 }
 return glass;
}

/**
 * Photo-informed proposed RGB acquisition setup and generic carpal illustration.
 * Independent of CT data, X-ray emission, hardware connection or pose inference.
 * Add room.group, arm.group and beamGroup to the same scene; coordinates are meters.
 */
export function createWorkflowStructures(){
 const room=createRoom(),arm=createArm();
 arm.group.position.set(0,.925,-.14);
 arm.setPose({alphaDeg:0,translation:0,missing:false,skinOpacity:1,bonesVisible:false});
 // The workflow communicates optical acquisition, so omit the old light-field patch.
 const priorField=room.group.getObjectByName('light-field');if(priorField)priorField.visible=false;
 room.group.updateWorldMatrix(true,true);arm.group.updateWorldMatrix(true,true);

 const cameras=['left','right'].map(id=>{
  const object=room.group.getObjectByName(`optical-camera-${id}`);
  if(!object)throw new Error(`Missing photo-reference optical camera: ${id}`);
  const lens=cameraDetail(object),lensWorld=lens.getWorldPosition(new THREE.Vector3());
  const label=id==='left'?'左侧 RGB 采集模块':'右侧 RGB 采集模块';
  const detail='照片参考的镜头外观；RGB采集流程为拟定演示，未验证模块型号、标定参数或硬件接入。';
  object.userData={...object.userData,cameraId:id,label,detail,source:'photo-reference-proposed-rgb'};
  object.traverse(child=>{if(child.isMesh)child.userData={...child.userData,cameraId:id,label,detail,source:'photo-reference-proposed-rgb'};});
  return {id,object,lens,lensWorld,label,lensFaceWorld:new THREE.Vector3()};
 });

 const carpalBones=CARPALS.map((spec,index)=>{
  const object=arm.handBones.getObjectByName(`carpal-illustration-${index+1}`);
  if(!object)throw new Error(`Missing carpal illustration ${index+1}`);
  object.material=object.material.clone();
  const originalMaterial={color:object.material.color.clone(),emissive:object.material.emissive.clone(),emissiveIntensity:object.material.emissiveIntensity};
  const detail=`${spec.label}的简化几何示意；名称按通用腕骨分组对应，不是CT逐骨分割，也不表示个体真实形状。`;
  object.userData={...object.userData,boneId:spec.id,label:spec.label,detail,source:'generic-carpal-illustration'};
  return {...spec,object,detail,basePosition:object.position.clone(),explodeOffset:new THREE.Vector3(...spec.offset),centerWorld:object.getWorldPosition(new THREE.Vector3()),originalMaterial};
 });

 const beamGroup=new THREE.Group();beamGroup.name='ProposedRGBOpticalAcquisition';
 beamGroup.userData={label:'RGB 图像采集路径示意',detail:'粒子从手部流向镜头，表达图像信息采集；不是X线发射，不是真实光线追迹或实时视频数据。',source:'conceptual-rgb-acquisition'};
 const beamStates=cameras.map(camera=>{
  const edges=new Float32Array(16*3),lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.BufferAttribute(edges,3));
  const line=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0x81b9ce,transparent:true,opacity:.55,depthWrite:false}));line.name=`RGB-${camera.id}-field-of-view-wire`;beamGroup.add(line);
  const surfaceGeometry=new THREE.BufferGeometry();surfaceGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12*3),3));
  const surface=new THREE.Mesh(surfaceGeometry,new THREE.MeshBasicMaterial({color:0x73c0ca,transparent:true,opacity:.045,side:THREE.DoubleSide,depthWrite:false}));surface.name=`RGB-${camera.id}-field-of-view`;surface.renderOrder=1;beamGroup.add(surface);
  const samples=Array.from({length:24},(_,index)=>{
   const material=new THREE.MeshBasicMaterial({color:CAPTURE_COLORS[index%3],transparent:true,opacity:.85,depthWrite:false});
   const object=new THREE.Mesh(new THREE.SphereGeometry(.004,7,5),material);object.name=`RGB-${camera.id}-incoming-sample-${index}`;
   object.userData={label:'手部至镜头的信息流',source:'conceptual-rgb-acquisition',direction:'hand-to-camera'};beamGroup.add(object);
   // Repeatable sparse samples distributed across palm and distal forearm.
   const sourceLocal=new THREE.Vector3(-.069+((index*7)%23)/22*.138,.035,-.177+((index*11)%23)/22*.375);
   return {object,sourceLocal,phaseOffset:index/24,phase:0,sourceWorld:new THREE.Vector3()};
  });
  return {camera,line,surface,samples};
 });
 const particleToLocal=point=>beamGroup.worldToLocal(point.clone());
 function setCaptureProgress(t=0,active=true){
  const time=Number.isFinite(t)?t:0;beamGroup.visible=!!active;
  room.group.updateWorldMatrix(true,true);arm.group.updateWorldMatrix(true,true);beamGroup.updateWorldMatrix(true,false);
  for(const state of beamStates){
   const {camera,line,surface,samples}=state;
   camera.lens.getWorldPosition(camera.lensWorld);
   camera.lensFaceWorld.copy(camera.lens.localToWorld(new THREE.Vector3(0,-.0065,0)));
   const apex=particleToLocal(camera.lensFaceWorld);
   const corners=TARGET_CORNERS.map(p=>particleToLocal(arm.poseRoot.localToWorld(new THREE.Vector3(...p))));
   const positions=line.geometry.getAttribute('position');let vertex=0;
   const put=(p)=>{positions.setXYZ(vertex++,p.x,p.y,p.z);};
   for(let i=0;i<4;i++){put(apex);put(corners[i]);put(corners[i]);put(corners[(i+1)%4]);}
   positions.needsUpdate=true;line.geometry.computeBoundingSphere();
   const faces=surface.geometry.getAttribute('position');vertex=0;
   for(let i=0;i<4;i++)for(const p of [apex,corners[i],corners[(i+1)%4]])faces.setXYZ(vertex++,p.x,p.y,p.z);
   faces.needsUpdate=true;surface.geometry.computeBoundingSphere();
   for(const sample of samples){
    sample.sourceWorld.copy(arm.poseRoot.localToWorld(sample.sourceLocal.clone()));
    sample.phase=((time+sample.phaseOffset)%1+1)%1;
    const p=sample.sourceWorld.clone().lerp(camera.lensFaceWorld,sample.phase);
    sample.object.position.copy(particleToLocal(p));
    // Fade only at spawn/arrival to avoid suggesting a pulsed radiation source.
    sample.object.material.opacity=.82*Math.min(1,sample.phase*9,(1-sample.phase)*9);
   }
  }
  for(const bone of carpalBones)bone.object.getWorldPosition(bone.centerWorld);
 }
 function setBoneExplode(value=0){
  const amount=THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);
  for(const bone of carpalBones){bone.object.position.copy(bone.basePosition).addScaledVector(bone.explodeOffset,amount);bone.object.updateWorldMatrix(true,false);bone.object.getWorldPosition(bone.centerWorld);}
  return amount;
 }
 function resetHighlights(){
  for(const bone of carpalBones){const m=bone.object.material,o=bone.originalMaterial;m.color.copy(o.color);m.emissive.copy(o.emissive);m.emissiveIntensity=o.emissiveIntensity;bone.object.userData.selected=false;}
 }
 function highlightBone(id){
  resetHighlights();const bone=carpalBones.find(b=>b.id===id||b.label===id);if(!bone)return null;
  bone.object.material.color.set(0xe6c686);bone.object.material.emissive.set(0x99672e);bone.object.material.emissiveIntensity=.48;bone.object.userData.selected=true;
  bone.object.getWorldPosition(bone.centerWorld);
  return bone;
 }
 const cameraPair=()=>focus(objectBox(cameras.map(c=>c.object)),[.31,-.28,.51]);
 const cameraFocus=id=>{const camera=cameras.find(c=>c.id===id);return focus(objectBox([camera.object]),[.065,-.12,.17]);};
 const focusTargets={
  cameraPair,cameras:cameraPair,
  leftCamera:()=>cameraFocus('left'),rightCamera:()=>cameraFocus('right'),
  arm:()=>focus(objectBox([arm.group]),[.39,.43,.50]),
  wrist:()=>focus(objectBox(carpalBones.map(b=>b.object)),[.105,.15,.165]),
  bone:id=>{const bone=carpalBones.find(b=>b.id===id||b.label===id);return bone?focus(objectBox([bone.object]),[.07,.085,.10]):null;}
 };
 setCaptureProgress(0,false);
 return {room,arm,cameras,carpalBones,focusTargets,beamGroup,setCaptureProgress,setBoneExplode,highlightBone,resetHighlights,
  // Exposed for reproducible direction checks, not an inference result.
  captureSamples:beamStates.flatMap(s=>s.samples.map(sample=>Object.assign(sample,{cameraId:s.camera.id,camera:s.camera}))),
  assumptions:{units:'meter',cameraType:'proposed RGB role; hardware model and calibration unconfirmed',registeredToCT:false,automaticKeypointDetection:false,carpalGeometry:'eight generic approximate bodies, not individual-bone segmentation',captureFlow:'hand to optical camera; no X-ray emission'}};
}
