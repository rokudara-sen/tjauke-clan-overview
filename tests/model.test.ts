import { describe,it,expect } from 'vitest';
import {active,emptyData,openHunts,ordered,parseWorkbook,safeUrl,validate, type RecordData} from '../src/model';
const row=(id:string,extra:Partial<RecordData>={}):RecordData=>({id,name:id,archived:false,published:true,...extra});
describe('public record rules',()=>{
 it('sorts zero before one and numeric ten after two',()=>expect(ordered([row('ten',{order:'10'}),row('zero',{order:'0'}),row('two',{order:'2'}),row('blank',{order:''})]).map(r=>r.id)).toEqual(['zero','two','ten','blank']));
 it('excludes archived and completed undertakings from the open count',()=>expect(openHunts([row('a',{state:'Planned'}),row('b',{state:'Underway'}),row('c',{state:'Completed'}),row('d',{state:'Declared',archived:true})]).map(r=>r.id)).toEqual(['a','b']));
 it('keeps archived records separately addressable',()=>{const rows=[row('old',{archived:true}),row('current')];expect(active(rows)).toHaveLength(1);expect(rows.find(r=>r.id==='old')).toBeTruthy();});
 it('preserves exact HTTP links and rejects executable schemes',()=>{expect(safeUrl('https://docs.google.com/document/d/exact/edit?tab=t.1')).toBe('https://docs.google.com/document/d/exact/edit?tab=t.1');expect(safeUrl('javascript:alert(1)')).toBeNull();});
 it('rejects self relations and duplicate directions, allowing reverse direction',()=>{const d=emptyData();d.clans=[row('a'),row('b')];d.relations=[row('r',{from:'a',to:'b',stance:'Hostile'})];expect(validate('relations',row('x',{from:'a',to:'b',stance:'Hostile'}),d)).toContain('This directional assessment already exists.');expect(validate('relations',row('x',{from:'b',to:'a',stance:'Neutral'}),d)).toEqual([]);});
 it('rejects sponsor cycles',()=>{const d=emptyData();d.members=[row('b',{sponsor:'a'})];expect(validate('members',row('a',{rank:'Blooded',status:'Active',sponsor:'b'}),d)).toContain('Sponsor cycle detected.');});
 it('normalizes matching without changing authored spelling or optional fields',()=>{const raw:any={members:[['ID','Yautja name',"Agaj'ya / household",'Archived'],['m','Keth’tar','Vek’ta',true]],houses:[['ID','Agaj’ya name'],['h','Vek’ta']]};const {data}=parseWorkbook(raw);expect(data.members[0]).toMatchObject({id:'m',name:'Keth’tar',house:'h',archived:true,rank:''});});
 it('flags ambiguous joins instead of inventing references',()=>{const raw:any={members:[['ID','Yautja name','Agaj’ya / household'],['m','Hunter','Same']],houses:[['ID','Agaj’ya name'],['h','Same'],['h2','Same']]};expect(parseWorkbook(raw).issues.some(x=>x.includes('unresolved'))).toBe(true);});
});
