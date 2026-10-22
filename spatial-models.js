import * as THREE from './vendor/three.module.js';

// Photo-informed scene illustration. Dimensions are estimates, not a survey.
// Anatomy is generic modelling, not a photogrammetric or CT registration result.
const Y = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness:.55, metalness:.08, ...extra});
function mesh(geometry, mat, parent, name, position = [0,0,0]) {
  const m = new THREE.Mesh(geometry, mat); m.name = name; m.position.set(...position);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent,name,size,pos,mat) { return mesh(new THREE.BoxGeometry(...size),mat,parent,name,pos); }
function sphere(parent,name,size,pos,mat) {
  const m=mesh(new THREE.SphereGeometry(1,24,16),mat,parent,name,pos);m.scale.set(...size);return m;
}
function rod(parent,name,a,b,r1,r2,mat,segments=16) {
  const av=new THREE.Vector3(...a), bv=new THREE.Vector3(...b), delta=bv.clone().sub(av);
  const m=mesh(new THREE.CylinderGeometry(r2,r1,delta.length(),segments),mat,parent,name,av.clone().add(bv).multiplyScalar(.5).toArray());
  m.quaternion.setFromUnitVectors(Y,delta.normalize());return m;
}
function pipe(parent,name,points,radius,mat,segments=40) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve,segments,radius,8,false),mat,parent,name);
}
function roundBox(parent,name,w,h,d,r,pos,mat) {
  const sh=new THREE.Shape(); const x=-w/2,y=-h/2;
  sh.moveTo(x+r,y);sh.lineTo(x+w-r,y);sh.quadraticCurveTo(x+w,y,x+w,y+r);
  sh.lineTo(x+w,y+h-r);sh.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  sh.lineTo(x+r,y+h);sh.quadraticCurveTo(x,y+h,x,y+h-r);
  sh.lineTo(x,y+r);sh.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(sh,{depth:Math.max(.002,d-2*r),bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r*.45,bevelThickness:Math.min(r,d*.25),curveSegments:8});
  g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());g.translate(-c.x,-c.y,-c.z);
  return mesh(g,mat,parent,name,pos);
}
function namedGroup(parent,name,label,detail,source='photo-reference') {
  const g=new THREE.Group();g.name=name;g.userData={label,detail,source};parent.add(g);return g;
}
function screenTexture() {
  const w=64,h=128,data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;let c=[18,40,48];
    if(y<11)c=[39,82,95];
    if(y>22&&y<104&&x>8&&x<56){
      const gx=(x-10)%15,gy=(y-25)%19;
      if(gx<8&&gy<8)c=[97,177,182];
    }
    if(y>113&&x>9&&x<55)c=[46,107,116];
    data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

// Small repeatable surface detail, generated locally without photographic textures.
function grainTexture(base,amplitude,repeat=[1,1],color=true) {
  const size=128,data=new Uint8Array(size*size*4);let seed=19731;
  for(let i=0;i<size*size;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const n=(seed/4294967296-.5)*amplitude;
    const fleck=(seed&31)===0?amplitude*.65:0;
    for(let c=0;c<3;c++)data[i*4+c]=Math.max(0,Math.min(255,base[c]+n+fleck));
    data[i*4+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  if(color)texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(...repeat);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
function curtainSurface(width,height,folds=8){
  const g=new THREE.PlaneGeometry(width,height,96,28),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),u=(x/width+.5),v=(y/height+.5);
    p.setXYZ(i,x+.004*Math.sin(v*8+u*3),y+.009*Math.cos(u*folds*TAU)*(1-v),
      .036*Math.sin(u*folds*TAU)+.007*Math.sin(u*folds*TAU*2)+.008*Math.sin(v*4+u*5));
  }
  g.computeVertexNormals();return g;
}
function screws(parent,name,positions,mat,r=.002){
  for(const p of positions){
    const s=mesh(new THREE.CylinderGeometry(r,r,.0018,10),mat,parent,name,p);
    s.castShadow=false;
  }
}

export function createRoom() {
  const group=new THREE.Group();group.name='PhotoReferencedDRRoom';
  const objects={};
  const fineBump=grainTexture([128,128,128],38,[4,4],false);
  const white=material('#e2e5e2',{roughness:.46}), ivory=material('#ecebdc',{roughness:.43,bumpMap:fineBump,bumpScale:.00018}), metal=material('#9eabb0',{metalness:.75,roughness:.32});
  const dark=material('#263239',{metalness:.16,roughness:.49}), blue=material('#607b9b');
  const floor=material('#ffffff',{map:grainTexture([84,113,145],38,[16,14]),roughness:.63,bumpMap:fineBump,bumpScale:.00065});
  const cyan=material('#5faeac',{emissive:'#174844',emissiveIntensity:.18});
  const curtainMat=material('#83b0ba',{roughness:.96,side:THREE.DoubleSide,bumpMap:fineBump,bumpScale:.00035});
  objects.room=namedGroup(group,'room','检查室','按多视角照片组织空间；房间与器械尺寸为展示性近似。');
  const room=objects.room;
  box(room,'floor',[5.6,.12,4.6],[0,-.07,0],floor);
  const wallMat=material('#d8dcda',{roughness:.93,bumpMap:fineBump,bumpScale:.0003});
  box(room,'left-wall',[.10,3.0,4.6],[-2.83,1.5,0],wallMat);
  box(room,'back-wall',[5.6,3,.10],[0,1.5,-2.34],wallMat);
  box(room,'left-skirting',[.05,.15,4.55],[-2.76,.075,0],dark);
  box(room,'back-skirting',[5.5,.15,.05],[0,.075,-2.27],dark);
  // Front wall and ceiling intentionally omitted for a cut-away view.
  const window=namedGroup(room,'window','采光窗','示意窗框、窗玻璃及两侧帘布，参考检查室照片。');
  roundBox(window,'window-frame',2.08,1.48,.07,.035,[-.55,2.02,-2.26],white);
  const glass=material('#7fa9bb',{transparent:true,opacity:.43,metalness:.45,roughness:.13});
  box(window,'window-glass',[1.94,1.34,.018],[-.55,2.02,-2.21],glass);
  box(window,'window-mid-vertical',[.042,1.36,.035],[-.55,2.02,-2.18],white);
  box(window,'window-mid-horizontal',[1.96,.042,.035],[-.55,2.02,-2.18],white);
  box(window,'window-sill',[2.18,.055,.20],[-.55,1.27,-2.20],white);
  rod(window,'curtain-rod',[-2,2.88,-2.10],[.9,2.88,-2.10],.018,.018,metal);
  for(const x0 of [-1.92,.45]){
    mesh(curtainSurface(.58,2.46),curtainMat,window,`continuous-curtain-${x0}`,[x0+.25,1.57,-2.08]);
    for(let i=0;i<9;i++){
      const ring=mesh(new THREE.TorusGeometry(.021,.0032,5,12),metal,window,'curtain-hanger',[x0-.03+i*.07,2.85,-2.10]);ring.rotation.y=Math.PI/2;
    }
    pipe(window,'curtain-bottom-hem',Array.from({length:65},(_,i)=>{
      const u=i/64;return[x0-.04+u*.58,.34+.009*Math.cos(u*8*TAU),-2.08+.036*Math.sin(u*8*TAU)+.007*Math.sin(u*16*TAU)];
    }),.0025,curtainMat,64);
  }
  const radiator=namedGroup(room,'radiator','窗下暖气片','配套环境示意，尺寸未实测。');
  for(let i=0;i<15;i++)roundBox(radiator,'radiator-fin',.058,.50,.06,.012,[-1.12+i*.083,.45,-2.17],white);
  rod(radiator,'radiator-top',[-1.18,.65,-2.17],[.12,.65,-2.17],.022,.022,white);
  rod(radiator,'radiator-bottom',[-1.18,.25,-2.17],[.12,.25,-2.17],.022,.022,white);
  const observation=namedGroup(room,'observation-window','观察窗','参考照片中的控制区观察窗；未建模窗外人员与控制室。');
  const obs=roundBox(observation,'observation-window-frame',1.32,.76,.08,.035,[-2.75,1.48,.65],white);obs.rotation.y=Math.PI/2;
  const obsg=box(observation,'observation-glass',[.025,.62,1.17],[-2.69,1.48,.65],material('#4b6570',{metalness:.6,roughness:.23}));
  const door=namedGroup(room,'back-door','门与通道','依据照片的空间要素示意，门向与精确位置未经测量。');
  roundBox(door,'door-frame',.91,2.13,.10,.025,[2.05,1.065,-2.25],metal);
  box(door,'door-leaf',[.79,2.02,.035],[2.05,1.04,-2.18],material('#879395'));
  rod(door,'door-handle',[2.30,.95,-2.12],[2.30,1.10,-2.12],.012,.012,dark);
  for(const x of [-1.62,1.45]){
    box(room,'ceiling-light-rim',[.78,.035,.54],[x,2.99,-1.08],white);
    box(room,'ceiling-light-diffuser',[.73,.009,.49],[x,2.968,-1.08],material('#fff6e1',{emissive:'#fff3d6',emissiveIntensity:.38,roughness:.75}));
  }
  const ac=namedGroup(room,'wall-air-conditioner','壁挂空调','参考机房照片的环境陈设，无设备性能含义。');
  roundBox(ac,'air-conditioner-shell',.78,.26,.18,.035,[-2.66,2.50,-1.05],white).rotation.y=Math.PI/2;
  for(let i=0;i<5;i++)box(ac,'air-conditioner-louver',[.012,.009,.65],[-2.54,2.41+i*.014,-1.05],material('#869398'));

  objects.table=namedGroup(group,'table','摄影检查床','长轴沿Z；台面、升降底座、侧轨与脚踏按照片作近似建模。');
  const table=objects.table;
  roundBox(table,'table-base',.63,.23,1.26,.07,[0,.16,.15],white);
  roundBox(table,'table-lift-column',.48,.46,.66,.04,[0,.47,.15],white);
  box(table,'column-shadow-band',[.49,.045,.67],[0,.48,.15],metal);
  roundBox(table,'table-undercarriage',.78,.14,1.93,.035,[0,.72,0],white);
  roundBox(table,'tabletop',.86,.065,2.12,.028,[0,.8275,0],ivory);
  box(table,'tabletop-edge',[.868,.027,2.10],[0,.785,0],dark);
  for(const x of [-.445,.445]){
    rod(table,'accessory-rail',[x,.738,-.91],[x,.738,.91],.018,.018,metal);
    for(const z of [-.76,.0,.76])box(table,'rail-support',[.07,.055,.05],[x*.92,.727,z],dark);
    box(table,'rail-recess',[.011,.016,1.81],[x,.721,0],dark);
    for(const z of [-.78,.78])screws(table,'rail-mount-bolt',[[x,.754,z]],metal,.003);
  }
  roundBox(table,'table-base-dark-plinth',.66,.072,1.29,.024,[0,.055,.15],dark);
  for(let i=0;i<3;i++)box(table,'lift-column-seam',[.485,.007,.665],[0,.37+i*.07,.15],material('#bbc4c5',{roughness:.6}));
  roundBox(table,'detector-tray',.62,.06,.51,.012,[0,.695,-.40],blue);
  const handle=pipe(table,'tray-handle',[[-.15,.686,-.694],[-.15,.66,-.733],[.15,.66,-.733],[.15,.686,-.694]],.011,dark,20);
  for(const x of [-.24,.24])rod(table,'base-feet',[x,.11,-.36],[x,.11,.68],.025,.025,dark);
  const foot=roundBox(table,'foot-step',.43,.045,.26,.014,[.68,.16,.42],material('#9a9c77'));
  for(const x of [.51,.85])for(const z of [.34,.50])rod(table,'step-leg',[x,.02,z],[x,.14,z],.014,.014,metal);
  for(let i=0;i<6;i++)box(table,'step-grip',[.38,.009,.009],[.68,.187,.32+i*.038],dark);
  // Thin positioning mat and headrest are demonstrative accessories.
  roundBox(table,'arm-support-pad',.42,.035,.74,.022,[0,.875,.04],material('#708d95',{roughness:.88}));

  objects.tube=namedGroup(group,'xray-tube','悬吊球管与限束器','根据照片可见外观制作；不表示已获得设备尺寸、运动范围或曝光联动。');
  const tube=objects.tube;
  for(const x of [-.80,.80]){
    box(tube,'ceiling-long-rail',[.11,.11,3.55],[x,2.94,-.1],white);
    box(tube,'rail-track',[.04,.018,3.55],[x,2.875,-.1],metal);
    for(const dx of [-.043,.043])box(tube,'rail-channel-edge',[.009,.025,3.55],[x+dx,2.885,-.1],dark);
    for(const z of [-1.6,-.55,.55,1.5])box(tube,'rail-ceiling-bracket',[.18,.035,.13],[x,3.01,z],metal);
  }
  box(tube,'cross-rail',[1.90,.12,.15],[0,2.83,-.22],white);
  roundBox(tube,'ceiling-carriage',.40,.13,.38,.03,[0,2.73,-.22],dark);
  for(let i=0;i<4;i++){
    const width=.20-i*.024;
    box(tube,'telescopic-suspension',[width,.18,width],[0,2.60-i*.14,-.22],i%2?metal:white);
  }
  const head=namedGroup(tube,'tube-head','球管机头','控制屏、手柄、限束器及镜头模块为照片参考的造型。');
  roundBox(head,'tube-housing',.53,.33,.40,.06,[0,1.99,-.22],white);
  const sideCylinder=mesh(new THREE.CylinderGeometry(.15,.15,.16,40),white,head,'tube-side-cap',[.31,2.02,-.23]);sideCylinder.rotation.z=Math.PI/2;
  const sideInset=mesh(new THREE.CylinderGeometry(.105,.105,.168,40),metal,head,'tube-side-inset',[.31,2.02,-.23]);sideInset.rotation.z=Math.PI/2;
  roundBox(head,'control-screen-frame',.185,.36,.035,.017,[0,2.10,.009],dark);
  const smat=new THREE.MeshStandardMaterial({map:screenTexture(),emissive:'#5d9dba',emissiveIntensity:.25,roughness:.37});
  box(head,'control-screen',[.155,.315,.006],[0,2.10,.031],smat);
  for(const x of [-.19,.19]){
    roundBox(head,'control-grip',.048,.20,.025,.012,[x,2.03,.013],metal);
    for(let i=0;i<3;i++)sphere(head,'control-button',[.010,.010,.006],[x,1.98+i*.045,.034],dark);
  }
  pipe(head,'outer-control-handle',[[-.29,2.24,.04],[-.34,2.21,.04],[-.34,1.81,.04],[-.28,1.76,.04],[.28,1.76,.04],[.34,1.81,.04],[.34,2.21,.04],[.29,2.24,.04]],.022,dark,64);
  roundBox(head,'collimator',.36,.17,.32,.025,[0,1.728,-.22],white);
  box(head,'collimator-window',[.25,.014,.22],[0,1.634,-.22],material('#223a46',{metalness:.45,roughness:.18}));
  box(head,'collimator-cross-x',[.25,.003,.004],[0,1.625,-.22],metal);
  box(head,'collimator-cross-z',[.004,.003,.22],[0,1.625,-.22],metal);
  screws(head,'collimator-face-screw',[[-.151,1.636,-.35],[.151,1.636,-.35],[-.151,1.636,-.09],[.151,1.636,-.09]],metal,.0022);
  const ventMat=material('#4b575a',{roughness:.9,metalness:0});
  for(let i=0;i<10;i++){
    const inset=i*.008,w=.20-inset;
    pipe(head,'tube-vent-groove',[[-w/2,1.831,-.35+inset*.7],[-w/2,1.831,-.18],[0,1.831,-.13-inset*.3],[w/2,1.831,-.18],[w/2,1.831,-.35+inset*.7]],.0015,ventMat,24);
  }
  for(const x of [-.212,.212]){
    const camera=namedGroup(head,`optical-camera-${x<0?'left':'right'}`,'镜头安装模块','外观来自照片；型号、深度感知能力和接入状态未确认。');
    const caseMat=material('#1c2227',{roughness:.62,metalness:.14});
    const sign=Math.sign(x);
    const mount=mesh(new THREE.ConeGeometry(.025,.032,20),caseMat,camera,'camera-mount-cone',[x-sign*.022,1.716,-.235]);mount.rotation.z=sign*Math.PI/2;
    sphere(camera,'camera-adjustment-joint',[.013,.013,.013],[x,1.713,-.235],dark);
    box(camera,'camera-bracket',[.047,.016,.044],[x,1.718,-.235],caseMat);
    roundBox(camera,'camera-housing',.073,.077,.078,.006,[x,1.685,-.235],caseMat);
    box(camera,'camera-housing-seam',[.074,.002,.079],[x,1.707,-.235],dark);
    box(camera,'camera-optical-face',[.062,.002,.066],[x,1.646,-.235],material('#10171d',{roughness:.4,metalness:.12}));
    const lens=mesh(new THREE.CylinderGeometry(.016,.016,.012,24),metal,camera,'camera-lens',[x,1.641,-.22]);
    mesh(new THREE.CylinderGeometry(.010,.010,.013,24),material('#387688',{metalness:.7,roughness:.1}),camera,'camera-lens-glass',[x,1.638,-.22]);
    // The primary glass origin is unchanged: acquisition rays still end here.
    mesh(new THREE.CylinderGeometry(.011,.011,.008,24),dark,camera,'camera-secondary-window-rim',[x,1.641,-.253]);
    mesh(new THREE.CylinderGeometry(.0075,.0075,.009,24),material('#223c47',{metalness:.5,roughness:.18}),camera,'camera-secondary-window-glass',[x,1.638,-.253]);
    for(let row=0;row<5;row++)for(let col=0;col<5;col++){
      const hole=mesh(new THREE.CircleGeometry(.00115,7),ventMat,camera,'camera-vent-perforation',[x-.021+col*.0105,1.665+row*.009,-.1948]);hole.castShadow=false;
    }
    pipe(camera,'camera-lead',[[x,1.721,-.258],[x+sign*.028,1.756,-.274],[x+sign*.018,1.787,-.29],[x-sign*.025,1.795,-.31]],.0031,caseMat,22);
    for(const dy of [0,.006,.012])box(camera,'camera-cable-strain-relief',[.010,.003,.010],[x,1.724+dy,-.258],dark);
  }
  // Ribbed flexible cables, represented by a centre curve with evenly spaced rings.
  const cablePoints=[[.34,2.13,-.37],[.75,2.1,-.65],[.92,2.55,-.65],[1.3,2.72,-1.15]];
  const cableCurve=new THREE.CatmullRomCurve3(cablePoints.map(p=>new THREE.Vector3(...p)));
  mesh(new THREE.TubeGeometry(cableCurve,48,.047,10,false),white,tube,'flexible-cable');
  for(let i=0;i<30;i++){
    const t=i/29,pos=cableCurve.getPoint(t),tangent=cableCurve.getTangent(t);
    const ring=mesh(new THREE.TorusGeometry(.047,.004,5,12),metal,tube,'cable-rib',pos.toArray());
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent);
  }
  // Visible light field, not simulated X-ray attenuation or radiation.
  const fieldMat=new THREE.MeshBasicMaterial({color:'#85d6c5',transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false});
  const field=mesh(new THREE.PlaneGeometry(.29,.34),fieldMat,tube,'light-field',[0,.898,-.22]);field.rotation.x=-Math.PI/2;
  field.userData={label:'可见光野示意',source:'illustration',detail:'仅表达观察区域，不模拟X线剂量或曝光。'};

  objects.detector=namedGroup(group,'wall-detector','立位探测器架','根据实拍的立柱、探测器和底座造型近似建模。');
  const detector=objects.detector;detector.position.set(1.62,0,-1.27);
  roundBox(detector,'detector-base',.70,.12,.65,.045,[0,.09,0],white);
  roundBox(detector,'detector-column',.20,2.30,.24,.025,[0,1.26,0],white);
  box(detector,'detector-track',[.065,1.87,.02],[0,1.2,.133],metal);
  roundBox(detector,'detector-carriage',.34,.18,.17,.02,[0,1.32,.16],metal);
  roundBox(detector,'detector-back',.56,.57,.095,.035,[0,1.40,.265],white);
  roundBox(detector,'detector-front',.49,.50,.025,.018,[0,1.40,.327],dark);
  const outlineMat=material('#8fa7ac',{roughness:.65});
  for(const x of [-.098,.098])box(detector,'detector-guide',[.004,.28,.003],[x,1.4,.345],outlineMat);
  for(const y of [1.26,1.54])box(detector,'detector-guide',[.20,.004,.003],[0,y,.345],outlineMat);
  box(detector,'detector-centre-h',[.08,.003,.003],[0,1.40,.346],outlineMat);
  box(detector,'detector-centre-v',[.003,.08,.003],[0,1.40,.346],outlineMat);
  pipe(detector,'detector-handle',[[-.33,1.62,.30],[-.36,1.62,.34],[-.36,1.2,.34],[-.33,1.2,.30]],.014,metal,25);

  objects.shield=namedGroup(group,'mobile-shield','移动防护屏','蓝色防护屏与滚轮底架的场景示意，不表示屏蔽性能参数。');
  const shield=objects.shield;shield.position.set(1.82,0,.28);shield.rotation.y=-.32;
  roundBox(shield,'shield-panel',.72,.98,.05,.02,[0,.86,0],material('#3a6395'));
  for(const x of [-.39,.39]){
    rod(shield,'shield-frame',[x,.10,0],[x,1.44,0],.016,.016,metal);
    rod(shield,'shield-foot',[x,.095,-.28],[x,.095,.28],.018,.018,metal);
    for(const z of [-.24,.24]){const wh=mesh(new THREE.CylinderGeometry(.055,.055,.035,16),dark,shield,'shield-wheel',[x,.06,z]);wh.rotation.z=Math.PI/2;}
  }
  rod(shield,'shield-crossbar',[-.39,1.44,0],[.39,1.44,0],.016,.016,metal);

  objects.cart=namedGroup(group,'utility-cart','配套移动小车','参考检查室照片的配套设备；内部结构与功能未按工程图建模。');
  const cart=objects.cart;cart.position.set(-1.55,0,-.75);
  roundBox(cart,'cart-body',.55,.61,.44,.065,[0,.42,0],white);
  box(cart,'cart-front-insert',[.37,.36,.018],[0,.47,.237],metal);
  roundBox(cart,'cart-top',.60,.035,.49,.018,[0,.755,0],ivory);
  for(const x of [-.20,.20])for(const z of [-.16,.16]){const wh=mesh(new THREE.CylinderGeometry(.065,.065,.043,16),dark,cart,'cart-wheel',[x,.09,z]);wh.rotation.z=Math.PI/2;}
  pipe(cart,'cart-handle',[[-.26,.79,-.22],[-.26,.93,-.22],[.26,.93,-.22],[.26,.79,-.22]],.016,metal,20);
  roundBox(cart,'cart-accessory',.21,.065,.18,.018,[-.12,.81,0],blue);

  objects.stool=namedGroup(group,'stool','操作凳','示意座面、升降柱、五脚底座与滚轮。');
  const stool=objects.stool;stool.position.set(-.98,0,.75);
  mesh(new THREE.CylinderGeometry(.23,.22,.06,32),dark,stool,'stool-seat',[0,.51,0]);
  rod(stool,'stool-post',[0,.12,0],[0,.48,0],.035,.025,metal);
  for(let i=0;i<5;i++){
    const a=i*TAU/5,p=[Math.sin(a)*.26,.09,Math.cos(a)*.26];
    rod(stool,'stool-leg',[0,.14,0],p,.019,.014,metal);
    const wh=mesh(new THREE.SphereGeometry(.036,12,8),dark,stool,'stool-caster',[p[0],.045,p[2]]);wh.scale.y=.85;
  }
  const focuses={
    room:{position:[5.2,4.3,5.6],target:[0,1.2,0]},
    equipment:{position:[2.5,2.65,2.5],target:[0,1.95,-.22]},
    camera:{position:[.75,1.35,.65],target:[0,1.72,-.22]},
    table:{position:[1.65,2.1,1.9],target:[0,.86,-.05]},
    detector:{position:[3.2,1.95,1.4],target:[1.62,1.25,-1.0]}
  };
  const assumptions={source:'用户多视角检查室及设备照片',method:'照片参考的参数化手工建模',unit:'meter',nominalRoomSize:[5.6,3,4.6],measured:false,photogrammetry:false,tableSurfaceY:.86,armPlacement:[0,.925,-.14],boundsNote:'省略前墙、屋顶以观察内部；尺寸和位置关系为展示近似，不可用于安装规划或设备碰撞评估。'};
  return {group,objects,focuses,assumptions};
}

// Smooth elliptical sections create continuous limb silhouettes instead of pipes.
function loftGeometry(profiles,radialSegments=32) {
  const positions=[],uv=[],indices=[];
  const ascending=profiles[profiles.length-1].z>profiles[0].z;
  for(let j=0;j<profiles.length;j++){
    const p=profiles[j];
    for(let i=0;i<=radialSegments;i++){
      const a=i/radialSegments*TAU;
      positions.push((p.cx||0)+Math.cos(a)*p.rx,(p.cy||0)+Math.sin(a)*p.ry,p.z);
      uv.push(i/radialSegments,j/(profiles.length-1));
    }
  }
  for(let j=0;j<profiles.length-1;j++)for(let i=0;i<radialSegments;i++){
    const a=j*(radialSegments+1)+i,b=a+radialSegments+1;
    if(ascending)indices.push(a,a+1,b,b,a+1,b+1);
    else indices.push(a,b,a+1,b,b+1,a+1);
  }
  const first=profiles[0],last=profiles[profiles.length-1];
  const ci=positions.length/3;positions.push(first.cx||0,first.cy||0,first.z,last.cx||0,last.cy||0,last.z);uv.push(.5,0,.5,1);
  const end=(profiles.length-1)*(radialSegments+1);
  for(let i=0;i<radialSegments;i++){
    if(ascending){indices.push(ci,i+1,i);indices.push(ci+1,end+i,end+i+1);}
    else{indices.push(ci,i,i+1);indices.push(ci+1,end+i+1,end+i);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function finger(parent,name,points,radii,skin,nails) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const segments=20,radial=14,pos=[],idx=[];
  for(let j=0;j<=segments;j++){
    const t=j/segments,p=curve.getPoint(t),tangent=curve.getTangent(t);
    const n=new THREE.Vector3(0,1,0),b=new THREE.Vector3().crossVectors(tangent,n).normalize();
    n.crossVectors(b,tangent).normalize();
    const radius=(radii[0]*(1-t)+radii[1]*t)*(j===segments?.45:1);
    for(let i=0;i<=radial;i++){
      const a=i/radial*TAU,q=p.clone().addScaledVector(b,Math.cos(a)*radius).addScaledVector(n,Math.sin(a)*radius*.84);
      pos.push(...q.toArray());
    }
  }
  for(let j=0;j<segments;j++)for(let i=0;i<radial;i++){const a=j*(radial+1)+i,b=a+radial+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  mesh(g,skin,parent,name);
  const tip=curve.getPoint(.93);
  sphere(parent,`${name}-tip`,[radii[1]*.86,radii[1]*.72,radii[1]*.86],curve.getPoint(.98).toArray(),skin);
  const nail=sphere(parent,`${name}-nail`,[radii[1]*.65,.00075,radii[1]*1.02],[tip.x,tip.y+radii[1]*.69,tip.z],nails);
  return curve;
}

// Eight distinct teaching shapes. Their contours are hand-modelled from the
// photographed teaching skeleton; none is an individual patient's segmentation.
function smoothBoneLoft(profiles){
  const sections=[];
  for(let j=0;j<profiles.length-1;j++)for(let k=0;k<6;k++){
    const t=k/6,s=t*t*(3-2*t),a=profiles[j],b=profiles[j+1],p={};
    for(const key of ['rx','ry','cx','cy'])p[key]=(a[key]||0)*(1-s)+(b[key]||0)*s;
    p.z=a.z+(b.z-a.z)*t;sections.push(p);
  }
  sections.push(profiles[profiles.length-1]);return loftGeometry(sections,36);
}
function roundedBoneOutline(points,thickness,bevel=.0013){
  const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,z,0)),true,'centripetal');
  const outline=curve.getPoints(72).map(p=>new THREE.Vector2(p.x,p.y));
  const depth=thickness-2*bevel;
  const g=new THREE.ExtrudeGeometry(new THREE.Shape(outline),{depth,steps:1,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:5,curveSegments:12});
  g.rotateX(Math.PI/2);g.translate(0,depth/2,0);return g;
}
function joinedBoneGeometry(parts){
  // All anatomical surface detail lives in one Mesh/material, including the
  // hamate hook, so selection colour and exploded motion cannot drift apart.
  const positions=[],normals=[],uvs=[];
  for(const original of parts){
    const g=original.index?original.toNonIndexed():original;
    const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){
      positions.push(p.getX(i),p.getY(i),p.getZ(i));
      normals.push(n.getX(i),n.getY(i),n.getZ(i));
      uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function carpalGeometry(index){
  if(index===0)return smoothBoneLoft([
    {z:.013,rx:.001,ry:.001,cx:.001},
    {z:.010,rx:.006,ry:.005,cx:.001},
    {z:.004,rx:.0066,ry:.006,cx:0},
    {z:-.001,rx:.0047,ry:.0048,cx:-.001},
    {z:-.007,rx:.0055,ry:.006,cx:-.002},
    {z:-.012,rx:.004,ry:.005,cx:-.001},
    {z:-.014,rx:.0007,ry:.001,cx:0}
  ]); // Curved scaphoid with a visible waist.
  if(index===1)return roundedBoneOutline([
    [-.006,.003],[-.005,.007],[0,.008],[.005,.006],[.0065,.001],
    [.006,-.005],[.003,-.003],[0,-.0018],[-.003,-.003],[-.006,-.005]
  ],.013,.0011); // Crescent outline with a distal concavity.
  if(index===2)return roundedBoneOutline([
    [-.005,.005],[.004,.006],[.0065,.0015],[.003,-.0055],[-.004,-.005],[-.006,.0005]
  ],.012,.0012); // Rounded triangular body.
  if(index===3)return smoothBoneLoft([
    {z:.0058,rx:.0005,ry:.0006},{z:.004,rx:.0038,ry:.0045,cx:.0005},
    {z:.001,rx:.0048,ry:.0047,cx:.001},{z:-.002,rx:.0043,ry:.0042,cx:.0003},
    {z:-.005,rx:.0027,ry:.0035,cx:-.001},{z:-.006,rx:.0005,ry:.0007,cx:-.001}
  ]); // Pisiform, separate on the palmar side of the triquetrum.
  if(index===4){
    const g=roundedBoneOutline([[-.006,-.006],[.004,-.0065],[.007,0],[.004,.006],[-.004,.0065],[-.007,.001]],.012,.0012);
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),y=p.getY(i);
      if(y>0)p.setY(i,y-.0013*Math.exp(-(x*x)/.000012)*Math.cos(z*170));
    }
    g.computeVertexNormals();return g; // Shallow saddle surface of trapezium.
  }
  if(index===5)return roundedBoneOutline([
    [-.0035,.005],[.003,.0048],[.0045,-.004],[-.0045,-.005]
  ],.010,.0011); // Compact wedge rather than another spherical bone.
  if(index===6)return smoothBoneLoft([
    {z:.012,rx:.001,ry:.001},{z:.0095,rx:.0049,ry:.0051},
    {z:.006,rx:.0061,ry:.006},{z:.002,rx:.0043,ry:.0047},
    {z:-.002,rx:.0048,ry:.0053},{z:-.007,rx:.006,ry:.006},
    {z:-.011,rx:.0054,ry:.0053},{z:-.012,rx:.0015,ry:.002}
  ]); // Distinct rounded head, neck and broader distal base of capitate.
  const body=roundedBoneOutline([
    [-.005,.006],[.004,.005],[.007,-.005],[.002,-.008],[-.006,-.006],[-.006,.001]
  ],.012,.0012);
  const hookCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.001,-.004,-.003),new THREE.Vector3(-.001,-.009,-.003),
    new THREE.Vector3(-.002,-.014,-.002),new THREE.Vector3(-.005,-.016,0),
    new THREE.Vector3(-.006,-.014,.001)
  ]);
  const hook=new THREE.TubeGeometry(hookCurve,28,.0021,12,false);
  const tip=new THREE.SphereGeometry(.0021,16,12);tip.translate(-.006,-.014,.001);
  return joinedBoneGeometry([body,hook,tip]);
}

