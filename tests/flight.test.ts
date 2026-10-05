import { expect,it } from 'vitest';
import { arrivalProgress,returnPosition } from '../src/flight';

it('keeps the approach continuous and reaches the dock without overshooting',()=>{
 let previous=0;
 for(let i=0;i<=1000;i++){
  const progress=arrivalProgress(i/1000);
  expect(progress).toBeGreaterThanOrEqual(previous);
  expect(progress).toBeLessThanOrEqual(1);
  previous=progress;
 }
 expect(arrivalProgress(0)).toBe(0);
 expect(arrivalProgress(1)).toBe(1);
 expect(arrivalProgress(1.1)).toBe(1);
});

it('keeps return arcs visible and lands exactly on desktop and mobile map slots',()=>{
 for(const [width,height] of [[1440,900],[390,844]]){
  const from={x:24,y:134};
  for(const to of [{x:width-24,y:24},{x:width/2,y:height-24},{x:24,y:200}]){
   expect(returnPosition(from,to,0,width,height)).toEqual(from);
   expect(returnPosition(from,to,1,width,height)).toEqual(to);
   for(let i=0;i<=100;i++){
    const point=returnPosition(from,to,i/100,width,height);
    expect(point.x).toBeGreaterThanOrEqual(0);expect(point.x).toBeLessThanOrEqual(width);
    expect(point.y).toBeGreaterThanOrEqual(0);expect(point.y).toBeLessThanOrEqual(height);
   }
  }
 }
});

it('matches the incoming velocity at braking and comes to rest at contact',()=>{
 const dt=.000001;
 const velocity=(p:number)=>(arrivalProgress(p+dt)-arrivalProgress(p-dt))/(2*dt);
 expect(velocity(.72)).toBeCloseTo(1,4);
 expect(velocity(1)).toBeCloseTo(0,4);
});
