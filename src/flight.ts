/** Keep the ballistic flight until the final approach, then ease its velocity to zero. */
export function arrivalProgress(progress:number){
 const p=Math.max(0,Math.min(1,progress)),brake=.72;
 if(p<=brake)return p;
 const u=(p-brake)/(1-brake);
 return brake+(1-brake)*(u+u*u-u*u*u);
}

/** A quadratic arc stays inside the viewport when all three control points do. */
export function returnPosition(from:{x:number;y:number},to:{x:number;y:number},progress:number,width:number,height:number){
 const p=Math.max(0,Math.min(1,progress)),t=p*p*(3-2*p),u=1-t;
 const control={x:(from.x+to.x)/2,y:Math.max(24,Math.min(height-24,(from.y+to.y)/2-Math.min(150,Math.hypot(to.x-from.x,to.y-from.y)*.3)))};
 control.x=Math.max(24,Math.min(width-24,control.x));
 return {x:u*u*from.x+2*u*t*control.x+t*t*to.x,y:u*u*from.y+2*u*t*control.y+t*t*to.y};
}
