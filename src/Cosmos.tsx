import { useEffect, useRef } from 'react';
import { buffer, context, follow, program, reducedMotion } from './gl';

/**
 * Open space around the viewer, not a sky seen from the ground: no haze, no twinkling, no meteors.
 * - A volume of stars at real distances around the camera, tiled endlessly, so moving gives parallax.
 * - Fine dust close by, which slides past quickly and gives the sense of moving through something.
 * - A far field of stars and a few small galaxies, too distant to move except as the view turns.
 * Moving fast smears the near stars along the direction of travel (motion blur, not a painted effect).
 *
 * A page can steer it through `camera` (the star map shares its view, and its zoom as travel); otherwise the
 * viewer drifts forward slowly, scrolling carries them further, and the pointer shifts them sideways.
 */
export type CosmosCamera={yaw:number;pitch:number;travel:number};
const rand=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const BOX=40,DUST_BOX=7;

const VIEW=`
uniform float u_yaw;uniform float u_pitch;uniform vec2 u_res;uniform float u_focal;uniform float u_dpr;
vec3 rot(vec3 p){float cy=cos(u_yaw),sy=sin(u_yaw),cp=cos(u_pitch),sp=sin(u_pitch);float a=p.x*cy+p.z*sy,b=p.z*cy-p.x*sy;return vec3(a,p.y*cp-b*sp,p.y*sp+b*cp);}
vec4 place(vec3 r){vec2 s=u_res*.5+r.xy*u_focal/(-r.z);vec2 c=s/u_res*2.0-1.0;return vec4(c.x,-c.y,0.0,1.0);}
/** Star colour by temperature: blue-white through white and yellow to the occasional red dwarf. */
vec3 tint(float t){vec3 blue=vec3(.66,.77,1.0),white=vec3(1.0,.98,.95),gold=vec3(1.0,.82,.56),red=vec3(1.0,.58,.42);
 return t<.35?mix(blue,white,t/.35):t<.85?mix(white,gold,(t-.35)/.5):mix(gold,red,(t-.85)/.15);}`;
const FAR_V=`attribute vec3 a_dir;attribute float a_size;attribute float a_bright;attribute float a_temp;
uniform float u_alpha;varying vec3 v_color;varying float v_alpha;${VIEW}
void main(){vec3 r=rot(a_dir);if(r.z>-.02){gl_Position=vec4(2.0);gl_PointSize=0.0;return;}
 gl_Position=place(r);gl_PointSize=a_size*u_dpr;v_color=tint(a_temp);v_alpha=a_bright*u_alpha;}`;
const VOL_V=`attribute vec3 a_pos;attribute float a_size;attribute float a_bright;attribute float a_temp;attribute float a_end;
uniform vec3 u_cam;uniform vec3 u_vel;uniform float u_box;uniform float u_blur;uniform float u_sizeK;uniform float u_alpha;
varying vec3 v_color;varying float v_alpha;${VIEW}
void main(){
 vec3 p=a_pos-u_cam;p=mod(p+u_box*.5,u_box)-u_box*.5;
 // The tail of a streak is where the star appeared a moment ago, relative to the moving camera.
 p+=a_end*u_vel*u_blur;
 vec3 r=rot(p);float depth=-r.z;
 if(depth<.06){gl_Position=vec4(2.0);gl_PointSize=0.0;return;}
 gl_Position=place(r);
 gl_PointSize=clamp(a_size*u_sizeK/depth,.7,7.0)*u_dpr;
 // Stars arrive out of the far dark and fade before they reach the eye, so none pop in or out.
 float fade=smoothstep(u_box*.5,u_box*.28,depth)*smoothstep(.06,.7,depth);
 v_color=tint(a_temp);v_alpha=a_bright*u_alpha*fade*(1.0-a_end*.92);
}`;
const STAR_F=`precision mediump float;varying vec3 v_color;varying float v_alpha;uniform float u_lines;
void main(){float a=v_alpha;if(u_lines<.5){float d=length(gl_PointCoord-.5)*2.0;a*=smoothstep(1.0,.0,d)*(.5+.5*smoothstep(.45,.0,d));}gl_FragColor=vec4(v_color*a,a);}`;
const GAL_V=`attribute vec3 a_dir;attribute float a_size;attribute float a_bright;attribute float a_temp;attribute float a_tilt;attribute float a_ratio;
uniform float u_alpha;varying float v_alpha;varying float v_tilt;varying float v_ratio;varying float v_temp;${VIEW}
void main(){vec3 r=rot(a_dir);if(r.z>-.02){gl_Position=vec4(2.0);gl_PointSize=0.0;return;}
 gl_Position=place(r);gl_PointSize=a_size*u_dpr;v_alpha=a_bright*u_alpha;v_tilt=a_tilt;v_ratio=a_ratio;v_temp=a_temp;}`;
