import { afterEach,expect,it,vi } from 'vitest';

vi.mock('../src/gl',()=>({reducedMotion:()=>false}));
vi.mock('../src/dock',()=>({getDock:()=>({point:()=>({x:90,y:134}),land:()=>{}})}));
vi.mock('../src/transition',()=>({morph:vi.fn(),NEW:'new',OLD:'old'}));

afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.clearAllMocks();});

it('does not repaint the dark cover after the opening reveal has finished',async()=>{
 let frame:FrameRequestCallback=()=>{},now=performance.now(),revealAt=Infinity;
 const covers:number[]=[],stars:{time:number;y:number}[]=[];
 const gradient={addColorStop:()=>{}};
 const ctx=new Proxy({fillStyle:'',arc:(_x:number,y:number,r:number)=>{if(r<5)stars.push({time:now,y});},fillRect:(x:number,y:number,w:number,h:number)=>{
  if(x===0&&y===0&&w===1440&&h===900)covers.push(now);
 },createRadialGradient:()=>gradient},{get:(target,key)=>Reflect.get(target,key)??(()=>{})});
 const canvas={width:1440,height:900,setAttribute:()=>{},getContext:()=>ctx};
 vi.stubGlobal('document',{createElement:()=>canvas,body:{appendChild:()=>{}},querySelectorAll:()=>[]});
 vi.stubGlobal('innerWidth',1440);vi.stubGlobal('innerHeight',900);vi.stubGlobal('devicePixelRatio',1);
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frame=cb;return 1;});
 const {morph}=await import('../src/transition');
 vi.mocked(morph).mockImplementation((swap,animate)=>{
  swap();revealAt=now;
  animate({animate:()=>({get currentTime(){return now-revealAt;},get playState(){return now-revealAt>=1050?'finished':'running';}})} as unknown as HTMLElement);
  return true;
 });
 const {shatter}=await import('../src/fx');
 shatter({x:700,y:400},()=>{});
 for(let i=0;i<300;i++){now+=1000/60;frame(now);}
 expect(covers.length).toBeGreaterThan(0);
 expect(covers.filter(t=>t>revealAt+1050)).toEqual([]);
 // The rebound must already be moving on the first frame after impact.
 const rebound=stars.find(p=>p.time>revealAt);
 expect(rebound).toBeDefined();
 expect(rebound!.y).toBeLessThan(870);
});

it('starts the return handoff immediately with a single page animation',async()=>{
 vi.stubGlobal('innerWidth',1440);vi.stubGlobal('innerHeight',900);
 vi.stubGlobal('requestAnimationFrame',()=>1);
 const {morph}=await import('../src/transition');
 const animate=vi.fn();
 vi.mocked(morph).mockImplementation((swap,play)=>{swap();play({animate} as unknown as HTMLElement);return true;});
 const swap=vi.fn(),{ascend}=await import('../src/fx');
 ascend({x:90,y:134},swap);
 expect(swap).toHaveBeenCalledOnce();
 expect(animate).toHaveBeenCalledOnce();
 expect(animate.mock.calls[0][1]).toMatchObject({duration:580,pseudoElement:'old'});
});
