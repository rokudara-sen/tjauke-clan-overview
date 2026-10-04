import { maskPoints, rand } from './maskModel';

/** Sculpts the mask off the main thread and returns one interleaved buffer: position, normal, seed, lens, ao, scatter. */
self.onmessage=(e:MessageEvent<number>)=>{
 const points=maskPoints(e.data),stride=13,out=new Float32Array(points.length*stride);
 points.forEach((p,i)=>{
  const o=i*stride,theta=rand(i*3.7+.4)*Math.PI*2,phi=Math.acos(2*rand(i*6.1+.9)-1),r=.6+rand(i*1.9)*1.4;
  out.set([p.x,p.y,p.z,p.nx,p.ny,p.nz,p.seed,p.lens?1:0,p.ao,Math.sin(phi)*Math.cos(theta)*r,Math.cos(phi)*r,Math.sin(phi)*Math.sin(theta)*r,rand(i*8.3+.1)],o);
 });
 (self as unknown as Worker).postMessage(out,[out.buffer]);
};