export function createArm() {
  const group=new THREE.Group();group.name='GenericArmIllustration';
  group.userData={label:'示意人体上肢',source:'generic-anatomy',detail:'参考实拍外观与实体模型的简化造型；未从真人照片恢复个体表面，未与CT配准。'};
  const poseRoot=new THREE.Group();poseRoot.name='LimbPoseOffset';group.add(poseRoot);
  const forearm=namedGroup(poseRoot,'forearm','前臂与肘部','E位于示意肘部，腕W为局部原点。','generic-anatomy');
  const hand=namedGroup(poseRoot,'hand','腕、手掌与手指','手掌绕腕点在XZ投影平面变化；不是患者旋前/旋后角。','generic-anatomy');
  const skin=material('#cfa68e',{roughness:.75,metalness:0,bumpMap:grainTexture([128,128,128],32,[5,8],false),bumpScale:.000035});
  const skinDetail=material('#b88d78',{roughness:.84,metalness:0});
  const nails=material('#d8b29f',{roughness:.47,metalness:0});
  const skinMaterials=[skin,skinDetail,nails];
  mesh(loftGeometry([
    {z:-.010,rx:.024,ry:.017},{z:.005,rx:.026,ry:.018},{z:.028,rx:.028,ry:.021},
    {z:.065,rx:.034,ry:.026},{z:.115,rx:.040,ry:.030},{z:.17,rx:.044,ry:.033},
    {z:.22,rx:.044,ry:.034},{z:.255,rx:.038,ry:.031},{z:.285,rx:.034,ry:.030}
  ]),skin,forearm,'forearm-surface');
  mesh(loftGeometry([
    {z:.265,cx:0,cy:.0,rx:.036,ry:.030},{z:.29,cx:.006,cy:.003,rx:.038,ry:.033},
    {z:.33,cx:.019,cy:.011,rx:.046,ry:.037},{z:.39,cx:.046,cy:.022,rx:.054,ry:.043},
    {z:.46,cx:.078,cy:.037,rx:.059,ry:.046},{z:.52,cx:.100,cy:.050,rx:.059,ry:.046}
  ]),skin,forearm,'upper-arm-surface');
  mesh(loftGeometry([
    {z:-.002,rx:.025,ry:.018},{z:-.020,cx:-.001,rx:.030,ry:.019},{z:-.044,cx:-.001,rx:.037,ry:.018},
    {z:-.068,cx:.001,rx:.042,ry:.016},{z:-.088,cx:.002,rx:.040,ry:.014},{z:-.101,cx:.002,rx:.034,ry:.011}
  ]),skin,hand,'palm-surface');
  // Very shallow creases provide readable articulation without texture identity.
  pipe(hand,'wrist-crease',[[-.022,.017,-.010],[0,.019,-.012],[.023,.016,-.010]],.00052,skinDetail,20);
  const fingers=[
    {name:'index',x:-.027,length:.080,r:.010,spread:-.008},
    {name:'middle',x:-.008,length:.092,r:.0108,spread:-.002},
    {name:'ring',x:.014,length:.084,r:.010,spread:.006},
    {name:'little',x:.033,length:.064,r:.0086,spread:.014}
  ];
  const fingerCurves=[];
  fingers.forEach(f=>{
    const pts=[[f.x,.001,-.084],[f.x+f.spread*.3,.003,-.113],[f.x+f.spread*.7,-.001,-.084-f.length*.65],[f.x+f.spread,-.007,-.084-f.length]];
    fingerCurves.push(finger(hand,f.name,pts,[f.r,f.r*.72],skin,nails));
  });
  sphere(hand,'thenar-eminent',[.021,.017,.036],[-.029,-.002,-.030],skin);
  const thumbPoints=[[-.028,-.003,-.025],[-.046,-.003,-.048],[-.064,-.005,-.070],[-.078,-.009,-.092]];
  const thumbCurve=finger(hand,'thumb',thumbPoints,[.012,.0087],skin,nails);

  const bones=namedGroup(poseRoot,'generic-bones','示意骨骼','简化桡尺骨、腕骨、掌骨及指骨；仅用于解释，不作为患者骨分割。','generic-anatomy');
  const armBones=new THREE.Group(),handBones=new THREE.Group();bones.add(armBones);hand.add(handBones);handBones.name='hand-bones';
  const boneMat=material('#ece3ce',{roughness:.79,metalness:0,bumpMap:grainTexture([128,128,128],42,[2,3],false),bumpScale:.00010});
  const jointMat=material('#d3cbb9',{roughness:.84,metalness:0});
  rod(armBones,'radius-shaft',[-.012,0,.025],[-.021,0,.246],.009,.006,boneMat,14);
  sphere(armBones,'radius-distal',[.016,.010,.016],[-.013,0,.020],boneMat);
  sphere(armBones,'radius-proximal',[.010,.010,.013],[-.020,0,.252],boneMat);
  rod(armBones,'ulna-shaft',[.015,0,.025],[.016,0,.265],.005,.008,boneMat,14);
  sphere(armBones,'ulna-head',[.008,.009,.010],[.015,0,.023],boneMat);
  sphere(armBones,'ulna-olecranon',[.013,.012,.019],[.015,0,.266],boneMat);
  rod(armBones,'humerus-shaft',[.005,.003,.292],[.090,.045,.515],.013,.018,boneMat,16);
  sphere(armBones,'humerus-distal',[.025,.014,.015],[.004,.001,.283],boneMat);
  // Joint spaces and two unequal rows follow the photographed teaching model.
  // Bone locations can change visually; E/W/M/T and the movement model are fixed.
  const carpals=[[-.019,0,-.014],[-.003,0,-.013],[.0135,0,-.014],[.018,-.011,-.013],[-.024,0,-.038],[-.010,0,-.034],[.004,0,-.038],[.020,0,-.037]];
  const shapeNotes=['舟骨：弯曲长轴与腰部收窄','月骨：远侧凹弧','三角骨：圆钝三角形','豆骨：掌侧豆状体','大多角骨：浅鞍状表面','小多角骨：紧凑楔形','头状骨：头、颈及基底','钩骨：掌侧钩突'];
  carpals.forEach((position,i)=>{
    const b=mesh(carpalGeometry(i),boneMat,handBones,`carpal-illustration-${i+1}`,position);
    b.userData={source:'generic-anatomy',shapeNote:shapeNotes[i],patientSpecific:false};
  });
  fingers.forEach((f,i)=>{
    rod(handBones,`${f.name}-metacarpal`,[f.x*.65,0,-.039],[f.x,.001,-.088],.0042,.0056,boneMat,12);
    const curve=fingerCurves[i];
    [[0,.38],[.43,.72],[.77,.96]].forEach(([a,b],n)=>{
      const pa=curve.getPoint(a),pb=curve.getPoint(b);rod(handBones,`${f.name}-phalanx-${n+1}`,pa.toArray(),pb.toArray(),.0048-n*.0009,.0045-n*.0009,boneMat,10);
      sphere(handBones,`${f.name}-joint-${n+1}`,[.0049-n*.0007,.0044-n*.0007,.0049-n*.0007],pb.toArray(),jointMat);
    });
  });
  rod(handBones,'thumb-metacarpal',[-.022,0,-.025],[-.046,-.003,-.048],.005,.006,boneMat,12);
  [[.30,.63],[.68,.95]].forEach(([a,b],i)=>rod(handBones,`thumb-phalanx-${i+1}`,thumbCurve.getPoint(a).toArray(),thumbCurve.getPoint(b).toArray(),.0055-i*.001,.005-i*.001,boneMat,12));
  const pointMat=material('#62d0c0',{emissive:'#1f8071',emissiveIntensity:.35,roughness:.38});
  const landmarks={
    E:sphere(forearm,'E',[.006,.006,.006],[0,.040,.28],pointMat),
    W:sphere(poseRoot,'W',[.006,.006,.006],[0,.028,0],pointMat),
    M:sphere(hand,'M',[.006,.006,.006],[0,.023,-.084],pointMat),
    T:sphere(hand,'T',[.005,.005,.005],[-.078,.006,-.092],pointMat)
  };
  for(const [name,point] of Object.entries(landmarks))point.userData={label:`${name} 示意点`,source:'synthetic-landmark',detail:'可见性和位置由演示输入控制，未运行图像识别。'};
  const occluderMat=material('#567184',{transparent:true,opacity:.67,roughness:.85,depthWrite:false});
  const occluder=roundBox(hand,'illustrative-occluder',.060,.004,.053,.007,[-.008,.042,-.084],occluderMat);
  occluder.userData={label:'标记遮挡示意',source:'illustration',detail:'表示M点不可见条件，不代表已完成遮挡检测。'};occluder.visible=false;
  const pose={alphaDeg:0,translation:0,missing:false,skinOpacity:1,bonesVisible:false};
  function setPose(next={}) {
    Object.assign(pose,next);
    const alpha=Number.isFinite(pose.alphaDeg)?pose.alphaDeg:0;
    const tx=Number.isFinite(pose.translation)?pose.translation:0;
    // Positive 2D deviation is to the right, hence negative Y rotation for a -Z hand.
    hand.rotation.y=-THREE.MathUtils.degToRad(alpha);poseRoot.position.x=tx;
    const opacity=THREE.MathUtils.clamp(Number.isFinite(pose.skinOpacity)?pose.skinOpacity:1,0,1);
    skinMaterials.forEach(mat=>{mat.opacity=opacity;mat.transparent=opacity<.995;mat.depthWrite=opacity>=.995;});
    bones.visible=!!pose.bonesVisible;handBones.visible=!!pose.bonesVisible;
    landmarks.M.visible=!pose.missing;occluder.visible=!!pose.missing;
    group.updateMatrixWorld(true);
  }
  setPose();
  return {group,poseRoot,hand,forearm,landmarks,bones,handBones,skinMaterials,occluder,setPose,
    assumptions:{source:'用户手部和实体骨骼照片的外观参考',method:'通用示意模型',patientSpecific:false,registeredToCT:false,unit:'meter',elbowReferenceDistance:.28,translationSemantics:'whole limb X shift in meters',angleSemantics:'visible hand rotation in the XZ projection plane; not anatomical pronation/supination'}};
}
