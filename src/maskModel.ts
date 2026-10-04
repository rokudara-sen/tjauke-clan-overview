/**
 * Original procedural Yautja bio-mask, sculpted as a 3D shell and sampled into stipple points.
 * The scene shades it by dot density, so form comes from the surface rather than drawn outlines.
 * x runs right, y down (crown -1.15 to jaw 1.05), z towards the viewer.
 */
/** ao darkens grooves and recesses that light would not reach. */
export type MaskPoint={x:number;y:number;z:number;nx:number;ny:number;nz:number;lens:boolean;ao:number;seed:number};

export const rand=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const band=(v:number,from:number,to:number,soft:number)=>smooth(from-soft,from+soft,v)*(1-smooth(to-soft,to+soft,v));
const TOP=-1.15;

/** Half width of the shell: domed crown, widest across the brow and cheek guards, narrowing to the jaw. */
const width=(y:number)=>y<-.3?.8*Math.max(0,1-Math.abs((y+.3)/.85)**2.2)**(1/2.2):y<.32?.8+.17*smooth(-.3,.25,y):.97-.43*((y-.32)/.7)**1.25;
/** Forward depth of the shell; the forehead slopes back and the lower face carries forward. */
const depth=(y:number)=>(y<-.3?.72*Math.max(0,1-Math.abs((y+.3)/.85)**2.2)**(1/2.2):.72)+.1*Math.max(-1,y)*(y<0?.8:.45);
/** Lower edge in face-across units: tusked mandible guards at the sides, a grille notch at the centre. */
export const jaw=(u:number)=>{const a=Math.abs(u);return .9+.13*Math.exp(-(((a-.56)/.11)**2))-.22*a**4-(a<.1?(.1-a)*.7:0);};

/** Lens region in face coordinates (a = |x| across the front). Inner corners sit low, outer corners rise. */
function lens(a:number,y:number){
 const t=(a-.09)/.62,top=.0-.13*t,low=.19-.2*t-.06*t*t;
 return band(a,.09,.71,.02)*band(y,top,low,.018);
}
/** Raised plates and grooves, in face coordinates, as outward displacement. */
function relief(fx:number,y:number){
 const a=Math.abs(fx);let d=0;
 // Forehead: a central crest flanked by two cut channels.
 d+=.065*Math.exp(-((fx/.065)**2))*smooth(-.02,-.25,y)*smooth(TOP,-.95,y);
 d-=.022*Math.exp(-(((a-.15)/.022)**2))*smooth(-.1,-.3,y)*smooth(-1.02,-.85,y);
 // Brow ridge riding just above the lens line.
 const t=(a-.09)/.62,brow=.0-.13*t-.07;
 d+=.085*Math.exp(-(((y-brow)/.06)**2))*band(a,.02,.86,.07);
 // Lens recess.
 d-=.14*lens(a,y);
 // Muzzle plate: a raised trapezoid from the lenses to the grille, edged so it casts a crease.
 const half=.3-.1*smooth(.15,.85,y);
 d+=.16*band(a,-1,half,.025)*band(y,.08,.88,.04);
 d+=.03*Math.exp(-((fx/.035)**2))*band(y,.02,.55,.08);
 // Cheek guards: separate plates beside the muzzle, divided from it by a groove.
 d+=.055*band(a,half+.08,.86,.03)*band(y,.16,.92,.05);
 d-=.02*band(a,half+.015,half+.065,.012)*band(y,.1,.95,.05);
 // Grille: vertical channels through the lower muzzle.
 for(const g of [0,.075,.15])d-=.02*Math.exp(-(((a-g)/.014)**2))*band(y,.68,1.1,.03);
 // A shallow tilt to the crown plates where they meet the dome.
 d-=.03*band(a,.3,.9,.08)*band(y,-.95,-.55,.08);
 return d;
}
/** Relief lower than its surroundings reads as a groove or recess. */
const concavity=(fx:number,y:number)=>{const k=.035,r=relief(fx,y),around=(relief(fx+k,y)+relief(fx-k,y)+relief(fx,y+k)+relief(fx,y-k))/4;return Math.max(0,Math.min(1,(around-r)*40));};
function surface(u:number,y:number):[number,number,number]{
 const theta=u*1.72,s=Math.sin(theta),c=Math.cos(theta),n=2.6;
 const sx=Math.sign(s)*Math.abs(s)**(2/n),cz=Math.sign(c)*Math.abs(c)**(2/n);
 const fx=s*1.02,front=Math.max(0,c),w=width(y),dz=depth(y);
 const r=relief(fx,y)*front**.7;
 return [sx*(w+r*Math.abs(sx)),y,cz*dz+r];
}

export function maskPoints(count=90000):MaskPoint[]{
 const out:MaskPoint[]=[],e=.003;let i=0,tries=0;
 const cross=(u:number,y:number)=>{const p=surface(u,y),pu=surface(u+e,y),py=surface(u,y+e);
  const ax=pu[0]-p[0],ay=pu[1]-p[1],az=pu[2]-p[2],bx=py[0]-p[0],by=py[1]-p[1],bz=py[2]-p[2];
  return [ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];};
 while(out.length<count&&tries<count*8){
  tries++;const u=rand(++i*1.37)*2-1,y=TOP+rand(i*2.71+.5)*2.2;
  if(y>jaw(Math.sin(u*1.72)*1.02))continue;
  const [cx,cy,cz]=cross(u,y),area=Math.hypot(cx,cy,cz)/(e*e);
  // Lenses are sampled three times as densely so they read as solid black glass.
  const inLens=Math.cos(u*1.72)>0&&lens(Math.abs(Math.sin(u*1.72)*1.02),y)>.5;
  if(rand(i*5.13+.2)*2.4>area*(inLens?3:1))continue;
  const p=surface(u,y),len=Math.hypot(cx,cy,cz)||1,fx=Math.sin(u*1.72)*1.02;
  // Normals point out of the shell (towards +z at the front).
  const flip=cz<0?-1:1;
  out.push({x:p[0],y:p[1],z:p[2],nx:cx/len*flip,ny:cy/len*flip,nz:cz/len*flip,lens:inLens,ao:Math.cos(u*1.72)>0?concavity(fx,y):0,seed:rand(i*9.7+.3)});
 }
 return out;
}
