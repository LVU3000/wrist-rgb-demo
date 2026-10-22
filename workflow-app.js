import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {createWorkflowStructures} from './workflow-structures.js';
import {evaluateCapture} from './workflow-rules.js';
import {installSceneLighting} from './scene-lighting.js';

const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const status=text=>{$('wf-status').textContent=text;};
const renderer=new THREE.WebGLRenderer({canvas:$('wf-canvas'),antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x101d25,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.002,60);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!reduced;controls.dampingFactor=.10;controls.minDistance=.04;controls.maxDistance=20;
installSceneLighting(scene,renderer);
const model=createWorkflowStructures();scene.add(model.room.group,model.arm.group,model.beamGroup);
const landmarks=model.arm.landmarks;
let pose={angle:17.5,shift:0,missing:false},initialPose={...pose},step=0,timeline=0,playing=false,focus='room',capture=null,before=null,after=null,shotNumber=0,confirmed=false;
let cameraTween=null,poseTween=null,recording=null,previousTime=performance.now(),finished=false;
const DURATION=48,STEP_SECONDS=6;
const steps=[
 {title:'环境与摆位',detail:'查看检查室、检查床和镜头安装位置。选择一个输入情境，再采集当前姿态。',focus:'room'},
 {title:'采集 RGB 画面',detail:'手部反射的环境光进入镜头。流动光点表示信息采集方向；两个RGB快照来自本场景渲染。',focus:'capture'},
 {title:'取得关键点输入',detail:'E为肘参考点，W为腕点，M为手轴点，T为拇指侧辅助点。本版由已知模型投影给出坐标，不运行视觉识别网络。',focus:'arm'},
 {title:'计算几何指标',detail:'从本次快照对应的像素坐标计算手轴偏角α、手前臂夹角β与归一化偏移d。判定使用未舍入值。',focus:'wrist'},
 {title:'输出评估提示',detail:'S1表示待人工确认，S2提示调整，S3表示信息不足、暂停判断。演示阈值不等于临床合格标准。',focus:'arm'},
 {title:'调整后再观察',detail:'将示意手掌偏转与整体位移逐步归零；若M点缺失，先移除示意遮挡。该动画不是设备控制指令。',focus:'wrist'},
 {title:'重新采集与计算',detail:'对调整后的姿态重新生成RGB快照、投影关键点并计算，形成前后对照，不沿用旧结果。',focus:'arm'},
 {title:'人工确认与记录',detail:'仅在最新采集为S1时，允许操作者主动勾选并记录本地确认。自动导览到这里停止，不自动确认。',focus:'room'}
];
const rgbSize={w:480,h:360};
const rgbCanvases=[$('wf-rgb-left'),$('wf-rgb-right')];rgbCanvases.forEach(c=>{c.width=rgbSize.w;c.height=rgbSize.h;});
const rawCanvases=rgbCanvases.map(()=>{const c=document.createElement('canvas');c.width=rgbSize.w;c.height=rgbSize.h;return c;});
const target=new THREE.WebGLRenderTarget(rgbSize.w,rgbSize.h,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
const pixelBuffer=new Uint8Array(rgbSize.w*rgbSize.h*4);
const virtualCameras=model.cameras.map(item=>{
 const c=new THREE.PerspectiveCamera(61,rgbSize.w/rgbSize.h,.015,6);
 c.position.copy(item.lensWorld).add(new THREE.Vector3(0,-.012,0));c.up.set(0,0,-1);c.lookAt(new THREE.Vector3(0,.935,-.01));c.updateMatrixWorld(true);return c;
});
function applyPose(value=pose,sync=true){
 const wasTransparent=model.arm.skinMaterials[0].transparent;
 pose={...value};model.arm.setPose({alphaDeg:pose.angle,translation:pose.shift*.28,missing:pose.missing,skinOpacity:Number($('wf-opacity').value)/100,bonesVisible:$('wf-bones').checked});
 if(wasTransparent!==model.arm.skinMaterials[0].transparent)model.arm.skinMaterials.forEach(m=>m.needsUpdate=true);
 model.arm.group.traverse(o=>{if(o.isMesh&&model.arm.skinMaterials.includes(o.material))o.visible=!(Number($('wf-opacity').value)<5&&$('wf-bones').checked);});
 model.setBoneExplode(Number($('wf-explode').value));scene.updateMatrixWorld(true);
 if(sync){$('wf-angle').value=pose.angle;$('wf-shift').value=pose.shift;$('wf-missing').checked=pose.missing;}
 if($('wf-angle-value'))$('wf-angle-value').textContent=pose.angle.toFixed(1)+'°';if($('wf-shift-value'))$('wf-shift-value').textContent=pose.shift.toFixed(3);
 if($('wf-opacity-value'))$('wf-opacity-value').textContent=$('wf-opacity').value+'%';if($('wf-explode-value'))$('wf-explode-value').textContent=Math.round(Number($('wf-explode').value)*100)+'%';
 document.body.dataset.poseAngle=pose.angle.toFixed(3);document.body.dataset.poseShift=pose.shift.toFixed(4);
}
function projectPoint(point,c){const p=point.getWorldPosition(new THREE.Vector3()).project(c);return[(p.x+1)*rgbSize.w/2,(1-p.y)*rgbSize.h/2];}
applyPose({angle:0,shift:0,missing:false},false);
const references=virtualCameras.map(c=>{const E=projectPoint(landmarks.E,c),W=projectPoint(landmarks.W,c);return{anchor:W,axis:[W[0]-E[0],W[1]-E[1]]};});
applyPose(initialPose);

const overlay=document.createElement('div');overlay.className='wf-canvas-hud';overlay.setAttribute('aria-hidden','true');$('wf-stage').append(overlay);
const markerLabels=Object.fromEntries(Object.keys(landmarks).map(n=>{const el=document.createElement('span');el.className='wf-point-label';el.textContent=n;el.hidden=true;$('wf-stage').append(el);return[n,el];}));
const selectedLabel=document.createElement('span');selectedLabel.className='wf-bone-label';selectedLabel.hidden=true;$('wf-stage').append(selectedLabel);
function num(v,decimals=2){return Number.isFinite(v)?v.toFixed(decimals):'不可计算';}
function labelResult(result){return result?`${result.state} · α ${result.alpha==null?'不可计算':num(result.alpha)+'°'} / β ${result.beta==null?'不可计算':num(result.beta)+'°'} / d ${num(result.d,3)}`:'尚未采集';}
function currentCapture(){return !!capture&&!poseTween&&Math.abs(capture.pose.angle-pose.angle)<1e-9&&Math.abs(capture.pose.shift-pose.shift)<1e-9&&capture.pose.missing===pose.missing;}
function renderResults(){
 const result=capture?.result,ready=!!result&&step>=3;
 $('wf-alpha').textContent=ready?(result.alpha==null?'不可计算':num(result.alpha)+'°'):'待计算';
 $('wf-beta').textContent=ready?(result.beta==null?'不可计算':num(result.beta)+'°'):'待计算';
 $('wf-offset').textContent=ready?num(result.d,3):'待计算';
 $('wf-result').textContent=ready?`${result.state} · ${result.state==='S1'?'待人工确认':result.state==='S2'?'需要调整':'暂停判断'}`:'等待本次输入';
 $('wf-result').dataset.state=ready?result.state:'pending';
 $('wf-reason').textContent=ready?result.reasons.join('；'):'采集当前姿态后，按步骤查看关键点与计算。';
 const trace=result?.trace;
 $('wf-formula').textContent=ready&&result.state!=='S3'?`α = ∠(WM, 参考轴) = ${num(result.alpha)}°；β = ∠(WM, EW) = ${num(result.beta)}°；d = |横向偏移| / |EW| = ${num(Math.abs(trace.signedPerpendicularPixels))} / ${num(trace.referenceLength)} = ${num(result.d,3)}。演示阈值：α或β > 10°，或d > 0.15。`:ready?'必要关键点或参考向量不足，停止计算；不以0代替缺失数值。':'公式将在本次坐标到位后显示。';
 $('wf-before').textContent=labelResult(before?.result);$('wf-after').textContent=labelResult(after?.result);
 const canConfirm=currentCapture()&&result.state==='S1'&&step===7&&!recording;
 $('wf-human-confirm').disabled=!canConfirm||confirmed;$('wf-confirm-button').disabled=!canConfirm||!$('wf-human-confirm').checked||confirmed;
 if(confirmed){$('wf-result').textContent='S1 · 已记录本地人工确认';$('wf-reason').textContent='操作者已在本演示中主动确认。此记录不代表临床验证或真实设备执行。';}
 const r=ready?`${$('wf-result').textContent}　α ${$('wf-alpha').textContent}　d ${$('wf-offset').textContent}`:'按步骤采集与核对';
 overlay.textContent=`${String(step+1).padStart(2,'0')} / ${steps[step].title}\n${r}`;
 document.body.dataset.wfResult=ready?result.state:'pending';document.body.dataset.wfCapture=String(capture?.number||0);document.body.dataset.wfConfirmed=String(confirmed);
}
function emptyRGB(){rgbCanvases.forEach((c,i)=>{const ctx=c.getContext('2d');ctx.fillStyle='#0b1821';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#a7c2ce';ctx.font='20px "Microsoft YaHei",sans-serif';ctx.fillText(i===0?'主视角 RGB':'对照视角 RGB',28,48);ctx.font='16px "Microsoft YaHei",sans-serif';ctx.fillText('点击“采集当前姿态”生成快照',28,92);});}
function renderPoints(){
 const host=$('wf-keypoints');host.replaceChildren();
 for(const name of ['E','W','M','T']){const point=capture?.points?.[name];const available=step>=2&&capture;const values=[name+' · '+{E:'肘参考',W:'腕点',M:'手轴点',T:'拇指侧辅助'}[name],available?(point?point.map(x=>x.toFixed(2)).join(', '):'不可用'):'待输入',available?(point?(name==='T'?'辅助点':'已投影'):'缺失'):'未输入'];if(host.tagName==='TBODY'){const row=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=v;row.append(td);}host.append(row);}else{const row=document.createElement('div');row.textContent=values.join('　');host.append(row);}}
}
function drawSnapshotOverlays(){
 if(!capture)return;rgbCanvases.forEach((c,i)=>{const ctx=c.getContext('2d');ctx.drawImage(rawCanvases[i],0,0);const points=capture.views[i].points,ref=references[i];
  ctx.fillStyle='rgba(7,20,29,.8)';ctx.fillRect(0,0,c.width,34);ctx.fillStyle='#b7e3e9';ctx.font='15px "Microsoft YaHei",sans-serif';ctx.fillText(`${i===0?'主视角':'对照视角'} · RGB快照 #${capture.number} · 渲染输入`,12,23);
  if(step<2)return;
  ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.strokeStyle='#91a5b0';const len=Math.hypot(...ref.axis),unit=ref.axis.map(x=>x/len);ctx.beginPath();ctx.moveTo(ref.anchor[0]-unit[0]*120,ref.anchor[1]-unit[1]*120);ctx.lineTo(ref.anchor[0]+unit[0]*110,ref.anchor[1]+unit[1]*110);ctx.stroke();ctx.setLineDash([]);
  for(const [from,to,color] of [['E','W','#8dc7df'],['W','M','#65ead5']]){if(points[from]&&points[to]){ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(...points[from]);ctx.lineTo(...points[to]);ctx.stroke();}}
  for(const [name,p] of Object.entries(points)){if(!p)continue;ctx.fillStyle='#81eed5';ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#071b23';ctx.fillRect(p[0]+6,p[1]-18,22,24);ctx.fillStyle='#d7fff5';ctx.font='bold 16px Consolas,monospace';ctx.fillText(name,p[0]+10,p[1]);}
  if(!points.M){ctx.fillStyle='#efc78e';ctx.font='bold 18px "Microsoft YaHei",sans-serif';ctx.fillText('M点缺失：停止判断',14,c.height-17);}
 });
}
function captureNow(kind='before'){
 const display={room:model.room.group.visible,beam:model.beamGroup.visible,points:Object.fromEntries(Object.entries(landmarks).map(([n,p])=>[n,p.visible]))};
 const views=[];model.room.group.visible=true;model.beamGroup.visible=false;
 model.arm.setPose({alphaDeg:pose.angle,translation:pose.shift*.28,missing:pose.missing,skinOpacity:1,bonesVisible:false});
 model.arm.group.traverse(o=>{if(o.isMesh&&model.arm.skinMaterials.includes(o.material))o.visible=true;});
 model.arm.skinMaterials.forEach(m=>m.needsUpdate=true);
 Object.values(landmarks).forEach(p=>p.visible=false);scene.updateMatrixWorld(true);
 try{virtualCameras.forEach((c,i)=>{
   renderer.setRenderTarget(target);renderer.setClearColor(0x182630,1);renderer.render(scene,c);renderer.readRenderTargetPixels(target,0,0,rgbSize.w,rgbSize.h,pixelBuffer);
   const ctx=rawCanvases[i].getContext('2d'),im=ctx.createImageData(rgbSize.w,rgbSize.h);
   for(let y=0;y<rgbSize.h;y++)im.data.set(pixelBuffer.subarray((rgbSize.h-1-y)*rgbSize.w*4,(rgbSize.h-y)*rgbSize.w*4),y*rgbSize.w*4);
   ctx.putImageData(im,0,0);
   const points=Object.fromEntries(Object.entries(landmarks).map(([n,p])=>{const xy=projectPoint(p,c);const valid=xy[0]>=0&&xy[0]<rgbSize.w&&xy[1]>=0&&xy[1]<rgbSize.h;return[n,n==='M'&&pose.missing||!valid?null:xy];}));
   const result=evaluateCapture({points,...references[i],cameraValid:true,source:'model_projected'});views.push({points,result});
  });
 }finally{renderer.setRenderTarget(null);renderer.setClearColor(0x101d25,0);model.room.group.visible=display.room;model.beamGroup.visible=display.beam;applyPose();Object.entries(display.points).forEach(([n,v])=>landmarks[n].visible=v);}
 capture={number:++shotNumber,pose:{...pose},points:views[0].points,result:views[0].result,views};
 if(kind==='after')after=capture;else{before=capture;after=null;}
 confirmed=false;$('wf-human-confirm').checked=false;drawSnapshotOverlays();renderPoints();renderResults();
 status(`已生成RGB快照 #${shotNumber}；主视角坐标用于计算，对照视角用于观察。`);
 return capture;
}
function invalidate(){capture=null;before=null;after=null;confirmed=false;$('wf-human-confirm').checked=false;emptyRGB();renderPoints();renderResults();status('姿态已改变，请重新采集当前姿态。');}
function setPlaying(on){playing=on;if(poseTween)poseTween.paused=!on;$('wf-play').textContent=on?'暂停导览':'播放完整流程';document.body.dataset.wfPlaying=String(on);}
function focusView(name,animate=true){
 focus=name;document.body.dataset.wfFocus=name;
 let v;
 if(name==='room')v={target:new THREE.Vector3(0,1.08,0),position:new THREE.Vector3(5.9,4.8,6.8)};
 else if(name==='capture')v={target:new THREE.Vector3(0,1.32,-.14),position:new THREE.Vector3(1.42,1.78,1.34)};
 else v=(name==='camera'?model.focusTargets.cameraPair:name==='camera-left'?model.focusTargets.leftCamera:name==='camera-right'?model.focusTargets.rightCamera:name==='wrist'?model.focusTargets.wrist:model.focusTargets.arm)();
 const targetPoint=v.target.clone(),position=v.position.clone();const fit=Math.max(1,(name==='room'?1.5:name==='camera'?1.3:1.1)/camera.aspect);position.sub(targetPoint).multiplyScalar(fit).add(targetPoint);
 if(v.box){
  const radius=v.box.getSize(new THREE.Vector3()).length()*.5;
  const halfVertical=THREE.MathUtils.degToRad(camera.fov*.5);
  const limitingHalfFov=Math.min(halfVertical,Math.atan(Math.tan(halfVertical)*camera.aspect));
  const offset=position.clone().sub(targetPoint);
  offset.setLength(Math.max(offset.length(),radius/Math.sin(limitingHalfFov)*1.18));
  position.copy(targetPoint).add(offset);
 }
 if(animate&&!reduced){cameraTween={from:camera.position.clone(),to:position,targetFrom:controls.target.clone(),targetTo:targetPoint,start:performance.now(),duration:1350};}
 else{camera.position.copy(position);controls.target.copy(targetPoint);controls.update();cameraTween=null;}
 document.querySelectorAll('[data-focus]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.focus===name)));
 $('wf-object-detail').textContent={room:'完整检查场景。设备按照片近似建模，尺寸未实测。',capture:'彩色光点沿手部至镜头方向移动；锥形区域为采集范围示意，不代表设备发光。','camera-left':'左侧光学模块近景：双光学窗、壳体散热孔、固定支架与线缆均参照实拍外观，型号和光学参数未标定。','camera-right':'右侧光学模块近景：主镜片保持原有仿真采集位置，新增外观细节不参与几何计算。',camera:'两处光学镜头安装模块；视锥表示观察范围。镜头接收环境光，不代表主动发射测量光束或X线。',arm:'通用上肢模型，E/W/M/T为已知模型点；可见性条件由演示输入控制。',wrist:'八腕骨为简化示意模型。选择一块骨可高亮并近看，分开展示仅为观察结构。'}[name];
}
function setStep(next,{snap=false,perform=true}={}){
 step=Math.max(0,Math.min(7,next));document.body.dataset.wfStep=step;
 document.querySelectorAll('[data-step]').forEach(b=>{b.setAttribute('aria-current',Number(b.dataset.step)===step?'step':'false');b.setAttribute('aria-pressed',String(Number(b.dataset.step)===step));});
 $('wf-step-title').textContent=`${String(step+1).padStart(2,'0')} / ${steps[step].title}`;$('wf-step-detail').textContent=steps[step].detail;
 if(perform){
  if(step>=1&&step<=4&&!capture)captureNow('before');
  if(step===5){if(!before)captureNow('before');capture=null;after=null;confirmed=false;$('wf-human-confirm').checked=false;emptyRGB();poseTween={from:{...pose},elapsed:0,duration:2.2,paused:false};}
  if(step>=6&&poseTween){applyPose({angle:0,shift:0,missing:false});poseTween=null;capture=null;}
  if(step===6){captureNow('after');}
  if(step===7&&!capture)captureNow('after');
 }
 if(step!==5)poseTween=null;
 focusView(steps[step].focus,!snap);renderPoints();drawSnapshotOverlays();renderResults();
 $('wf-prev').disabled=step===0||!!recording;$('wf-next').disabled=step===7||!!recording;
}
function gotoStep(next){if(recording)return;setPlaying(false);timeline=Math.min(DURATION,next*STEP_SECONDS);$('wf-progress').value=timeline/DURATION;setStep(next);}
function resetScenario(){
 setPlaying(false);poseTween=null;timeline=0;finished=false;applyPose(initialPose);invalidate();setStep(0);$('wf-progress').value=0;status('情境已重置；可逐步操作或播放完整流程。');
}
function applyScenario(name){
 initialPose={baseline:{angle:0,shift:0,missing:false},deviation:{angle:17.5,shift:0,missing:false},translation:{angle:0,shift:.278,missing:false},missing:{angle:0,shift:0,missing:true}}[name];
 if(initialPose)resetScenario();
}
function changeInput(){setPlaying(false);poseTween=null;initialPose={angle:Number($('wf-angle').value),shift:Number($('wf-shift').value),missing:$('wf-missing').checked};applyPose(initialPose);invalidate();}
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>gotoStep(Number(b.dataset.step)));
document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>{if(!recording)setPlaying(false);focusView(b.dataset.focus);});
$('wf-home-view').onclick=()=>focusView(steps[step].focus);
$('wf-prev').onclick=()=>gotoStep(step-1);$('wf-next').onclick=()=>gotoStep(step+1);
$('wf-reset').onclick=resetScenario;
$('wf-play').onclick=()=>{if(playing){setPlaying(false);return;}if(timeline>=DURATION||finished){resetScenario();}setPlaying(true);};
$('wf-progress').oninput=e=>{setPlaying(false);timeline=Number(e.target.value)*DURATION;setStep(Math.min(7,Math.floor(timeline/STEP_SECONDS)));};
$('wf-scenario').onchange=e=>applyScenario(e.target.value);
['wf-angle','wf-shift','wf-missing'].forEach(id=>$(id).addEventListener('input',changeInput));
['wf-opacity','wf-bones','wf-explode'].forEach(id=>$(id).addEventListener('input',()=>{applyPose();if(id==='wf-explode')focusView('wrist',false);}));
$('wf-capture').onclick=()=>{setPlaying(false);poseTween=null;if(step<1)setStep(1,{perform:false});captureNow(step>=5?'after':'before');};
$('wf-human-confirm').onchange=renderResults;
$('wf-confirm-button').onclick=()=>{if(currentCapture()&&!recording&&capture.result.state==='S1'&&$('wf-human-confirm').checked&&step===7){confirmed=true;renderResults();status(`已记录快照 #${capture.number} 的本地人工确认；未控制实机或发送数据。`);}};
$('wf-theme').onclick=()=>{const light=document.documentElement.dataset.theme!=='light';document.documentElement.dataset.theme=light?'light':'dark';$('wf-theme').textContent=light?'深色主题':'明亮主题';$('wf-theme').setAttribute('aria-label',light?'切换深色主题':'切换明亮主题');};
function pickBone(id){
 $('wf-bone-select').value=id;model.highlightBone(id);$('wf-bones').checked=true;$('wf-opacity').value=8;applyPose();
 if(id==='all'){focusView('wrist');selectedLabel.hidden=true;return;}
 const bone=model.carpalBones.find(b=>b.id===id);if(!bone)return;
 focus='wrist';document.body.dataset.wfFocus='wrist';const center=bone.object.getWorldPosition(new THREE.Vector3());const from=new THREE.Vector3(.08,.095,.095).multiplyScalar(Math.max(1,1.1/camera.aspect));cameraTween={from:camera.position.clone(),to:center.clone().add(from),targetFrom:controls.target.clone(),targetTo:center,start:performance.now(),duration:1150};
 $('wf-object-detail').textContent=bone.label+'：'+bone.object.userData.detail;selectedLabel.textContent=bone.label+'（示意）';selectedLabel.hidden=false;
 document.body.dataset.wfBone=id;
}
$('wf-bone-select').onchange=e=>{setPlaying(false);pickBone(e.target.value);};
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
renderer.domElement.addEventListener('pointerdown',e=>{if(recording)return;down=[e.clientX,e.clientY];cameraTween=null;});
renderer.domElement.addEventListener('pointerup',e=>{if(recording||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;
 const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
 const hit=raycaster.intersectObjects(focus==='wrist'?model.carpalBones.map(b=>b.object):[model.room.group,model.arm.group],true).find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});
 if(!hit)return;let o=hit.object;while(o&&!o.userData.boneId&&!o.userData.label)o=o.parent;if(!o)return;
 if(o.userData.boneId){setPlaying(false);pickBone(o.userData.boneId);}else{$('wf-object-detail').textContent=(o.userData.label||o.name)+'：'+(o.userData.detail||'照片参考模型');if(o.name.includes('camera'))focusView('camera');}
});

let recordingDownloadURL=null;
async function saveRecording(blob){
 if(recordingDownloadURL)URL.revokeObjectURL(recordingDownloadURL);
 recordingDownloadURL=URL.createObjectURL(blob);
 return recordingDownloadURL;
}
function compositeRecord(){
 if(!recording)return;const {ctx,canvas}=recording;ctx.fillStyle='#0b1720';ctx.fillRect(0,0,canvas.width,canvas.height);
 const src=renderer.domElement,scale=Math.min(1340/src.width,850/src.height);ctx.drawImage(src,(1340-src.width*scale)/2,20,src.width*scale,src.height*scale);
 for(let i=0;i<2;i++){ctx.drawImage(rgbCanvases[i],1380,45+i*390,480,360);}
 ctx.fillStyle='#75dcd4';ctx.font='22px "Microsoft YaHei",sans-serif';ctx.fillText('腕关节RGB体位核对 · 全流程仿真',44,904);
 ctx.fillStyle='#eef5f8';ctx.font='600 36px "Microsoft YaHei",sans-serif';ctx.fillText(`${String(step+1).padStart(2,'0')} / ${steps[step].title}`,44,954);
 ctx.fillStyle='#b0c5ce';ctx.font='20px "Microsoft YaHei",sans-serif';
 const notes=['照片参考场景；尺寸未实测','光从手部进入镜头；RGB画面来自三维渲染','关键点由已知模型投影给出，未运行识别网络','按本次像素坐标实际计算；使用未舍入值判定','S1待人工；S2调整；S3信息不足','示意姿态复位，不是实机控制','重新采集并重新计算，形成前后对照','流程停止于人工确认，系统不自动通过'];ctx.fillText(notes[step],44,1000);
 const r=capture?.result;if(r&&step>=3){ctx.textAlign='right';ctx.fillStyle=r.state==='S1'?'#8de3d0':'#efc48a';ctx.font='600 25px "Microsoft YaHei",sans-serif';ctx.fillText(`α ${r.alpha==null?'不可计算':num(r.alpha)+'°'}   β ${r.beta==null?'不可计算':num(r.beta)+'°'}   d ${num(r.d,3)}   ${r.state}`,1860,911);ctx.fillStyle='#b0c5ce';ctx.font='19px "Microsoft YaHei",sans-serif';ctx.fillText(step===7?'等待操作者主动确认':r.reasons.join('；').slice(0,35),1860,954);ctx.textAlign='left';}
 ctx.fillStyle='#355763';ctx.fillRect(44,1040,1816,4);ctx.fillStyle='#6bd5c6';ctx.fillRect(44,1040,1816*timeline/DURATION,4);
}
function lockRecording(on){document.querySelectorAll('button,input,select').forEach(el=>{if(el.id==='wf-record')return;if(on){el.dataset.oldDisabled=String(el.disabled);el.disabled=true;}else el.disabled=el.dataset.oldDisabled==='true';});controls.enabled=!on;}
function startRecording(){
 if(recording){recording.cancelled=true;recording.recorder.stop();return;}
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){status('浏览器不支持录制，仍可逐步交互演示。');return;}
 $('wf-bone-select').value='all';model.resetHighlights();$('wf-explode').value=0;$('wf-opacity').value=35;$('wf-bones').checked=true;selectedLabel.hidden=true;
 resetScenario();const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
 const stream=canvas.captureStream(25),chunks=[],mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});recording={recorder,canvas,ctx:canvas.getContext('2d'),cancelled:false};
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onstop=async()=>{const done=recording;recording=null;setPlaying(false);lockRecording(false);$('wf-prev').disabled=step===0;$('wf-next').disabled=step===7;stream.getTracks().forEach(t=>t.stop());$('wf-record').textContent='录制48秒导览';renderResults();if(done.cancelled){status('已取消录制，未保存不完整视频。');return;}try{const url=await saveRecording(new Blob(chunks,{type:'video/webm'}));status('48秒全流程导览已生成，请点击下载本次录像。');let link=$('wf-video-result');if(!link){link=document.createElement('a');link.id='wf-video-result';link.className='button';$('wf-record').after(link);}link.href=url;link.textContent='下载本次录像';link.download='腕关节RGB交互导览.webm';link.removeAttribute('target');}catch(e){status(e.message);}};
 recorder.onerror=e=>{status('录制失败：'+e.error?.message);};lockRecording(true);$('wf-record').textContent='取消录制';recorder.start(500);setPlaying(true);
}
$('wf-record').onclick=startRecording;
document.addEventListener('visibilitychange',()=>{if(document.hidden){setPlaying(false);if(recording){recording.cancelled=true;recording.recorder.stop();}}});
controls.addEventListener('start',()=>{cameraTween=null;if(!recording)setPlaying(false);});
new ResizeObserver(()=>{const r=$('wf-stage').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();if(!recording)focusView(focus,false);}).observe($('wf-stage'));
emptyRGB();setStep(0,{snap:true,perform:false});renderPoints();renderResults();$('wf-scenario').value='deviation';status('三维流程已就绪，可逐步操作，也可播放完整流程。');document.body.dataset.wfReady='complete';
function animate(now){
 requestAnimationFrame(animate);const delta=Math.min(.2,(now-previousTime)/1000);previousTime=now;
 if(playing){timeline=Math.min(DURATION,timeline+delta);const next=Math.min(7,Math.floor(timeline/STEP_SECONDS));if(next!==step)setStep(next);$('wf-progress').value=timeline/DURATION;if(timeline>=DURATION){finished=true;setPlaying(false);}}
 if(poseTween){if(!poseTween.paused)poseTween.elapsed+=delta;const t=Math.min(1,poseTween.elapsed/poseTween.duration),smooth=t*t*(3-2*t);applyPose({angle:poseTween.from.angle*(1-smooth),shift:poseTween.from.shift*(1-smooth),missing:t<.5&&poseTween.from.missing});if(t>=1){poseTween=null;status('示意调整已完成，请再次采集核对。');}}
 if(cameraTween){const t=Math.min(1,(now-cameraTween.start)/cameraTween.duration),s=t*t*t*(t*(t*6-15)+10);camera.position.lerpVectors(cameraTween.from,cameraTween.to,s);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,s);if(t>=1)cameraTween=null;}
 model.setCaptureProgress((now%2200)/2200,[1,2,6].includes(step));controls.update();renderer.render(scene,camera);
 const rect=$('wf-stage').getBoundingClientRect();for(const [name,el] of Object.entries(markerLabels)){el.hidden=step<2||step>6||!landmarks[name].visible||focus==='room'||focus.startsWith('camera');if(!el.hidden){const p=landmarks[name].getWorldPosition(new THREE.Vector3()).project(camera);el.style.left=((p.x+1)/2*rect.width+7)+'px';el.style.top=((1-p.y)/2*rect.height-10)+'px';}}
 if(!selectedLabel.hidden){const bone=model.carpalBones.find(b=>b.id===$('wf-bone-select').value);if(bone){const p=bone.object.getWorldPosition(new THREE.Vector3()).project(camera);selectedLabel.style.left=((p.x+1)/2*rect.width+10)+'px';selectedLabel.style.top=((1-p.y)/2*rect.height-20)+'px';}}
 if(recording){compositeRecord();if(timeline>=DURATION&&recording.recorder.state==='recording')recording.recorder.stop();}
}
requestAnimationFrame(animate);
