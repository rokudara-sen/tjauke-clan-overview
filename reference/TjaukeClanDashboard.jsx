import React, { useState, useMemo } from 'react';
import { 
  Crosshair, 
  Home, 
  Award, 
  BookOpen, 
  FileText, 
  Users, 
  Archive, 
  Settings, 
  ExternalLink, 
  Search, 
  Compass, 
  ArrowLeft, 
  AlertTriangle, 
  X, 
  Eye 
} from 'lucide-react';

const RECORD_MAP = {
  clans: {
    sheet: "TK · Affiliations",
    fields: {
      name: "Affiliation name",
      kind: "Affiliation type",
      notes: "Background / contact notes",
      source: "Reference URL"
    }
  },
  relations: {
    sheet: "TK · Relations",
    fields: {
      name: "Assessment title",
      from: "From affiliation",
      to: "Toward affiliation",
      stance: "Stance",
      notes: "Reasons / agreements / context",
      source: "Source URL"
    }
  },
  members: {
    sheet: "TK · Members",
    fields: {
      name: "Yautja name",
      epithet: "Epithet / interpretation",
      player: "Player / Discord",
      rank: "Rank",
      house: "Agaj’ya / household",
      sponsor: "Nrak’ytara / sponsor",
      status: "Standing",
      joined: "Joined",
      biography: "Life and character",
      appearance: "Appearance and equipment",
      hooks: "Unfinished business / RP hooks",
      source: "Profile / reference URL"
    }
  },
  houses: {
    sheet: "TK · Households",
    fields: {
      name: "Agaj’ya name",
      meaning: "Estimated meaning",
      senior: "Household senior",
      vessel: "Vessel / holding",
      status: "Condition",
      history: "History and obligations",
      identity: "Customs / material identity"
    }
  },
  hunts: {
    sheet: "TK · Hunts",
    fields: {
      name: "Account title",
      hunter: "Hunter",
      witness: "Hult’ah / witness",
      date: "Real-world session date",
      era: "In-character date / expedition",
      quarry: "Identified quarry",
      weapon: "Declared weapons",
      limits: "Additional restrictions",
      state: "Undertaking",
      outside: "Outside contribution",
      review: "Claim judgment",
      trophy: "Claimed trophy",
      account: "Returned account",
      judgment: "Judgment / grounds",
      source: "Evidence URL"
    }
  },
  chronicle: {
    sheet: "TK · History",
    fields: {
      name: "Entry title",
      era: "In-character date / era",
      order: "Reading order",
      date: "Recorded date",
      category: "Category",
      member: "Related hunter",
      house: "Related household",
      hunt: "Related hunt",
      certainty: "Evidence",
      summary: "Opening summary",
      body: "Full account",
      source: "Source URL"
    }
  },
  duties: {
    sheet: "TK · Duties",
    fields: {
      name: "Duty / office",
      member: "Holder",
      house: "Scope / household",
      start: "From",
      end: "Until",
      status: "Appointment",
      mandate: "Mandate and limits"
    }
  },
  library: {
    sheet: "TK · Library",
    fields: {
      name: "Document / chapter",
      category: "Shelf",
      order: "Reading order",
      summary: "Abstract",
      url: "Document URL"
    }
  },
  settings: {
    sheet: "TK · Settings",
    fields: {
      name: "Clan name",
      subtitle: "Subtitle",
      welcome: "Archive introduction",
      dossierUrl: "Published Weyland-Yutani dossier URL",
      rulesUrl: "CMU / honour code URL"
    }
  }
};

const TERMINAL_RANKS = [
  ["Unblooded", "M-di Thwei", "Standing not yet conferred by blooding."],
  ["Young Blood", "Chiva Sain'ja", "Admitted to trial; its outcome remains unsettled."],
  ["Blooded", "Thwei Sain'ja", "Blooding acknowledged; answers on personal standing."],
  ["Elite", "Paya", "Proven standing recognised through deeds."],
  ["Elder", "Nracha-dte Paya", "Authority sustained through repeated demands."],
  ["Leader", "N'yaka-de", "Recognised responsibility for the whole undertaking."],
  ["Ancient", "Nan-ku Bhu'ja", "Possibly ancestral authority remaining among the living."]
];

