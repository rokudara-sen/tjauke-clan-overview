/** Minimal WebGL helpers for the home mask and the star map. Both scenes fall back to nothing if WebGL is missing. */
export type Program={p:WebGLProgram;u:(name:string)=>WebGLUniformLocation|null};
/**
 * Compiles and links several programs. Every status query waits for the driver, so all programs are started
 * before the first result is read: the driver works on them together and the page waits once, not per shader.
 */
export function programs(gl:WebGLRenderingContext,sources:[string,string][]):Program[]{
 const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);return s;};
 const built=sources.map(([vertex,fragment])=>{const p=gl.createProgram()!,v=shader(gl.VERTEX_SHADER,vertex),f=shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);return {p,v,f};});
 return built.map(({p,v,f})=>{
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getShaderInfoLog(v)||gl.getShaderInfoLog(f)||gl.getProgramInfoLog(p)||'link');
  const uniforms=new Map<string,WebGLUniformLocation|null>();
  const u=(name:string)=>{if(!uniforms.has(name))uniforms.set(name,gl.getUniformLocation(p,name));return uniforms.get(name)!;};
  return {p,u};
 });
}
export const program=(gl:WebGLRenderingContext,vertex:string,fragment:string)=>programs(gl,[[vertex,fragment]])[0];
/** Uploads one interleaved float buffer and returns a binder that points the named attributes at it. */
export function buffer(gl:WebGLRenderingContext,data:Float32Array,layout:[string,number][],usage:number=gl.STATIC_DRAW){
 const b=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,usage);
 const stride=layout.reduce((n,[,size])=>n+size,0)*4;
 return {
  buffer:b,count:data.length/(stride/4),
  bind(p:WebGLProgram){gl.bindBuffer(gl.ARRAY_BUFFER,b);let offset=0;for(const [name,size] of layout){const loc=gl.getAttribLocation(p,name);
   if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,stride,offset);}offset+=size*4;}},
  update(next:Float32Array){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferSubData(gl.ARRAY_BUFFER,0,next);},
 };
}
export function context(canvas:HTMLCanvasElement){
 return canvas.getContext('webgl',{antialias:false,alpha:true,premultipliedAlpha:true,powerPreference:'high-performance'});
}
/** Keeps the drawing buffer matched to the element at up to 2x pixel density. */
export function fit(gl:WebGLRenderingContext,canvas:HTMLCanvasElement){
 const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 gl.viewport(0,0,w,h);return dpr;
}
/** Critically damped follow: frame-rate independent easing towards a target. */
export const follow=(value:number,target:number,rate:number,dt:number)=>value+(target-value)*(1-Math.exp(-rate*dt));
export const ease=(t:number)=>t<.5?4*t*t*t:1-(-2*t+2)**3/2;
export const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