/** A distant galaxy: a bright core in an inclined disc, faint arms on the larger ones. */
const GAL_F=`precision mediump float;varying float v_alpha;varying float v_tilt;varying float v_ratio;varying float v_temp;
void main(){vec2 p=(gl_PointCoord-.5)*2.0;float c=cos(v_tilt),s=sin(v_tilt);p=vec2(c*p.x-s*p.y,s*p.x+c*p.y);p.y/=v_ratio;
 float r=length(p);if(r>1.0)discard;float ang=atan(p.y,p.x);
 float arms=.55+.45*sin(ang*2.0-log(r+.05)*4.0);
 float disc=exp(-r*4.5)*mix(.7,arms,smoothstep(.1,.4,r)),core=exp(-r*r*90.0);
 float a=(disc*.55+core)*v_alpha*smoothstep(1.0,.7,r);
 vec3 col=mix(vec3(.82,.86,1.0),vec3(1.0,.9,.76),v_temp);gl_FragColor=vec4(mix(col,vec3(1.0),core)*a,a);}`;

function farField(count:number){
 // Even scatter plus a band: the plane of the galaxy, seen from inside it.
 const out=new Float32Array(count*6),n=[.32,.88,.35].map((v,_,a)=>v/Math.hypot(...a)),al=Math.hypot(n[1],n[0]),u=[n[1]/al,-n[0]/al,0],v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
 for(let i=0;i<count;i++){let d:number[];
  if(rand(i*3.1)<.55){const th=rand(i*7.7)*Math.PI*2,g=(rand(i*1.3)+rand(i*2.9)+rand(i*4.1)-1.5)*.16,c=Math.cos(g),sn=Math.sin(g);d=[0,1,2].map(k=>u[k]*Math.cos(th)*c+v[k]*Math.sin(th)*c+n[k]*sn);}
  else{const th=rand(i*5.3)*Math.PI*2,z=rand(i*8.9)*2-1,r=Math.sqrt(1-z*z);d=[r*Math.cos(th),z,r*Math.sin(th)];}
  const m=Math.pow(rand(i*6.7),6);out.set([d[0],d[1],d[2],1.4+m*2.8,.26+Math.pow(rand(i*9.1),2)*.5+m*.4,rand(i*2.3)],i*6);}
 return out;
}
/** Volume stars: position in the box, size, brightness, temperature, and which end of a streak (0 head, 1 tail). */
function volume(count:number,box:number,seed:number,sizeBase:number,bright:number){
 const out=new Float32Array(count*14);
 for(let i=0;i<count;i++){const s=i*1.618+seed,p=[(rand(s*3.3)-.5)*box,(rand(s*5.1)-.5)*box,(rand(s*7.9)-.5)*box],m=Math.pow(rand(s*9.7),4);
  const star=[p[0],p[1],p[2],sizeBase*(1+m*3),bright*(.35+rand(s*2.2)*.65),rand(s*4.6)];out.set([...star,0,...star,1],i*14);}
 return out;
}
function galaxies(count:number){
 const out=new Float32Array(count*8);
 for(let i=0;i<count;i++){const th=rand(i*41.3)*Math.PI*2,z=rand(i*17.1)*1.6-.8,r=Math.sqrt(1-z*z);
  out.set([r*Math.cos(th),z,r*Math.sin(th),16+rand(i*5.5)*34,.35+rand(i*6.6)*.35,rand(i*7.7),rand(i*8.8)*Math.PI,.3+rand(i*9.9)*.6],i*8);}
 return out;
}

