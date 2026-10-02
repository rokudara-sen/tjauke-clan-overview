import { describe,it,expect } from 'vitest';
import { acceptedTrophies,assessmentHistory,asymmetries,emptyData,parseWorkbook,rankSteps,searchArchive,serviceRecord,validate,withAllKinds,type RecordData } from '../src/model';
const row=(id:string,extra:Partial<RecordData>={}):RecordData=>({id,name:id,archived:false,published:true,...extra});

describe('service record',()=>{
 const d=emptyData();
 d.members=[row('m',{rank:'Blooded'}),row('w')];
 d.hunts=[row('late',{hunter:'m',date:'2026-05-01',state:'Completed',review:'Accepted'}),row('early',{hunter:'m',date:'2026-01-01',state:'Planned'}),row('seen',{hunter:'w',witness:'m',state:'Underway'}),row('gone',{hunter:'m',archived:true})];
 d.duties=[row('duty',{member:'m',start:'2026-03-01',status:'Active'})];
 d.chronicle=[row('story',{member:'m',era:'Before the crossing'})];
 d.promotions=[row('blooded',{member:'m',rank:'Blooded',date:'2026-05-02',hunt:'late'})];
 const entries=serviceRecord('m',d);
 it('orders dated entries by real-world date and puts undated ones last',()=>expect(entries.map(e=>e.id)).toEqual(['early','duty','late','blooded','seen','story']));
 it('separates hunt completion from claim judgment and labels witnessed hunts',()=>{expect(entries.find(e=>e.id==='late')!.state).toBe('Completed, claim accepted');expect(entries.find(e=>e.id==='seen')!.role).toBe('Witness');});
 it('keeps in-character dates as text, never as the sort key',()=>expect(entries.find(e=>e.id==='story')).toMatchObject({date:'',era:'Before the crossing'}));
 it('leaves archived records out',()=>expect(entries.some(e=>e.id==='gone')).toBe(false));
 it('marks the current rank and only attaches recorded promotions',()=>{const steps=rankSteps(d.members[0],d);expect(steps.filter(s=>s.reached).map(s=>s.rank)).toEqual(['Unblooded','Young Blood','Blooded']);expect(steps.find(s=>s.current)!.rank).toBe('Blooded');expect(steps.filter(s=>s.promotion).map(s=>s.rank)).toEqual(['Blooded']);});
 it('does not invent a rank when none is recorded',()=>expect(rankSteps(row('x'),d).some(s=>s.reached||s.current)).toBe(false));
 it('rejects a promotion citing another hunter\'s undertaking',()=>expect(validate('promotions',row('p',{member:'w',rank:'Blooded',hunt:'late'}),d)).toContain('The undertaking belongs to a different hunter.'));
});

describe('politics',()=>{
 const d=emptyData();d.clans=[row('a'),row('b'),row('c')];
 d.relations=[row('ab',{from:'a',to:'b',stance:'Hostile'}),row('ba',{from:'b',to:'a',stance:'Neutral'}),row('ac',{from:'a',to:'c',stance:'Allied'}),row('ca',{from:'c',to:'a',stance:'Allied'}),row('bc',{from:'b',to:'c',stance:'War'}),
  row('ab-old',{from:'a',to:'b',stance:'Friendly',assessed:'2025-01-01',archived:true}),row('ab-older',{from:'a',to:'b',stance:'Allied',assessed:'2024-01-01',archived:true})];
 it('reports a pair once when the directions differ, ignoring agreeing and one-sided pairs',()=>expect(asymmetries(d).map(p=>[p.forward.id,p.back.id])).toEqual([['ab','ba']]));
 it('does not compare against superseded assessments',()=>{const only={...d,relations:d.relations.filter(r=>r.id!=='ba')};expect(asymmetries(only)).toEqual([]);});
 it('lists the current assessment first, then earlier ones newest first',()=>expect(assessmentHistory(d,'a','b').map(r=>r.id)).toEqual(['ab','ab-old','ab-older']));
 it('keeps an unrecorded relation out of the history of the reverse direction',()=>expect(assessmentHistory(d,'c','b')).toEqual([]));
 it('allows a new assessment once the old one is archived',()=>{const next=row('ab2',{from:'a',to:'b',stance:'Rival'});expect(validate('relations',next,d)).toContain('This directional assessment already exists.');expect(validate('relations',next,{...d,relations:d.relations.filter(r=>r.id!=='ab')})).toEqual([]);});
});

describe('search',()=>{
 const d=emptyData();
 d.members=[row('m1',{name:'Keth’tar',epithet:'The patient one'}),row('m2',{name:'Old hunter',archived:true})];
 d.houses=[row('h1',{name:'Vek’ta',meaning:'Ash-born'})];
 d.glossary=[row('g1',{name:'Kehrite',meaning:'Training hall'})];
 d.hunts=[row('x1',{name:'The ash ravine',quarry:'Xenomorph drone'})];
 d.settings=[row('s',{name:'Keth settings'})];
 it('matches names ignoring apostrophe style and case',()=>expect(searchArchive("keth'tar",d).map(h=>h.row.id)).toEqual(['m1']));
 it('ranks name prefix matches before word and field matches',()=>expect(searchArchive('ash',d).map(h=>h.row.id)).toEqual(['x1','h1']));
 it('labels matches found outside the name',()=>expect(searchArchive('drone',d)[0].match).toBe('Identified quarry: Xenomorph drone'));
 it('includes glossary terms, ranks archived records last and skips settings',()=>{expect(searchArchive('ke',d).map(h=>h.kind)).toEqual(['glossary','members']);expect(searchArchive('hunter',d)[0].row.archived).toBe(true);});
 it('returns nothing for an empty query',()=>expect(searchArchive('  ',d)).toEqual([]));
});

describe('later migrations',()=>{
 it('fills kinds the database has not returned yet',()=>{const d=withAllKinds({members:[row('m')]} as any);expect(d.members).toHaveLength(1);expect(d.glossary).toEqual([]);expect(d.promotions).toEqual([]);});
 it('does not require new tables in the legacy workbook',()=>{const raw:any=Object.fromEntries(['clans','relations','members','houses','hunts','chronicle','duties','library','settings'].map(k=>[k,[['ID']]]));expect(parseWorkbook(raw).issues).toEqual([]);});
});
describe('search noise',()=>{
 it('does not match the middle of words outside names',()=>{const d=emptyData();d.chronicle=[row('c',{name:'The boarding',summary:'The ship was attacked.'})];expect(searchArchive('ke',d)).toEqual([]);expect(searchArchive('attack',d).map(h=>h.row.id)).toEqual(['c']);expect(searchArchive('ship was',d).map(h=>h.row.id)).toEqual(['c']);});
});
describe('trophies',()=>{
 it('lists only accepted claims with a trophy, newest first',()=>{const d=emptyData();d.hunts=[row('a',{review:'Accepted',trophy:'Skull',date:'2026-01-01'}),row('b',{review:'Accepted',trophy:'Spine',date:'2026-05-01'}),row('c',{review:'Pending',trophy:'Claimed',state:'Completed'}),row('d',{review:'Rejected',trophy:'Fake'}),row('e',{review:'Accepted',trophy:'  '}),row('f',{review:'Accepted',trophy:'Old',archived:true})];expect(acceptedTrophies(d).map(h=>h.id)).toEqual(['b','a']);expect(acceptedTrophies(d,h=>h.id==='a').map(h=>h.id)).toEqual(['a']);});
});
