import { rand } from './maskModel';

/** link is the section index for named stars; null for the small unlinked stars. owner ties a cluster star to its section. */
export type Star={x:number;y:number;z:number;size:number;link:number|null;owner:number|null};
export type StarMap={stars:Star[];edges:[number,number][];linkStars:number[]};

/**
 * Deterministic star field: one named star per section, a cluster of small stars around it whose size
 * follows the section's published record count, and a loose background field. Edges join each star to its
 * nearest neighbours; a section star also joins every star in its own cluster and its two nearest sections.
 */
export function starMap(records:number[]):StarMap{
 const stars:Star[]=[],linkStars:number[]=[],n=records.length;
 records.forEach((_,i)=>{
  // Golden-angle spiral over a sphere, jittered so sections never sit on a visible grid.
  const y=1-(i+.5)/n*2,r=Math.sqrt(1-y*y),a=i*2.39996+rand(i*7.1)*.5,radius=1.15+rand(i*3.3)*.35;
  linkStars.push(stars.length);
  stars.push({x:Math.cos(a)*r*radius*1.45,y:y*radius*.95,z:Math.sin(a)*r*radius*1.2,size:2.6,link:i,owner:i});
 });
 records.forEach((count,i)=>{
  const c=stars[linkStars[i]],members=Math.min(28,3+count);
  for(let k=0;k<members;k++){
   const s=i*101+k,u=rand(s*1.3),v=rand(s*2.9),dist=.08+Math.pow(rand(s*4.7),.7)*.36,theta=u*Math.PI*2,phi=Math.acos(2*v-1);
   stars.push({x:c.x+Math.sin(phi)*Math.cos(theta)*dist,y:c.y+Math.cos(phi)*dist*.8,z:c.z+Math.sin(phi)*Math.sin(theta)*dist,size:.7+rand(s*6.1)*1.1,link:null,owner:i});
  }
 });
 for(let k=0;k<460;k++){
  const u=rand(k*5.7+.1),v=rand(k*8.3+.2),radius=.4+Math.cbrt(rand(k*3.1+.3))*2.4,theta=u*Math.PI*2,phi=Math.acos(2*v-1);
  stars.push({x:Math.sin(phi)*Math.cos(theta)*radius*1.3,y:Math.cos(phi)*radius*.75,z:Math.sin(phi)*Math.sin(theta)*radius,size:.5+Math.pow(rand(k*9.9),3)*1.6,link:null,owner:null});
 }
 const seen=new Set<string>(),edges:[number,number][]=[];
 const join=(a:number,b:number)=>{const key=a<b?`${a}-${b}`:`${b}-${a}`;if(a===b||seen.has(key))return;seen.add(key);edges.push([a,b]);};
 const d2=(a:Star,b:Star)=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;
 stars.forEach((s,i)=>{
  if(s.link!==null)return;
  const near=stars.map((o,j)=>[d2(s,o),j] as const).filter(([,j])=>j!==i).sort((a,b)=>a[0]-b[0]);
  near.slice(0,s.owner===null?2:1).forEach(([,j])=>join(i,j));
 });
 linkStars.forEach((li,i)=>{
  stars.forEach((s,j)=>{if(s.owner===i&&j!==li)join(li,j);});
  linkStars.filter(o=>o!==li).sort((a,b)=>d2(stars[li],stars[a])-d2(stars[li],stars[b])).slice(0,2).forEach(o=>join(li,o));
 });
 return {stars,edges,linkStars};
}