export function Cosmos({camera,intensity=1}:{camera?:{current:CosmosCamera};intensity?:number}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const c=ref.current!,gl=context(c);if(!gl)return;
  let far:ReturnType<typeof program>,vol:ReturnType<typeof program>,gal:ReturnType<typeof program>;
  try{far=program(gl,FAR_V,STAR_F);vol=program(gl,VOL_V,STAR_F);gal=program(gl,GAL_V,GAL_F);}catch{return;}
  const small=innerWidth<700,nFar=small?5000:11000,nVol=small?1400:2800,nDust=small?160:320,nGal=9;
  const farBuf=buffer(gl,farField(nFar),[['a_dir',3],['a_size',1],['a_bright',1],['a_temp',1]]);
  const volLayout:[string,number][]=[['a_pos',3],['a_size',1],['a_bright',1],['a_temp',1],['a_end',1]];
  const starBuf=buffer(gl,volume(nVol,BOX,1,1.6,1),volLayout),dustBuf=buffer(gl,volume(nDust,DUST_BOX,77,.6,.32),volLayout);
  const galBuf=buffer(gl,galaxies(nGal),[['a_dir',3],['a_size',1],['a_bright',1],['a_temp',1],['a_tilt',1],['a_ratio',1]]);
  const still=reducedMotion(),cam=[0,0,0],vel=[0,0,0],startScroll=scrollY;
  let first=true,frame=0,last=performance.now(),mx=0,my=0,shiftX=0,shiftY=0,drift=0,flown=0,yaw=rand(3)*6,pitch=-.15;
  const move=(e:PointerEvent)=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5;};
  addEventListener('pointermove',move,{passive:true});
  const draw=(now:number)=>{
   frame=requestAnimationFrame(draw);
   const dt=Math.min(.05,(now-last)/1000)||.016;last=now;
   const w=c.clientWidth,h=c.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5),focal=Math.max(w,h)*.55;
   const pw=Math.round(w*dpr),ph=Math.round(h*dpr);if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph;}gl.viewport(0,0,pw,ph);
   // Where the viewer is and which way they face.
   let forward=0;
   const view=camera?.current;
   if(view){yaw=view.yaw;pitch=view.pitch;forward=view.travel;}
   else{
    shiftX=follow(shiftX,still?0:mx*1.6,1.6,dt);shiftY=follow(shiftY,still?0:my*1.1,1.6,dt);
    drift+=still?0:dt*.45;yaw+=still?0:mx*dt*.03;
    // Scrolling down the page carries the viewer forward through the field.
    // Scrolling is a glide, eased so a fast flick reads as speed without tipping into warp.
    flown=follow(flown,(scrollY-startScroll)*.003,2.5,dt);forward=drift+flown;
   }
   const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
   // The camera's forward and right directions in the world (the view rotation undone).
   const b=-cp,fx=-b*sy,fy=-sp,fz=b*cy,rx=cy,rz=sy;
   const next=[fx*forward+rx*shiftX,fy*forward-shiftY,fz*forward+rz*shiftX];
   // The first frame places the camera without a jump, so nothing streaks on arrival unless it should.
   if(first){first=false;cam.splice(0,3,...next);}
   for(let k=0;k<3;k++){vel[k]=follow(vel[k],(next[k]-cam[k])/dt,12,dt);cam[k]=next[k];}
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
   const common=(p:ReturnType<typeof program>)=>{gl.useProgram(p.p);gl.uniform1f(p.u('u_yaw'),yaw);gl.uniform1f(p.u('u_pitch'),pitch);gl.uniform2f(p.u('u_res'),w,h);gl.uniform1f(p.u('u_focal'),focal);gl.uniform1f(p.u('u_dpr'),dpr);};
   common(gal);galBuf.bind(gal.p);gl.uniform1f(gal.u('u_alpha'),intensity);gl.drawArrays(gl.POINTS,0,nGal);
   common(far);farBuf.bind(far.p);gl.uniform1f(far.u('u_alpha'),intensity);gl.uniform1f(far.u('u_lines'),0);gl.drawArrays(gl.POINTS,0,nFar);
   // Near stars and dust; at speed they are drawn as streaks along the motion, otherwise as points.
   const speed=Math.hypot(vel[0],vel[1],vel[2]),blur=still?0:Math.min(.35,.02+speed*.0025);
   const layer=(buf:ReturnType<typeof buffer>,count:number,box:number,sizeK:number,alpha:number)=>{
    common(vol);buf.bind(vol.p);gl.uniform3f(vol.u('u_cam'),cam[0],cam[1],cam[2]);gl.uniform3f(vol.u('u_vel'),vel[0],vel[1],vel[2]);
    gl.uniform1f(vol.u('u_box'),box);gl.uniform1f(vol.u('u_sizeK'),sizeK);gl.uniform1f(vol.u('u_alpha'),alpha*intensity);
    if(speed>5&&!still){gl.uniform1f(vol.u('u_blur'),blur);gl.uniform1f(vol.u('u_lines'),1);gl.drawArrays(gl.LINES,0,count*2);}
    gl.uniform1f(vol.u('u_blur'),0);gl.uniform1f(vol.u('u_lines'),0);gl.drawArrays(gl.POINTS,0,count*2);
   };
   layer(starBuf,nVol,BOX,14,1);layer(dustBuf,nDust,DUST_BOX,4,1);
   if(still&&!camera)cancelAnimationFrame(frame);
  };
  frame=requestAnimationFrame(draw);
  // With reduced motion the field is drawn once, and again only when the window changes size.
  const redraw=()=>{if(still){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}};addEventListener('resize',redraw);
  return()=>{cancelAnimationFrame(frame);removeEventListener('pointermove',move);removeEventListener('resize',redraw);
   for(const x of [farBuf,starBuf,dustBuf,galBuf])gl.deleteBuffer(x.buffer);for(const x of [far,vol,gal])gl.deleteProgram(x.p);};
 },[camera,intensity]);
 return <div className="cosmos" aria-hidden="true"><canvas ref={ref} className="cosmos-stars"/></div>;
}