function sanitizeEncoding(val) {
  if (val == null) return '';
  let str = String(val);

  // Common double-encoded UTF-8 / Mojibake sequences for quotes, dashes, ellipsis, and spaces
  str = str
    .replace(/Ã¢â‚¬â„¢|â€™|â€˜|â€²|â€³|â€/g, "'")
    .replace(/Ã¢â‚¬â€|Ã¢â‚¬â€œ|â€”|â€“/g, ' — ')
    .replace(/Ã¢â‚¬Â¦|â€¦/g, '...')
    .replace(/Ã‚Â·|â·|Â·/g, '·')
    .replace(/Ã‚Â|Â/g, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  return str.trim();
}

const terminalText = v => sanitizeEncoding(v);
const cleanAlpha = v => terminalText(v).toLowerCase().replace(/[^a-z0-9]/g, '');

function terminalKey(value) {
  return terminalText(value)
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function terminalUrl(value) {
  try {
    const raw = terminalText(value);
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

function formatDateSafe(val) {
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    return new Date(year, month, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return s;
}

function getRangeList(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    if (Array.isArray(input.data)) return input.data;
    if (Array.isArray(input.ranges)) return input.ranges;
    if (Array.isArray(input.sheets)) return input.sheets;
    if (Array.isArray(input.tables)) return input.tables;
  }
  return [];
}

function findRangeForType(rangeList, type, schema) {
  const targetClean = cleanAlpha(schema.sheet);
  
  // 1. Exact or clean name match
  for (const range of rangeList) {
    if (cleanAlpha(range?.name) === targetClean) return range;
  }

  // 2. Keyword name match
  const kwMap = {
    members: 'member',
    houses: 'house',
    hunts: 'hunt',
    chronicle: 'histor',
    duties: 'dut',
    library: 'librar',
    clans: 'affil',
    settings: 'setting',
    relations: 'relation'
  };
  const kw = kwMap[type];
  if (kw) {
    for (const range of rangeList) {
      if (cleanAlpha(range?.name).includes(kw)) return range;
    }
  }

  // 3. Fallback header matching
  for (const range of rangeList) {
    const headerRow = Array.isArray(range?.data?.[0]?.row) ? range.data[0].row : [];
    const headerClean = headerRow.map(cleanAlpha);

    if (type === 'members' && headerClean.some(h => h.includes('yautjaname') || h.includes('playerdiscord'))) {
      return range;
    }
    if (type === 'houses' && headerClean.some(h => h.includes('agajyaname') || h.includes('householdsenior'))) {
      return range;
    }
    if (type === 'hunts' && headerClean.some(h => h.includes('accounttitle') || h.includes('identifiedquarry') || h.includes('declaredweapons'))) {
      return range;
    }
    if (type === 'chronicle' && headerClean.some(h => h.includes('entrytitle') || (h.includes('readingorder') && h.includes('fullaccount')))) {
      return range;
    }
    if (type === 'duties' && headerClean.some(h => h.includes('dutyoffice') || h.includes('mandateandlimits'))) {
      return range;
    }
    if (type === 'library' && headerClean.some(h => h.includes('documentchapter') || (h.includes('shelf') && h.includes('abstract')))) {
      return range;
    }
    if (type === 'clans' && headerClean.some(h => h.includes('affiliationname') || h.includes('affiliationtype'))) {
      return range;
    }
    if (type === 'settings' && headerClean.some(h => h.includes('clanname') || h.includes('archiveintroduction'))) {
      return range;
    }
  }

  return null;
}

function canvasCell(value){
  if(value==null)return '';
  if(typeof value!=='object')return String(value);
  if(value instanceof Date)return value.toISOString();
  if(value.formattedValue!=null)return String(value.formattedValue);
  const raw=value.effectiveValue||value.userEnteredValue;
  if(raw)for(const key of ['stringValue','numberValue','boolValue'])if(raw[key]!=null)return String(raw[key]);
  if(value.value!=null)return canvasCell(value.value);
  if(value.text!=null)return String(value.text);
  return '';
}
function canvasKey(value){return canvasCell(value).replace(/Ã¢â‚¬â„¢|â€™|â\x80\x99/g,"'").normalize('NFKC').replace(/[‘’ʼ`´'"]/g,'').replace(/\u00a0/g,' ').trim().toLowerCase().replace(/[^a-z0-9]/g,'');}
function canvasName(value){return canvasKey(canvasCell(value).replace(/!\$?[A-Z]+\$?\d*(?::\$?[A-Z]+\$?\d*)?$/i,''));}
function canvasRows(range){
  const raw=range?.values||range?.rows||range?.data||[];
  if(!Array.isArray(raw))return [];
  return raw.map(r=>Array.isArray(r)?r:Array.isArray(r?.row)?r.row:Array.isArray(r?.values)?r.values:Array.isArray(r?.cells)?r.cells:r);
}
function canvasTables(input){
  if(Array.isArray(input))return input;
  for(const key of ['ranges','sheets','tables','data'])if(Array.isArray(input?.[key]))return input[key];
  if(input&&typeof input==='object')return Object.entries(input).filter(([,v])=>v&&typeof v==='object').map(([name,v])=>Array.isArray(v)?{name,data:v}:{name,...v});
  return [];
}
function canvasIngest(input){
  const all={},records={},sources={},issues=[];
  const signatures={members:['Yautja name','Player / Discord'],houses:['Agaj’ya name','Household senior'],hunts:['Account title','Identified quarry'],chronicle:['Entry title','Full account'],duties:['Duty / office','Mandate and limits'],library:['Document / chapter','Document URL'],clans:['Affiliation name','Affiliation type'],relations:['From affiliation','Toward affiliation'],settings:['Clan name','Archive introduction']};
  const payloads=[input?.data,input?.records,input].filter(p=>p&&typeof p==='object'&&!Array.isArray(p));
  const ranges=canvasTables(input);
  for(const [type,schema] of Object.entries(RECORD_MAP)){
    let candidates=[],fromPayload=false;
    const payload=payloads.find(p=>Array.isArray(p[type])||(type==='settings'&&p[type]&&typeof p[type]==='object'));
    if(payload){candidates=Array.isArray(payload[type])?payload[type]:[payload[type]];fromPayload=true;sources[type]='ready';}
    else{
      const target=canvasName(schema.sheet),short=canvasName(schema.sheet.replace(/^TK\s*·\s*/,''));
      const named=ranges.filter(r=>[target,short].includes(canvasName(r?.name||r?.sheetName||r?.title||r?.range)));
      let matches=named;
      if(!matches.length)matches=ranges.filter(r=>canvasRows(r).slice(0,10).some(row=>Array.isArray(row)&&signatures[type].every(h=>row.map(canvasKey).includes(canvasKey(h)))));
      if(matches.length!==1){sources[type]=matches.length?'invalid':'missing';issues.push(schema.sheet+': '+(matches.length?'multiple matching ranges. Supply one complete table.':'source not supplied to the canvas.'));all[type]=[];records[type]=[];continue;}
      const table=matches[0],rows=canvasRows(table);let header=table.headers||table.columns;
      if(Array.isArray(header))header=header.map(h=>h?.name||h?.label||h);
      let body=rows;
      if(!Array.isArray(header)){
        const index=rows.slice(0,10).findIndex(row=>Array.isArray(row)&&row.map(canvasKey).includes(canvasKey(schema.fields.name)));
        if(index>=0){header=rows[index];body=rows.slice(index+1);}
        else if(rows.length&&rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r))){candidates=rows;header=[];body=[];}
        else if(!rows.length){sources[type]='ready';all[type]=[];records[type]=[];continue;}
        else {sources[type]='invalid';issues.push(schema.sheet+': header row not found. Include the table headers in its connected range.');all[type]=[];records[type]=[];continue;}
      }
      const keys=header.map(canvasKey);
      if(keys.some((k,i)=>k&&keys.indexOf(k)!==i)){sources[type]='invalid';issues.push(schema.sheet+': duplicate column names.');all[type]=[];records[type]=[];continue;}
      candidates.push(...body.filter(Array.isArray).filter(row=>row.some(v=>canvasCell(v).trim())).map(row=>Object.fromEntries(header.map((h,i)=>[canvasCell(h),row[i]]))));
      sources[type]='ready';
    }
    const read=(r,key,label)=>{
      const keys=Object.keys(r);const found=keys.find(k=>canvasKey(k)===canvasKey(key))??keys.find(k=>canvasKey(k)===canvasKey(label));
      return found==null?'':canvasCell(r[found]).trim();
    };
    const parsed=[];
    candidates.forEach((r,index)=>{
      if(!r||typeof r!=='object'||Array.isArray(r))return;
      const item={id:read(r,'id','ID'),archived:read(r,'archived','Archived').toLowerCase()==='true',updated:read(r,'updated','Updated at'),created:read(r,'created','Created at')};
      Object.entries(schema.fields).forEach(([key,label])=>item[key]=read(r,key,label));
      if(!item.id&&!Object.keys(schema.fields).some(k=>item[k]))return;
      if(!item.id){item.id='view-only:'+type+':'+index;issues.push(schema.sheet+': row '+(index+1)+' has no supplied ID; displayed without a stored reference ID.');}
      parsed.push(item);
    });
    const counts=new Map();parsed.forEach(r=>counts.set(r.id,(counts.get(r.id)||0)+1));
    all[type]=parsed.map((r,index)=>{if(counts.get(r.id)>1){issues.push(schema.sheet+': duplicate ID '+r.id+'. Reference links may need repair.');return {...r,id:'duplicate:'+type+':'+index};}return r;});
    records[type]=all[type].filter(r=>!r.archived);
  }
  return {all,records,sources,issues:[...new Set(issues)]};
}

function terminalRead(input) {
  const {all,records,sources,issues}=canvasIngest(input);
  const config = records.settings?.[0] || all.settings?.[0] || {};
  
  const resolve = (type, value) => {
    const ref = terminalText(value);
    if (!ref) return { record: null, label: 'Not assigned', state: 'empty' };
    if (!all[type]) return { record: null, label: 'Unresolved · ' + ref, state: 'unresolved' };
    let found = all[type].find(r => r.id === ref);
    if (!found) {
      const matches = all[type].filter(r => r.name && terminalKey(r.name) === terminalKey(ref));
      if (matches.length === 1) found = matches[0];
      else if (matches.length > 1) return { record: null, label: 'Ambiguous · ' + ref, state: 'ambiguous' };
    }
    if (!found) return { record: null, label: 'Unresolved · ' + ref, state: 'unresolved' };
    const name = type === 'clans' && found.id === 'CLN-SELF' ? config.name || found.name : found.name;
    return { record: found, label: name || found.id, state: found.archived ? 'archived' : 'resolved' };
  };

  const same = (type, value, id) => resolve(type, value).record?.id === id;

  const ordered = list => [...(list || [])].sort((a, b) => {
    const number = v => v !== '' && Number.isFinite(Number(v)) ? Number(v) : Infinity;
    return number(a.order) - number(b.order) || (a.id || '').localeCompare(b.id || '');
  });
  records.library = ordered(records.library);
  records.chronicle = ordered(records.chronicle);

  const rank = value => {
    const entry = TERMINAL_RANKS.find(r => terminalKey(r[0]) === terminalKey(value) || terminalKey(r[1]) === terminalKey(value));
    return entry || [value || 'Unrecorded', value || 'Unrecorded', 'Standing unrecorded'];
  };

  records.members?.sort((a, b) => TERMINAL_RANKS.findIndex(r => r[0] === rank(b.rank)[0]) - TERMINAL_RANKS.findIndex(r => r[0] === rank(a.rank)[0]) || a.name.localeCompare(b.name));

  return { records, all, sources, issues, config, resolve, same, rank };
}

// Reads the supplied Politics range verbatim. Missing cells are never assigned a stance.
function readPoliticsSheet(input){
  const snapshot=input?.politicsSheet;
  let rows,backgrounds=[],fontColors=[],notes=[];
  if(snapshot&&Array.isArray(snapshot.values)){
    rows=snapshot.values;backgrounds=snapshot.backgrounds||[];fontColors=snapshot.fontColors||[];notes=snapshot.notes||[];
  }else{
    const ranges=canvasTables(input).filter(r=>canvasName(r?.name||r?.sheetName||r?.title||r?.range)==='politics');
    if(ranges.length!==1)return {state:ranges.length?'ambiguous':'missing',rows:[]};
    const range=ranges[0];rows=canvasRows(range);
    backgrounds=range.backgrounds||[];fontColors=range.fontColors||[];notes=range.notes||[];
  }
  const value=c=>c&&typeof c==='object'?c.formattedValue??c.value??c.text??'':c??'';
  const rgb=c=>{if(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c))return c;if(c&&typeof c==='object'&&['red','green','blue'].some(k=>k in c))return '#'+['red','green','blue'].map(k=>Math.round(Math.max(0,Math.min(1,Number(c[k])||0))*255).toString(16).padStart(2,'0')).join('');return '';};
  let last=rows.length;while(last&&!rows[last-1].some(c=>String(value(c)).trim()))last--;
  const width=Math.max(0,...rows.slice(0,last).map(r=>{let n=r.length;while(n&&!String(value(r[n-1])).trim())n--;return n;}));
  const result=rows.slice(0,last).map((r,i)=>Array.from({length:width},(_,j)=>{const c=r[j],format=c?.effectiveFormat||c?.userEnteredFormat||{};return {text:String(value(c)),bg:rgb(backgrounds[i]?.[j]||format.backgroundColor),fg:rgb(fontColors[i]?.[j]||format.textFormat?.foregroundColor),note:String(notes[i]?.[j]||c?.note||'')};}));
  return {state:'ready',rows:result};
}
function PoliticsSheetView({input}){
  const sheet=useMemo(()=>readPoliticsSheet(input),[input]);
  const palette={unknown:['#e5e7eb','#374151'],allied:['#285943','#ffffff'],friendly:['#b8d8bd','#183b27'],neutral:['#ece5d3','#514a37'],rival:['#e8c775','#523b12'],hostile:['#b65b49','#ffffff'],war:['#6f252a','#ffffff']};
  if(sheet.state!=='ready')return <div className="yt-panel"><h2>Politics sheet not available</h2><p>{sheet.state==='ambiguous'?'More than one Politics range was supplied. Connect one complete range.':'Connect the Politics sheet to this canvas, including its first row and first column. No relationships are assumed.'}</p></div>;
  if(!sheet.rows.length)return <div className="yt-panel"><p>The Politics sheet is empty.</p></div>;
  return <div className="yt-panel"><div className="yt-panel-head"><h2>Politics</h2><span>From the Politics sheet</span></div><p style={{color:'var(--muted)',fontSize:13}}>Rows show each affiliation’s stance toward the affiliations across the top. Blank cells remain blank.</p><div className="yt-matrix" role="region" aria-label="Politics sheet" tabIndex={0}><table><tbody>{sheet.rows.map((r,i)=><tr key={i}>{r.map((c,j)=>{const kind=i===0||j===0?'th':'td',fallback=palette[c.text.trim().toLowerCase()],style={background:c.bg||fallback?.[0]||'#141c17',color:c.fg||fallback?.[1]||'#e9e5d8',whiteSpace:'pre-wrap',minWidth:130,maxWidth:400,overflowWrap:'anywhere'};return React.createElement(kind,{key:j,scope:kind==='th'?(i===0?'col':'row'):undefined,style,title:c.note||undefined},c.text);})}</tr>)}</tbody></table></div></div>;
}

function App({ data, updateItem, deleteItem, insertItem, moveItem, followLink }) {
  const model = useMemo(() => terminalRead(data), [data]);
  const { records: d, all, config, resolve, same, rank, issues, sources } = model;

  const [section, setSection] = useState('overview');
  const [selection, setSelection] = useState(null);
  const [filters, setFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const nav = [
    { id: 'overview', label: 'Overview', icon: Compass, count: null },
    { id: 'members', label: 'Hunters', icon: Crosshair, count: sources.members === 'ready' ? d.members.length : '—' },
    { id: 'houses', label: 'Households', icon: Home, count: sources.houses === 'ready' ? d.houses.length : '—' },
    { id: 'hunts', label: 'Undertakings', icon: Award, count: sources.hunts === 'ready' ? d.hunts.length : '—' },
    { id: 'chronicle', label: 'History', icon: BookOpen, count: sources.chronicle === 'ready' ? d.chronicle.length : '—' },
    { id: 'duties', label: 'Duties', icon: FileText, count: sources.duties === 'ready' ? d.duties.length : '—' },
    { id: 'politics', label: 'Politics', icon: Users, count: sources.clans === 'ready' ? d.clans.length : '—' },
    { id: 'library', label: 'Documents', icon: Archive, count: sources.library === 'ready' ? d.library.length : '—' },

  ];

  const go = type => {
    setSection(type);
    setSelection(null);
    setFilters({});
    setSearchQuery('');
  };

  const inspect = (type, id) => {
    setSection(type);
    setSelection({ type, id });
    setFilters({});
    setSearchQuery('');
  };

  const selected = selection ? all[selection.type]?.find(r => r.id === selection.id) : null;

  const handleLink = url => {
    const safe = terminalUrl(url);
    if (safe && typeof followLink === 'function') {
      followLink(safe);
    }
  };

  const relationMap = useMemo(() => {
    const map = {};
    (d.relations || []).forEach(rel => {
      const fromClan = resolve('clans', rel.from)?.record;
      const toClan = resolve('clans', rel.to)?.record;
      const fromKey = fromClan?.id || rel.from;
      const toKey = toClan?.id || rel.to;
      if (fromKey && toKey) {
        map[`${fromKey}->${toKey}`] = rel;
      }
    });
    return map;
  }, [d.relations, resolve]);

  function RefLink({ type, value }) {
    const r = resolve(type, value);
    if (!r.record) {
      return <span style={{ color: '#d97768', fontStyle: 'italic' }}>{r.label}</span>;
    }
    return (
      <button 
        type="button" 
        onClick={() => inspect(type, r.record.id)} 
        className="yt-textlink"
      >
        {r.label}
      </button>
    );
  }

  function StanceBadge({ stance }) {
    const colors = {
      Unknown: '#37424a',
      Allied: '#285943',
      Friendly: '#406449',
      Neutral: '#5c574b',
      Rival: '#886320',
      Hostile: '#963e32',
      War: '#751d29'
    };
    const bg = colors[stance] || '#333e38';
    return (
      <span 
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          background: bg,
          color: '#ffffff',
          borderRadius: '2px',
          fontSize: '11px',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.8px'
        }}
      >
        {stance || 'Unknown'}
      </span>
    );
  }

  const activeHunts = d.hunts?.filter(h => ['Planned', 'Declared', 'Underway'].includes(h.state)) || [];
  const currentDuties = d.duties?.filter(x => ['Active', 'Acting'].includes(x.status)) || [];

  const totalActiveRecords = (d.members?.length || 0) + (d.houses?.length || 0) + (d.hunts?.length || 0) + (d.chronicle?.length || 0) + (d.duties?.length || 0) + (d.clans?.length || 0) + (d.library?.length || 0);

  return (
    <div className="yt-terminal">
      <style>{`
        .yt-terminal {
          --bg: #0b0c0e;
          --panel: #141619;
          --line: #34373b;
          --text: #e9e5d8;
          --muted: #a6a7a9;
          --amber: #ee8070;
          --red: #d64f3e;
          background: var(--bg);
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 14px;
          line-height: 1.65;
          min-height: 100vh;
          color-scheme: dark;
          box-sizing: border-box;
        }
        .yt-terminal * { box-sizing: border-box; }
        .yt-terminal button { font: inherit; cursor: pointer; color: inherit; border: 0; background: transparent; }
        .yt-terminal button:focus-visible, .yt-terminal input:focus-visible, .yt-terminal select:focus-visible, .yt-terminal textarea:focus-visible {
          outline: 2px solid var(--amber);
          outline-offset: 2px;
        }
        .yt-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 16px 28px;
          border-bottom: 1px solid var(--line);
          background: #101214;
        }
        .yt-brand {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .yt-hud-icon {
          width: 36px;
          height: 36px;
          color: var(--red);
          flex-shrink: 0;
        }
        .yt-brand strong {
          display: block;
          font-size: 17px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #f7f3e8;
        }
        .yt-brand span {
          display: block;
          font: 10px/1.8 monospace;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        .yt-toplinks {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .yt-shell {
          display: grid;
          grid-template-columns: 210px minmax(0, 1fr);
          max-width: 1700px;
          margin: 0 auto;
          min-height: calc(100vh - 75px);
        }
        .yt-nav {
          border-right: 1px solid var(--line);
          padding: 24px 12px;
          background: #101214;
        }
        .yt-nav-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 12px;
          border-left: 2px solid transparent;
          font-size: 13px;
          font-family: monospace;
          color: #c7cfc3;
          border-radius: 2px;
          margin-bottom: 4px;
          transition: background 0.15s, color 0.15s;
        }
        .yt-nav-btn:hover {
          background: #212124;
          color: #ffffff;
        }
        .yt-nav-btn[aria-current="page"] {
          border-left-color: var(--amber);
          color: var(--amber);
          background: #30201e;
          font-weight: bold;
        }
        .yt-count {
          margin-left: auto;
          font: 11px monospace;
          color: var(--muted);
          background: #212124;
          padding: 2px 6px;
          border-radius: 2px;
        }
        .yt-main {
          padding: 26px 36px 60px;
          min-width: 0;
        }
        .yt-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          font: 10px/1.6 monospace;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--muted);
          padding-bottom: 20px;
          border-bottom: 1px dashed #303338;
          margin-bottom: 22px;
        }
        .yt-hero {
          position: relative;
          overflow: hidden;
          padding: 38px 36px;
          border: 1px solid #393b40;
          border-left: 4px solid var(--red);
          background: linear-gradient(125deg, #191b1f, #121416 80%);
          margin-bottom: 26px;
        }
        .yt-hero h1 {
          font: clamp(38px, 4.5vw, 64px)/1.1 Arial, sans-serif;
          letter-spacing: 1px;
          margin: 14px 0 12px;
          color: #f7f4e9;
        }
        .yt-lead {
          font: 16px/1.7 Arial, sans-serif;
          color: #d1d6c8;
          max-width: 720px;
          margin-bottom: 22px;
        }
        .yt-eyebrow {
          font: 10px/1.7 monospace;
          color: var(--amber);
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .yt-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border: 1px solid #556353;
          background: #202226;
          color: #e9e5d8;
          font: 12px/1.5 monospace;
          letter-spacing: 0.5px;
          transition: all 0.15s;
          border-radius: 2px;
        }
        .yt-button:hover {
          border-color: var(--amber);
          background: #2b2d30;
          color: #ffffff;
        }
        .yt-primary {
          background: #b8493a;
          color: #0d120e;
          border-color: #ec8473;
          font-weight: bold;
        }
        .yt-primary:hover {
          background: #d65c48;
          color: #0d120e;
        }
        .yt-danger {
          border-color: var(--red);
          color: #fca5a5;
          background: #2b1414;
        }
        .yt-danger:hover {
          background: #3d1b1b;
          border-color: #ef4444;
          color: #ffffff;
        }
        .yt-textlink {
          color: var(--amber);
          text-decoration: underline;
          padding: 0;
          font: inherit;
        }
        .yt-textlink:hover {
          color: #ffb2a4;
        }
        .yt-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          border: 1px solid var(--line);
          margin-bottom: 28px;
          background: #131518;
        }
        .yt-metric-box {
          padding: 16px 20px;
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: left;
        }
        .yt-metric-box:last-child {
          border-right: 0;
        }
        .yt-metric-label {
          font: 10px/1.5 monospace;
          letter-spacing: 1px;
          color: var(--muted);
          text-transform: uppercase;
        }
        .yt-metric-val {
          font: 32px/1.2 monospace;
          color: #f5f2e6;
          margin: 6px 0;
        }
        .yt-metric-sub {
          font: 11px monospace;
          color: var(--amber);
        }
        .yt-panel {
          background: var(--panel);
          border: 1px solid var(--line);
          padding: 22px;
          margin-bottom: 24px;
        }
        .yt-panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--line);
          margin-bottom: 18px;
        }
        .yt-panel-head h2 {
          font: 12px/1.6 monospace;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--amber);
          margin: 0;
        }
        .yt-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 18px;
        }
        .yt-card {
          background: #121814;
          border: 1px solid var(--line);
          border-top: 2px solid #635742;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: border-color 0.15s;
        }
        .yt-card:hover {
          border-color: #516254;
          border-top-color: var(--amber);
        }
        .yt-tag {
          display: inline-block;
          padding: 3px 8px;
          border: 1px solid #475446;
          font: 10px/1.4 monospace;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #dbe0d2;
          background: #162019;
          border-radius: 2px;
        }
        .yt-searchbar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .yt-search-input {
          flex: 1;
          min-width: 240px;
          background: #111714;
          border: 1px solid var(--line);
          color: #e9e5d8;
          padding: 8px 12px;
          font: 13px monospace;
          border-radius: 2px;
        }
        .yt-pill-group {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .yt-pill {
          padding: 6px 10px;
          background: #121914;
          border: 1px solid #354236;
          font: 11px/1.4 monospace;
          color: #b5c0b1;
          border-radius: 2px;
          transition: all 0.15s;
        }
        .yt-pill:hover {
          border-color: #556756;
          color: #ffffff;
        }
        .yt-pill[aria-pressed="true"] {
          background: #443521;
          border-color: var(--amber);
          color: #ffe1ba;
        }
        .yt-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(5, 8, 6, 0.85);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .yt-modal {
          background: #111714;
          border: 1px solid #4a5c4d;
          border-top: 3px solid var(--amber);
          max-width: 680px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 24px 28px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.9);
        }
        .yt-form-group {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .yt-form-label {
          font: 11px/1.4 monospace;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--amber);
        }
        .yt-form-input, .yt-form-select, .yt-form-textarea {
          background: #162019;
          border: 1px solid #34373b;
          color: #e9e5d8;
          padding: 9px 12px;
          font: 13px/1.5 monospace;
          width: 100%;
          border-radius: 2px;
        }
        .yt-form-textarea {
          resize: vertical;
          min-height: 90px;
        }
        .yt-matrix {
          overflow-x: auto;
          margin-top: 15px;
        }
        .yt-matrix table {
          border-collapse: separate;
          border-spacing: 2px;
          width: 100%;
          font: 12px/1.5 monospace;
        }
        .yt-matrix th, .yt-matrix td {
          padding: 10px 14px;
          text-align: left;
        }
        .yt-matrix th {
          background: #212124;
          color: var(--amber);
          font-weight: normal;
        }
        .yt-matrix td {
          background: #131a15;
          border: 1px solid #202c23;
        }
        @media(max-width: 900px) {
          .yt-shell { grid-template-columns: 1fr; }
          .yt-nav {
            display: flex;
            overflow-x: auto;
            border-right: 0;
            border-bottom: 1px solid var(--line);
            padding: 8px;
            gap: 6px;
          }
          .yt-nav-btn { width: auto; white-space: nowrap; padding: 8px 12px; }
          .yt-count { display: none; }
          .yt-main { padding: 18px; }
          .yt-hero h1 { font-size: 34px; }
          .yt-top { flex-direction: column; align-items: flex-start; }
        }

        /* Compact instrument layout: red marks, dark metal, readable records. */
        .yt-terminal {line-height:1.5; background:radial-gradient(ellipse at 75% 0%,#202124 0,transparent 55%),#0b0c0e;}
        .yt-terminal h1,.yt-terminal h2,.yt-terminal h3 {font-family:Arial,sans-serif;}
        .yt-top {padding:18px 28px;background:#101113;border-bottom:1px solid #414247;box-shadow:0 3px 0 #090a0c;}
        .yt-brand strong {font-size:19px;letter-spacing:3px;}
        .yt-brand span {font:12px Arial,sans-serif;letter-spacing:.4px;text-transform:none;color:#a4a5a8;}
        .yt-hud-icon {width:36px;height:36px;}
        .yt-shell {max-width:1600px;grid-template-columns:200px minmax(0,1fr);}
        .yt-nav {background:#101113;padding:28px 12px;border-color:#292c30;}
        .yt-terminal .yt-nav-btn {font:13px Arial,sans-serif;min-height:44px;letter-spacing:.25px;border-radius:0;border-left:2px solid transparent;}
        .yt-terminal .yt-nav-btn[aria-current=page] {color:#fff0e9;background:linear-gradient(90deg,#48231f,#211b1b);border-left-color:#f47058;}
        .yt-count {background:transparent;font-size:11px;color:#b0ada9;}
        .yt-main {padding:30px 32px 60px;}
        .yt-dashboard-heading {display:flex;align-items:baseline;justify-content:space-between;margin-bottom:23px;gap:12px;}
        .yt-dashboard-heading h1 {font-size:27px;line-height:1.2;margin:0;font-weight:600;letter-spacing:-.5px;}
        .yt-dashboard-heading>span {font-size:12px;color:var(--muted);}
        .yt-summary-strip {display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-block:1px solid #454044;margin-bottom:26px;background:#141518;}
        .yt-terminal .yt-summary-strip button {text-align:left;padding:17px 18px 18px;position:relative;border-right:1px solid #2d2f33;display:grid;grid-template-columns:1fr auto;gap:3px;}
        .yt-summary-strip button:last-child {border-right:0;}
        .yt-summary-strip button:hover {background:#241d1d;}
        .yt-summary-strip strong {font:32px/1.2 monospace;grid-column:1;grid-row:1;color:#f3ece3;}
        .yt-summary-strip button>span:last-child {font-size:12px;color:#b7b6b6;grid-column:1 / -1;}
        .yt-index {grid-column:2;grid-row:1;font:10px monospace;color:#cf6353;}
        .yt-dashboard-grid {display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:20px;align-items:start;}
        .yt-panel {background:linear-gradient(120deg,#191b1e,#141619);border:1px solid #34373b;padding:20px;position:relative;border-radius:0;min-width:0;}
        .yt-panel:before {content:'';position:absolute;left:-1px;top:-1px;width:15px;height:5px;border-top:2px solid #ab5044;border-left:2px solid #ab5044;pointer-events:none;}
        .yt-panel-head {padding-bottom:13px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #34373b;}
        .yt-panel-head h2 {font:600 14px Arial,sans-serif;letter-spacing:.3px;text-transform:none;color:#ebe7df;margin:0;}
        .yt-panel-head .yt-textlink {font:12px Arial,sans-serif;color:#b9b8b6;white-space:nowrap;}
        .yt-documents-panel {grid-column:2;grid-row:2 / span 2;}
        .yt-dashboard-row {display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:15px 0;border-bottom:1px solid #2a2d31;}
        .yt-dashboard-row:last-child {border-bottom:0;padding-bottom:3px;}
        .yt-dashboard-row>div {min-width:0;}
        .yt-terminal .yt-record-name {font:500 14px/1.5 Arial,sans-serif;color:#eee8df;text-align:left;padding:0;overflow-wrap:anywhere;}
        .yt-record-name svg {display:inline;margin-left:8px;color:#c96b5c;vertical-align:middle;}
        .yt-terminal .yt-record-name:hover {color:#ffa694;}
        .yt-terminal button:disabled {opacity:.6;cursor:default;}
        .yt-dashboard-row small,.yt-roster-table small {display:block;font:12px/1.6 Arial,sans-serif;color:#9fa1a5;margin-top:4px;}
        .yt-terminal .yt-textlink {text-decoration:none;color:#e69383;}
        .yt-terminal .yt-textlink:hover {text-decoration:underline;}
        .yt-tag {border:1px solid #4b4b50;background:#202226;color:#ccc9c3;font:10px/1.4 monospace;padding:3px 6px;white-space:normal;border-radius:0;}
        .yt-table-scroll {overflow:auto;}
        .yt-roster-table {width:100%;border-collapse:collapse;text-align:left;font-size:13px;color:#ded9d0;}
        .yt-dashboard-grid>.yt-panel {margin-bottom:0;}
        .yt-terminal .yt-nav-btn[aria-current=page] {clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);}
        .yt-roster-table th {font:11px Arial,sans-serif;color:#999ca1;padding:9px 12px 9px 0;border-bottom:1px solid #2a2d31;}
        .yt-roster-table td {padding:17px 12px 17px 0;vertical-align:top;}
        .yt-roster-table tr+tr td {border-top:1px solid #2a2d31;}
        .yt-empty {font:13px/1.6 Arial,sans-serif;color:var(--muted);padding:10px 0;}
        .yt-hero {padding:22px 24px;background:#17191c;border-color:#34373b;border-left:3px solid #cb5745;}
        .yt-hero h1 {font:600 30px/1.2 Arial,sans-serif;margin:8px 0 12px;letter-spacing:0;overflow-wrap:anywhere;}
        .yt-terminal .yt-button {border:1px solid #45464b;background:#222428;font:12px/1.5 Arial,sans-serif;border-radius:0;}
        .yt-terminal .yt-button:hover {background:#322421;border-color:#d16d5a;}
        .yt-terminal .yt-nav-btn svg {color:#a8a4a1;}
        .yt-terminal .yt-nav-btn[aria-current=page] svg {color:#f38470;}
        @media(max-width:1050px){.yt-shell{grid-template-columns:172px minmax(0,1fr)}.yt-main{padding:24px 20px}.yt-dashboard-grid{grid-template-columns:1fr}.yt-documents-panel{grid-column:auto;grid-row:auto}.yt-summary-strip button{padding:15px 10px!important}}
        @media(max-width:680px){.yt-top{padding:14px 16px;flex-wrap:wrap;gap:12px}.yt-shell{display:block}.yt-nav{display:flex;overflow-x:auto;gap:4px;padding:8px;border-right:0;border-bottom:1px solid #34373b}.yt-terminal .yt-nav-btn{width:auto;flex-shrink:0;margin:0;min-height:40px;padding:8px 12px}.yt-count{margin-left:3px}.yt-main{padding:22px 14px}.yt-summary-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.yt-summary-strip button{border-bottom:1px solid #2d2f33!important}.yt-summary-strip strong{font-size:26px}.yt-panel{padding:16px}.yt-dashboard-row{gap:10px}.yt-roster-table{min-width:460px}.yt-dashboard-heading>span{display:none}.yt-hero{padding:18px}.yt-hero h1{font-size:25px}}
      `}</style>

      {/* TOP HEADER */}
      <header className="yt-top">
        <div className="yt-brand">
          <svg viewBox="0 0 40 40" className="yt-hud-icon">
            <path d="M4 13V4h9M27 4h9v9M36 27v9h-9M13 36H4v-9" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="20" cy="12" r="2.5" fill="currentColor"/>
            <circle cx="13" cy="24" r="2.5" fill="currentColor"/>
            <circle cx="27" cy="24" r="2.5" fill="currentColor"/>
            <line x1="20" y1="2" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="20" y1="32" x2="20" y2="38" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="2" y1="20" x2="8" y2="20" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="32" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <div>
            <strong>{config.name || "Tjau'ke"}</strong>
            <span>Clan dashboard</span>
          </div>
        </div>

        <div className="yt-toplinks">
          {config.rulesUrl && (
            <button 
              type="button" 
              onClick={() => handleLink(config.rulesUrl)} 
              className="yt-button"
              title="Open Predator Honour Code"
            >
              <ExternalLink size={13} color="#ee8070" />
              <span>Honour Code ↗</span>
            </button>
          )}

          {config.dossierUrl && (
            <button 
              type="button" 
              onClick={() => handleLink(config.dossierUrl)} 
              className="yt-button"
              title="Open Weyland-Yutani Assessment"
            >
              <ExternalLink size={13} color="#ee8070" />
              <span>W-Y Dossier ↗</span>
            </button>
          )}

          {issues.length > 0 && (
            <button 
              type="button" 
              onClick={() => setShowDiagnostics(!showDiagnostics)} 
              className="yt-button yt-danger"
            >
              <AlertTriangle size={13} />
              <span>{issues.length} Discrepanc{issues.length === 1 ? 'y' : 'ies'}</span>
            </button>
          )}
        </div>
      </header>

      {/* DIAGNOSTICS BANNER */}
      {showDiagnostics && issues.length > 0 && (
        <div style={{ background: '#261b17', borderBottom: '1px solid #7c3a29', padding: '14px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ font: '11px monospace', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Data issues
            </span>
            <button type="button" onClick={() => setShowDiagnostics(false)} style={{ color: '#fca5a5' }}>
              <X size={16} />
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', font: '12px monospace', color: '#fecaca' }}>
            {issues.map((msg, i) => (
              <li key={i} style={{ marginBottom: '4px' }}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* MAIN SHELL */}
      <div className="yt-shell">
        {/* SIDEBAR NAVIGATION */}
        <aside className="yt-nav">
          {nav.map(item => {
            const Icon = item.icon;
            const isCurrent = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="yt-nav-btn"
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <Icon size={15} color={isCurrent ? '#ee8070' : '#95999e'} />
                <span>{item.label}</span>
                {item.count !== null && <span className="yt-count">{item.count}</span>}
              </button>
            );
          })}

        </aside>

        {/* MAIN CONTENT VIEWPORT */}
        <main className="yt-main">
{Object.values(sources).some(v=>v!=='ready') && <div role="status" style={{padding:'12px 16px',marginBottom:16,border:'1px solid #806438',color:'#eac58b',fontSize:13}}>Some tables are unavailable.<details><summary>Source details</summary><ul>{Object.entries(sources).map(([key,status])=><li key={key}>{RECORD_MAP[key].sheet}: {status==='ready'?d[key].length+' visible records':status}</li>)}</ul><p>Supplied ranges: {getRangeList(data).map(r=>r.name||r.sheetName||r.title||r.range||'(unnamed)').join(', ')||'No named ranges supplied'}</p></details></div>}




          {section === 'overview' && !selected && (
            <div className="yt-overview">
              <div className="yt-dashboard-heading"><h1>Dashboard</h1></div>
              <div className="yt-summary-strip">
                {[["members","Hunters"],["houses","Households"],["hunts","Undertakings"],["chronicle","History"],["library","Documents"]].map(([type,label],i)=><button type="button" key={type} onClick={()=>go(type)}><span className="yt-index">0{i+1}</span><strong>{sources[type]==='ready'?d[type].length:'—'}</strong><span>{label}</span></button>)}
              </div>
              <div className="yt-dashboard-grid">
                <section className="yt-panel yt-roster-panel">
                  <div className="yt-panel-head"><h2>Hunters</h2><button type="button" className="yt-textlink" onClick={()=>go('members')}>Full roster →</button></div>
                  {d.members.length ? <div className="yt-table-scroll"><table className="yt-roster-table"><thead><tr><th>Hunter</th><th>Rank</th><th>Household</th><th>Standing</th></tr></thead><tbody>{d.members.slice(0,6).map(m=><tr key={m.id}><td><button type="button" className="yt-record-name" onClick={()=>inspect('members',m.id)}>{m.name}</button><small>{m.player}</small></td><td>{m.rank||'Unrecorded'}</td><td><RefLink type="houses" value={m.house}/></td><td><span className="yt-tag">{m.status||'Unrecorded'}</span></td></tr>)}</tbody></table></div>:<p className="yt-empty">{sources.members==='ready'?'No hunters recorded.':'Roster unavailable.'}</p>}
                </section>
                <section className="yt-panel">
                  <div className="yt-panel-head"><h2>Open undertakings</h2><button type="button" className="yt-textlink" onClick={()=>go('hunts')}>All →</button></div>
                  {activeHunts.length ? activeHunts.slice(0,4).map(h=><div className="yt-dashboard-row" key={h.id}><div><button type="button" className="yt-record-name" onClick={()=>inspect('hunts',h.id)}>{h.name}</button><small><RefLink type="members" value={h.hunter}/></small></div><span className="yt-tag">{h.state}</span></div>):<p className="yt-empty">{sources.hunts==='ready'?'No open undertakings.':'Undertakings unavailable.'}</p>}
                </section>
                <section className="yt-panel yt-documents-panel">
                  <div className="yt-panel-head"><h2>Documents</h2><button type="button" className="yt-textlink" onClick={()=>go('library')}>All →</button></div>
                  {d.library.length ? d.library.slice(0,5).map(doc=><div className="yt-dashboard-row" key={doc.id}><div><button type="button" disabled={!terminalUrl(doc.url)} className="yt-record-name" onClick={()=>handleLink(doc.url)}>{doc.name}<ExternalLink size={12}/></button><small>{doc.category||'Unfiled'}</small></div></div>):<p className="yt-empty">{sources.library==='ready'?'No documents recorded.':'Documents unavailable.'}</p>}
                </section>
                <section className="yt-panel">
                  <div className="yt-panel-head"><h2>Households & duties</h2><button type="button" className="yt-textlink" onClick={()=>go('houses')}>All →</button></div>
                  {d.houses.slice(0,3).map(h=><div className="yt-dashboard-row" key={h.id}><div><button type="button" className="yt-record-name" onClick={()=>inspect('houses',h.id)}>{h.name}</button><small>Senior: <RefLink type="members" value={h.senior}/></small></div><span className="yt-tag">{d.members.filter(m=>same('houses',m.house,h.id)).length} hunters</span></div>)}
                  {currentDuties.slice(0,3).map(duty=><div className="yt-dashboard-row" key={duty.id}><div><button type="button" className="yt-record-name" onClick={()=>inspect('duties',duty.id)}>{duty.name}</button><small><RefLink type="members" value={duty.member}/></small></div></div>)}
                  {!d.houses.length&&!currentDuties.length&&<p className="yt-empty">No household or current duty records available.</p>}
                </section>
                <section className="yt-panel">
                  <div className="yt-panel-head"><h2>History</h2><button type="button" className="yt-textlink" onClick={()=>go('chronicle')}>All →</button></div>
                  {d.chronicle.length ? d.chronicle.slice(0,4).map(entry=><div className="yt-dashboard-row" key={entry.id}><div><button type="button" className="yt-record-name" onClick={()=>inspect('chronicle',entry.id)}>{entry.name}</button><small>{entry.era||'Date unrecorded'}</small></div><span className="yt-tag">{entry.certainty||'Unrecorded'}</span></div>):<p className="yt-empty">{sources.chronicle==='ready'?'No history recorded.':'History unavailable.'}</p>}
                </section>
              </div>
            </div>
          )}

          {/* 2. MEMBERS / HUNTERS LIST */}
          {section === 'members' && !selected && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#f7f4e9' }}>Hunters</h1>
                  
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button" 
                    onClick={() => setShowArchived(!showArchived)} 
                    className="yt-button"
                  >
                    <span>{showArchived ? 'Hide Archived' : 'Show Archived'}</span>
                  </button>
                </div>
              </div>

              {/* SEARCH & RANK FILTER PILLS */}


              <div className="yt-pill-group">
                <button 
                  type="button" 
                  className="yt-pill" 
                  aria-pressed={!filters.rank} 
                  onClick={() => setFilters({ ...filters, rank: undefined })}
                >
                  All Ranks
                </button>
                {TERMINAL_RANKS.map(([engRank, yautjaName]) => (
                  <button 
                    key={engRank} 
                    type="button" 
                    className="yt-pill"
                    aria-pressed={filters.rank === engRank}
                    onClick={() => setFilters({ ...filters, rank: filters.rank === engRank ? undefined : engRank })}
                  >
                    {engRank} ({yautjaName})
                  </button>
                ))}
              </div>

              {/* HUNTERS CARDS LIST */}
              {(() => {
                const list = (showArchived ? all.members : d.members) || [];
                const filtered = list.filter(m => {
                  if (filters.rank && terminalKey(m.rank) !== terminalKey(filters.rank)) return false;
                  if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const matchName = m.name?.toLowerCase().includes(q);
                    const matchEpithet = m.epithet?.toLowerCase().includes(q);
                    const matchPlayer = m.player?.toLowerCase().includes(q);
                    const matchBio = m.biography?.toLowerCase().includes(q);
                    if (!matchName && !matchEpithet && !matchPlayer && !matchBio) return false;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="yt-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <p style={{ font: '14px monospace', color: 'var(--muted)' }}>
                        No hunters match the selected filters or query.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="yt-card-grid">
                    {filtered.map(hunter => {
                      const rInfo = rank(hunter.rank);
                      return (
                        <div key={hunter.id} className="yt-card">
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                              <span className="yt-tag" style={{ borderLeft: '3px solid var(--amber)' }}>
                                {rInfo[0]} · {rInfo[1]}
                              </span>
                              {hunter.archived && <span className="yt-tag" style={{ color: '#fca5a5' }}>Archived</span>}
                            </div>

                            <h3 style={{ margin: '0 0 6px', fontSize: '20px', color: '#f7f4e9' }}>
                              <button type="button" onClick={() => inspect('members', hunter.id)} className="yt-textlink" style={{ textDecoration: 'none' }}>
                                {hunter.name}
                              </button>
                            </h3>
                            {hunter.epithet && (
                              <p style={{ margin: '0 0 14px', font: 'italic 12px Arial, sans-serif', color: '#cbd4c7' }}>
                                "{hunter.epithet}"
                              </p>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px', font: '12px monospace', margin: '14px 0' }}>
                              <span style={{ color: 'var(--muted)' }}>Agaj'ya:</span>
                              <span><RefLink type="houses" value={hunter.house} /></span>

                              <span style={{ color: 'var(--muted)' }}>Player:</span>
                              <span style={{ color: '#d2d5c4' }}>{hunter.player || '—'}</span>

                              <span style={{ color: 'var(--muted)' }}>Standing:</span>
                              <span style={{ color: hunter.status === 'Active' ? '#86efac' : 'var(--amber)' }}>{hunter.status || 'Active'}</span>

                              {hunter.joined && (
                                <>
                                  <span style={{ color: 'var(--muted)' }}>Joined:</span>
                                  <span>{formatDateSafe(hunter.joined)}</span>
                                </>
                              )}
                            </div>

                            {hunter.biography && (
                              <p style={{ font: '13px/1.6 Arial, sans-serif', color: '#b9c4b5', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '12px 0 16px' }}>
                                {hunter.biography}
                              </p>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid var(--line)', marginTop: '10px' }}>
                            <button type="button" onClick={() => inspect('members', hunter.id)} className="yt-button" style={{ fontSize: '11px' }}>
                              <Eye size={12} />
                              <span>View Dossier</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 3. HOUSEHOLDS / HOUSES LIST */}
          {section === 'houses' && !selected && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#f7f4e9' }}>Households</h1>
                  
                </div>
              </div>

              <div className="yt-card-grid">
                {(d.houses || []).map(house => {
                  const houseMembers = (d.members || []).filter(m => same('houses', m.house, house.id));
                  return (
                    <div key={house.id} className="yt-card">
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span className="yt-tag">{house.status || 'Active'}</span>
                          <span style={{ font: '11px monospace', color: 'var(--muted)' }}>{houseMembers.length} Hunters</span>
                        </div>
                        <h3 style={{ margin: '0 0 6px', fontSize: '22px', color: '#f7f4e9' }}>
                          <button type="button" onClick={() => inspect('houses', house.id)} className="yt-textlink" style={{ textDecoration: 'none' }}>
                            {house.name}
                          </button>
                        </h3>
                        {house.meaning && (
                          <p style={{ margin: '0 0 14px', font: 'italic 12px Arial, sans-serif', color: 'var(--amber)' }}>
                            {house.meaning}
                          </p>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px', font: '12px monospace', margin: '12px 0' }}>
                          <span style={{ color: 'var(--muted)' }}>Senior:</span>
                          <span><RefLink type="members" value={house.senior} /></span>

                          <span style={{ color: 'var(--muted)' }}>Vessel:</span>
                          <span style={{ color: '#d2d5c4' }}>{house.vessel || 'Vessel unrecorded'}</span>
                        </div>

                        {house.history && (
                          <p style={{ font: '13px Arial, sans-serif', color: '#b9c4b5', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '14px 0' }}>
                            {house.history}
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid var(--line)', marginTop: '10px' }}>
                        <button type="button" onClick={() => inspect('houses', house.id)} className="yt-button" style={{ fontSize: '11px' }}>
                          <Eye size={12} />
                          <span>View Holding</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. UNDERTAKINGS / HUNTS LIST */}
          {section === 'hunts' && !selected && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#f7f4e9' }}>Undertakings</h1>
                  
                </div>
              </div>

              <div className="yt-pill-group">
                <button 
                  type="button" 
                  className="yt-pill" 
                  aria-pressed={!filters.huntState}
                  onClick={() => setFilters({ ...filters, huntState: undefined })}
                >
                  All States
                </button>
                {['Planned', 'Declared', 'Underway', 'Concluded', 'Abandoned'].map(st => (
                  <button 
                    key={st} 
                    type="button" 
                    className="yt-pill"
                    aria-pressed={filters.huntState === st}
                    onClick={() => setFilters({ ...filters, huntState: filters.huntState === st ? undefined : st })}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="yt-card-grid">
                {(d.hunts || [])
                  .filter(h => !filters.huntState || h.state === filters.huntState)
                  .map(hunt => (
                    <div key={hunt.id} className="yt-card">
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span className="yt-tag">{hunt.state}</span>
                          <span style={{ font: '11px monospace', color: 'var(--amber)' }}>{hunt.review || 'Pending Review'}</span>
                        </div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#f7f4e9' }}>
                          <button type="button" onClick={() => inspect('hunts', hunt.id)} className="yt-textlink" style={{ textDecoration: 'none' }}>
                            {hunt.name}
                          </button>
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '85px 1fr', gap: '6px', font: '12px monospace', margin: '12px 0' }}>
                          <span style={{ color: 'var(--muted)' }}>Hunter:</span>
                          <span><RefLink type="members" value={hunt.hunter} /></span>

                          <span style={{ color: 'var(--muted)' }}>Witness:</span>
                          <span>{hunt.witness ? <RefLink type="members" value={hunt.witness} /> : 'None recorded'}</span>

                          <span style={{ color: 'var(--muted)' }}>Weapons:</span>
                          <span style={{ color: '#d2d5c4' }}>{hunt.weapon || 'Not declared'}</span>
                        </div>

                        <div style={{ background: '#17201a', padding: '10px 12px', border: '1px solid #28372d', margin: '12px 0', fontSize: '12px' }}>
                          <div style={{ font: '10px monospace', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Target Quarry
                          </div>
                          <p style={{ margin: 0, color: '#e1e7dc' }}>{hunt.quarry || 'Selection pending assessment'}</p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid var(--line)', marginTop: '10px' }}>
                        <button type="button" onClick={() => inspect('hunts', hunt.id)} className="yt-button" style={{ fontSize: '11px' }}>
                          <Eye size={12} />
                          <span>Terms & Grounds</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 5. CHRONICLE / HISTORY LIST */}
          {section === 'chronicle' && !selected && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#f7f4e9' }}>History</h1>
                  
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {(d.chronicle || []).map(entry => (
                  <div key={entry.id} className="yt-panel" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {entry.order && <span className="yt-tag" style={{ color: 'var(--amber)' }}>#{entry.order}</span>}
                        <span className="yt-tag">{entry.category || 'Historical entry'}</span>
                        {entry.certainty && <span className="yt-tag" style={{ borderStyle: 'dashed' }}>{entry.certainty}</span>}
                      </div>
                      <span style={{ font: '11px monospace', color: 'var(--muted)' }}>
                        Era: {entry.era || 'Unrecorded era'}
                      </span>
                    </div>

                    <h2 style={{ fontSize: '22px', margin: '0 0 10px', color: '#f7f4e9' }}>
                      <button type="button" onClick={() => inspect('chronicle', entry.id)} className="yt-textlink" style={{ textDecoration: 'none' }}>
                        {entry.name}
                      </button>
                    </h2>

                    <div style={{ display: 'flex', gap: '16px', font: '12px monospace', color: 'var(--muted)', marginBottom: '12px', flexWrap: 'wrap' }}>
                      {entry.member && <span>Hunter: <RefLink type="members" value={entry.member} /></span>}
                      {entry.house && <span>Household: <RefLink type="houses" value={entry.house} /></span>}
                      {entry.hunt && <span>Undertaking: <RefLink type="hunts" value={entry.hunt} /></span>}
                    </div>

                    {entry.summary && (
                      <div style={{ background: '#16201a', borderLeft: '3px solid var(--amber)', padding: '12px 16px', margin: '10px 0 14px' }}>
                        <p style={{ margin: 0, font: '14px/1.6 Arial, sans-serif', color: '#dbe0d4' }}>
                          {entry.summary}
                        </p>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
                      <button type="button" onClick={() => inspect('chronicle', entry.id)} className="yt-button" style={{ fontSize: '11px' }}>
                        <span>Open record →</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. DUTIES LIST */}
          {section === 'duties' && !selected && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#f7f4e9' }}>Duties</h1>
                  
                </div>
              </div>

              <div className="yt-card-grid">
                {(d.duties || []).map(duty => (
                  <div key={duty.id} className="yt-card">
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span className="yt-tag">{duty.status || 'Active'}</span>
                      </div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#f7f4e9' }}>
                        <button type="button" onClick={() => inspect('duties', duty.id)} className="yt-textlink" style={{ textDecoration: 'none' }}>
                          {duty.name}
                        </button>
                      </h3>

                      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '6px', font: '12px monospace', margin: '12px 0' }}>
                        <span style={{ color: 'var(--muted)' }}>Holder:</span>
                        <span><RefLink type="members" value={duty.member} /></span>

                        <span style={{ color: 'var(--muted)' }}>Scope:</span>
                        <span><RefLink type="houses" value={duty.house} /></span>
                      </div>

                      {duty.mandate && (
                        <p style={{ font: '13px Arial, sans-serif', color: '#b9c4b5', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '12px 0' }}>
                          {duty.mandate}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid var(--line)', marginTop: '10px' }}>
                      <button type="button" onClick={() => inspect('duties', duty.id)} className="yt-button" style={{ fontSize: '11px' }}>
                        <Eye size={12} />
                        <span>View Mandate</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. POLITICS & RELATIONS */}
          {section === 'politics' && !selected && <PoliticsSheetView input={data} />}

          {section === 'library' && !selected && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#f7f4e9' }}>Documents</h1>
                  
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(d.library || []).map(doc => (
                  <div key={doc.id} className="yt-panel" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {doc.order && <span className="yt-tag" style={{ color: 'var(--amber)' }}>Order #{doc.order}</span>}
                        <span className="yt-tag">{doc.category || 'General Shelf'}</span>
                      </div>
                      {doc.url && (
                        <button type="button" onClick={() => handleLink(doc.url)} className="yt-button yt-primary" style={{ fontSize: '11px' }}>
                          <ExternalLink size={12} />
                          <span>Open Document ↗</span>
                        </button>
                      )}
                    </div>

                    <h2 style={{ fontSize: '20px', margin: '0 0 10px', color: '#f7f4e9' }}>{doc.name}</h2>
                    <p style={{ font: '14px/1.7 Arial, sans-serif', color: '#c7d1c2', margin: '0 0 14px' }}>
                      {doc.summary || 'No abstract recorded.'}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
                      <span style={{ font: '10px monospace', color: 'var(--muted)' }}>{doc.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 9. SETTINGS VIEW */}
          {section === 'settings' && !selected && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: '0 0 6px', fontSize: '28px', color: '#f7f4e9' }}>Configuration</h1>
                
              </div>

              <div className="yt-panel">
                <div className="yt-panel-head">
                  <h2>Active Settings Record</h2>
                  <span className="yt-tag">Read-Only</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '14px 20px', font: '13px monospace' }}>
                  <span style={{ color: 'var(--muted)', textTransform: 'uppercase' }}>Affiliation Name:</span>
                  <span style={{ color: '#f7f4e9', fontWeight: 'bold' }}>{config.name || 'Not set'}</span>

                  <span style={{ color: 'var(--muted)', textTransform: 'uppercase' }}>Subtitle:</span>
                  <span>{config.subtitle || 'Not set'}</span>

                  <span style={{ color: 'var(--muted)', textTransform: 'uppercase' }}>Introduction Text:</span>
                  <span style={{ font: '14px/1.6 Arial, sans-serif', color: '#d2d8ca', whiteSpace: 'pre-line' }}>
                    {config.welcome || 'No welcome text set.'}
                  </span>

                  <span style={{ color: 'var(--muted)', textTransform: 'uppercase' }}>Honour Code URL:</span>
                  <span>
                    {config.rulesUrl ? (
                      <button type="button" onClick={() => handleLink(config.rulesUrl)} className="yt-textlink">
                        {config.rulesUrl}
                      </button>
                    ) : 'Not configured'}
                  </span>

                  <span style={{ color: 'var(--muted)', textTransform: 'uppercase' }}>W-Y Dossier URL:</span>
                  <span>
                    {config.dossierUrl ? (
                      <button type="button" onClick={() => handleLink(config.dossierUrl)} className="yt-textlink">
                        {config.dossierUrl}
                      </button>
                    ) : 'Not configured'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 10. DEEP RECORD INSPECTION VIEW */}
          {selected && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <button type="button" onClick={() => setSelection(null)} className="yt-button">
                  <ArrowLeft size={13} />
                  <span>Return to {section.toUpperCase()}</span>
                </button>
                <span className="yt-tag" style={{ borderLeft: '3px solid var(--amber)' }}>Record Archive Mode · Read-Only</span>
              </div>

              {/* MEMBER DOSSIER */}
              {selection.type === 'members' && (
                <div>
                  <div className="yt-hero" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <span className="yt-tag" style={{ borderLeft: '3px solid var(--amber)' }}>
                        {rank(selected.rank)[0]} · {rank(selected.rank)[1]}
                      </span>
                      <span className="yt-tag">{selected.status || 'Active Standing'}</span>
                    </div>
                    <h1>{selected.name}</h1>
                    {selected.epithet && (
                      <p style={{ font: 'italic 16px Arial, sans-serif', color: 'var(--amber)', margin: '0 0 16px' }}>
                        "{selected.epithet}"
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '20px', font: '12px monospace', color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <span>Agaj'ya: <RefLink type="houses" value={selected.house} /></span>
                      <span>Discord: <strong style={{ color: '#fff' }}>{selected.player || '—'}</strong></span>
                      {selected.joined && <span>Joined: <strong style={{ color: '#fff' }}>{formatDateSafe(selected.joined)}</strong></span>}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                    <div className="yt-panel">
                      <div className="yt-panel-head">
                        <h2>Life and Character</h2>
                      </div>
                      <p style={{ font: '14px/1.85 Arial, sans-serif', color: '#dbe0d4', whiteSpace: 'pre-line' }}>
                        {selected.biography || 'No biographical history recorded.'}
                      </p>
                    </div>

                    <div className="yt-panel">
                      <div className="yt-panel-head">
                        <h2>Appearance & Equipment</h2>
                      </div>
                      <p style={{ font: '14px/1.85 Arial, sans-serif', color: '#dbe0d4', whiteSpace: 'pre-line' }}>
                        {selected.appearance || 'No physical appearance or equipment notes recorded.'}
                      </p>
                    </div>
                  </div>

                  {selected.hooks && (
                    <div className="yt-panel" style={{ borderLeft: '3px solid var(--amber)' }}>
                      <div className="yt-panel-head">
                        <h2>Unfinished Business & Roleplay Hooks</h2>
                      </div>
                      <p style={{ font: '14px/1.85 Arial, sans-serif', color: '#ffe4c4', whiteSpace: 'pre-line' }}>
                        {selected.hooks}
                      </p>
                    </div>
                  )}

                  {/* LINKED RECORDS FOR THIS HUNTER */}
                  <div className="yt-panel">
                    <div className="yt-panel-head">
                      <h2>Associated Undertakings & Chronicles</h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                      <div>
                        <h4 style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: '8px' }}>
                          Hunting Accounts
                        </h4>
                        {(() => {
                          const hunts = (d.hunts || []).filter(h => same('members', h.hunter, selected.id) || same('members', h.witness, selected.id));
                          if (hunts.length === 0) return <span style={{ font: '12px monospace', color: 'var(--muted)' }}>No hunts recorded.</span>;
                          return hunts.map(h => (
                            <div key={h.id} style={{ marginBottom: '6px' }}>
                              <button type="button" onClick={() => inspect('hunts', h.id)} className="yt-textlink">
                                {h.name}
                              </button>
                              <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>({h.state})</span>
                            </div>
                          ));
                        })()}
                      </div>

                      <div>
                        <h4 style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: '8px' }}>
                          History Chronicle Entries
                        </h4>
                        {(() => {
                          const chron = (d.chronicle || []).filter(c => same('members', c.member, selected.id));
                          if (chron.length === 0) return <span style={{ font: '12px monospace', color: 'var(--muted)' }}>No chronicle entries recorded.</span>;
                          return chron.map(c => (
                            <div key={c.id} style={{ marginBottom: '6px' }}>
                              <button type="button" onClick={() => inspect('chronicle', c.id)} className="yt-textlink">
                                {c.name}
                              </button>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* HOUSEHOLD DOSSIER */}
              {selection.type === 'houses' && (
                <div>
                  <div className="yt-hero" style={{ marginBottom: '24px' }}>
                    <span className="yt-tag">{selected.status || "Active Agaj'ya"}</span>
                    <h1>{selected.name}</h1>
                    {selected.meaning && (
                      <p style={{ font: 'italic 16px Arial, sans-serif', color: 'var(--amber)' }}>{selected.meaning}</p>
                    )}
                    <div style={{ display: 'flex', gap: '20px', font: '12px monospace', color: 'var(--muted)' }}>
                      <span>Household Senior: <RefLink type="members" value={selected.senior} /></span>
                      <span>Vessel: <strong style={{ color: '#fff' }}>{selected.vessel || 'Unrecorded'}</strong></span>
                    </div>
                  </div>

                  <div className="yt-panel">
                    <div className="yt-panel-head">
                      <h2>History and Obligations</h2>
                    </div>
                    <p style={{ font: '14px/1.85 Arial, sans-serif', color: '#dbe0d4', whiteSpace: 'pre-line' }}>
                      {selected.history || 'No historical obligations recorded.'}
                    </p>
                  </div>

                  <div className="yt-panel">
                    <div className="yt-panel-head">
                      <h2>Customs and Material Identity</h2>
                    </div>
                    <p style={{ font: '14px/1.85 Arial, sans-serif', color: '#dbe0d4', whiteSpace: 'pre-line' }}>
                      {selected.identity || 'No customs or material traditions recorded.'}
                    </p>
                  </div>

                  <div className="yt-panel">
                    <div className="yt-panel-head">
                      <h2>Living Members in this Household</h2>
                    </div>
                    <div className="yt-card-grid">
                      {(d.members || []).filter(m => same('houses', m.house, selected.id)).map(m => (
                        <div key={m.id} style={{ background: '#16201a', padding: '12px 16px', border: '1px solid #34373b' }}>
                          <strong style={{ display: 'block', fontSize: '15px', color: '#f7f4e9' }}>
                            <RefLink type="members" value={m.id} />
                          </strong>
                          <span style={{ font: '11px monospace', color: 'var(--amber)' }}>{rank(m.rank)[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* HUNT DOSSIER */}
              {selection.type === 'hunts' && (
                <div>
                  <div className="yt-hero" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <span className="yt-tag">{selected.state}</span>
                      <span className="yt-tag" style={{ borderLeft: '3px solid var(--amber)' }}>{selected.review || 'Pending Review'}</span>
                    </div>
                    <h1>{selected.name}</h1>
                    <div style={{ display: 'flex', gap: '20px', font: '12px monospace', color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <span>Hunter: <RefLink type="members" value={selected.hunter} /></span>
                      <span>Witness (Hult'ah): {selected.witness ? <RefLink type="members" value={selected.witness} /> : 'None recorded'}</span>
                      {selected.era && <span>Expedition: <strong style={{ color: '#fff' }}>{selected.era}</strong></span>}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                    <div className="yt-panel">
                      <div className="yt-panel-head">
                        <h2>Identified Quarry & Weapon Declaration</h2>
                      </div>
                      <div style={{ marginBottom: '14px' }}>
                        <span style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase' }}>Quarry:</span>
                        <p style={{ margin: '4px 0 10px', font: '14px Arial, sans-serif', color: '#dbe0d4' }}>{selected.quarry || 'Unrecorded'}</p>
                      </div>
                      <div>
                        <span style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase' }}>Declared Weapons:</span>
                        <p style={{ margin: '4px 0 10px', font: '14px Arial, sans-serif', color: '#dbe0d4' }}>{selected.weapon || 'Unrecorded'}</p>
                      </div>
                      {selected.limits && (
                        <div>
                          <span style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase' }}>Additional Restrictions:</span>
                          <p style={{ margin: '4px 0', font: '14px Arial, sans-serif', color: '#dbe0d4' }}>{selected.limits}</p>
                        </div>
                      )}
                    </div>

                    <div className="yt-panel">
                      <div className="yt-panel-head">
                        <h2>Trophy Claim & Outcome</h2>
                      </div>
                      <div style={{ marginBottom: '14px' }}>
                        <span style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase' }}>Claimed Trophy:</span>
                        <p style={{ margin: '4px 0 10px', font: '14px Arial, sans-serif', color: '#dbe0d4' }}>{selected.trophy || 'No trophy claimed'}</p>
                      </div>
                      <div style={{ marginBottom: '14px' }}>
                        <span style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase' }}>Judgment & Grounds:</span>
                        <p style={{ margin: '4px 0 10px', font: '14px Arial, sans-serif', color: '#dbe0d4' }}>{selected.judgment || 'Judgment pending'}</p>
                      </div>
                      {selected.outside && (
                        <div>
                          <span style={{ font: '11px monospace', color: 'var(--amber)', textTransform: 'uppercase' }}>Outside Contribution:</span>
                          <p style={{ margin: '4px 0', font: '14px Arial, sans-serif', color: '#dbe0d4' }}>{selected.outside}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {selected.account && (
                    <div className="yt-panel">
                      <div className="yt-panel-head">
                        <h2>Returned Account of the Encounter</h2>
                      </div>
                      <p style={{ font: '14px/1.85 Arial, sans-serif', color: '#dbe0d4', whiteSpace: 'pre-line' }}>
                        {selected.account}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* CHRONICLE DOSSIER */}
              {selection.type === 'chronicle' && (
                <div>
                  <div className="yt-hero" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      {selected.order && <span className="yt-tag" style={{ color: 'var(--amber)' }}>Reading #{selected.order}</span>}
                      <span className="yt-tag">{selected.category || 'Chronicle'}</span>
                      {selected.certainty && <span className="yt-tag">{selected.certainty}</span>}
                    </div>
                    <h1>{selected.name}</h1>
                    <div style={{ display: 'flex', gap: '20px', font: '12px monospace', color: 'var(--muted)', flexWrap: 'wrap' }}>
                      {selected.member && <span>Hunter: <RefLink type="members" value={selected.member} /></span>}
                      {selected.house && <span>Household: <RefLink type="houses" value={selected.house} /></span>}
                      {selected.era && <span>Era: <strong style={{ color: '#fff' }}>{selected.era}</strong></span>}
                    </div>
                  </div>

                  {selected.summary && (
                    <div style={{ background: '#191b1f', borderLeft: '4px solid var(--amber)', padding: '16px 22px', marginBottom: '24px' }}>
                      <p style={{ font: '16px/1.7 Arial, sans-serif', color: '#e8eedf', margin: 0 }}>
                        {selected.summary}
                      </p>
                    </div>
                  )}

                  <div className="yt-panel">
                    <div className="yt-panel-head">
                      <h2>Full Preserved Narrative Account</h2>
                    </div>
                    <p style={{ font: '15px/1.9 Arial, sans-serif', color: '#dce2d5', whiteSpace: 'pre-line' }}>
                      {selected.body || 'No extended narrative account recorded.'}
                    </p>
                  </div>
                </div>
              )}

              {/* DUTY DOSSIER */}
              {selection.type === 'duties' && (
                <div>
                  <div className="yt-hero" style={{ marginBottom: '24px' }}>
                    <span className="yt-tag">{selected.status || 'Active Appointment'}</span>
                    <h1>{selected.name}</h1>
                    <div style={{ display: 'flex', gap: '20px', font: '12px monospace', color: 'var(--muted)' }}>
                      <span>Holder: <RefLink type="members" value={selected.member} /></span>
                      <span>Scope: <RefLink type="houses" value={selected.house} /></span>
                    </div>
                  </div>

                  <div className="yt-panel">
                    <div className="yt-panel-head">
                      <h2>Mandate, Authority, and Explicit Limits</h2>
                    </div>
                    <p style={{ font: '14px/1.85 Arial, sans-serif', color: '#dbe0d4', whiteSpace: 'pre-line' }}>
                      {selected.mandate || 'No mandate description recorded.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
