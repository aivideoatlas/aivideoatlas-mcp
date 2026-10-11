// AI Video Atlas MCP + REST API (Cloudflare Worker, free plan). Read-only, keyless, per-IP rate limited.
// DATA is inlined at build time from the site build (dist/agent-data.json) by build.mjs.
const DATA = __DATA__;
const SITE = 'https://aivideoatlas.com';
const VERSION = '1.0.0';
const SYN = [[/\blip[\s-]?sync(ing|ed)?\b/g,'lipsync'],[/\bimage[\s-]to[\s-]video\b/g,'i2v'],[/\btext[\s-]to[\s-]video\b/g,'t2v'],[/\b(cheapest|cheaper|cheap|pricing|prices|priced)\b/g,'price'],[/\bminimax\b/g,'hailuo'],[/\bconsistent\b/g,'consistent consistency'],[/\bcharacters\b/g,'character']];
const STOP = new Set('a an the and or of for to in on with how make do i my me want video ai shot shots using use is it that this from by'.split(' '));
const norm = s => { s = String(s||'').toLowerCase(); for (const [r,t] of SYN) s = s.replace(r,t); return s; };
const toks = s => norm(s).replace(/[^a-z0-9.$\s-]/g,' ').split(/\s+/).filter(w=>w.length>1&&!STOP.has(w));
const lev1 = (a,b) => { if (Math.abs(a.length-b.length)>1) return false; let i=0,j=0,e=0; while(i<a.length&&j<b.length){ if(a[i]===b[j]){i++;j++;continue;} if(++e>1) return false; if(a.length>b.length) i++; else if(b.length>a.length) j++; else {i++;j++;} } return e+(a.length-i)+(b.length-j)<=1; };
function indexDoc(fields){ return fields.map(([txt,w])=>[toks(txt),w]); }
function score(idx, qt){ let s=0, hit=0; for (const q of qt){ let best=0; for (const [ws,w] of idx){ for (const x of ws){ const m = x===q?1 : (q.length>=3&&x.startsWith(q))?0.8 : (q.length>=5&&lev1(x,q))?0.6 : 0; if (m*w>best) best=m*w; } } if (best>0) hit++; s+=best; } return {s, hit}; }
const SHOTS = DATA.shots.map(e=>({e, idx: indexDoc([[e.title,3],[e.model+' '+e.models.join(' '),2.5],[e.types.join(' ')+' '+DATA.types.filter(t=>e.types.includes(t.key)).map(t=>t.label).join(' ')+' '+e.useCases.join(' ').replace(/-/g,' '),2],[e.creator,1.5],[e.did,1.2],[e.how,1],[e.prompt.slice(0,1500),0.8]])}));
const GUIDES = DATA.guides.map(e=>({e, idx: indexDoc([[e.title,3],[e.models.join(' '),2],[e.useCases.join(' ').replace(/-/g,' ')+' '+e.jobs.join(' ').replace(/-/g,' ')+' '+DATA.jobs.filter(j=>e.jobs.includes(j.key)).map(j=>j.label).join(' ')+' '+e.type,2],[e.creator||'',1.5],[e.summary,1.2],[e.how,1]])}));
const famOf = m => { m = norm(m).trim(); const hit = DATA.models.find(x=>x.key===m||norm(x.name)===m||m.startsWith(x.key)); return hit?hit.key:null; };
function search(list, q, filt=()=>true){ const qt=toks(q); if(!qt.length) return list.filter(x=>filt(x.e)).map(x=>({e:x.e,score:0})); const need=Math.max(1,Math.ceil(qt.length*0.6)); return list.filter(x=>filt(x.e)).map(x=>{const r=score(x.idx,qt); return {e:x.e,score:r.s,hit:r.hit};}).filter(r=>r.hit>=need).sort((a,b)=>b.score-a.score||(b.e.likes||0)-(a.e.likes||0)); }
const shotOut = (e, full) => ({ title:e.title, url:e.url, model:e.model, creator:e.creator, source:e.source, watch_original:e.watch, posted:e.date, likes_on_x:e.likes, shot_types:e.types, what_they_did:e.did, how_it_went:e.how, cost:e.cost.line, cost_basis:e.cost.basis, ...(full?{prompt:e.prompt}:{prompt_excerpt:e.prompt.length>280?e.prompt.slice(0,277)+'…':e.prompt}), slug:e.slug });
const priceOut = r => ({ model:r.model, family:r.family, host:r.host, tier:r.tier, per_second_usd:r.perSecond, status:r.status, ...(r.lastStatedPerSecond!=null?{last_stated_per_second_usd:r.lastStatedPerSecond}:{}), ...(r.perSecond==null&&r.stated?{stated:r.stated}:{}), source:r.source, checked:r.checked });
const CREDIT = 'Always credit the creator and link the source/Atlas URL when you reuse a prompt.';


// ---- plan_shots (deterministic)
const TYPE_KW = { lipsync:/\b(lipsync|talk(s|ing)?|speak(s|ing)?|say(s|ing)?|dialogue|interview|sing(s|ing)?|monolog(ue)?|voice ?over)\b/, product:/\b(product|bottle|perfume|can|sneaker|shoe|watch|packag\w*|logo|label|cosmetic\w*|jar|phone)\b/, ads:/\b(ad|ads|advert\w*|commercial|brand\w*|promo\w*|campaign)\b/, music:/\b(music video|band|singer|concert|beat drop|dance)\b/, anime:/\b(anime|manga|cartoon|ghibli|cel[- ]shad\w*|2d)\b/, characters:/\b(same (character|person|woman|man)|consistent|recurring|our hero|character)\b/, cinematic:/\b(drone|aerial|wide|establishing|cinematic|landscape|sweep\w*|tracking|dolly|crane|push[- ]in|pull[- ]back|slow motion)\b/, shorts:/\b(vlog|selfie|tiktok|reel|short|ugc|pov|phone footage)\b/ };
const FRAMING = [[/\b(extreme )?close[- ]?ups?\b/,'close-up'],[/\bmacro\b/,'macro close-up'],[/\b(wide|establishing)( shot)?\b/,'wide shot'],[/\bmedium( shot)?\b/,'medium shot'],[/\b(aerial|drone)\b/,'aerial drone shot'],[/\bpush[- ]in\b/,'slow push-in'],[/\bpull[- ]back\b/,'pull-back'],[/\btracking\b/,'tracking shot'],[/\bslow[- ]?mo(tion)?\b/,'slow motion'],[/\bpov\b/,'POV shot'],[/\b(orbit\w*|360)\b/,'orbiting camera']];
const CRAFT = /\b(camera|lens|mm\b|shot on|lighting|lit\b|light\w*|dolly|tracking|push|pan\w*|tilt|crane|handheld|slow motion|depth of field|bokeh|film grain|grade|color|colour|4k|8k|cinematic|anamorphic|backlit|rim light|volumetric|shallow focus|soft focus)\b/i;
const FRAME_HEAD = /^\s*(?:(?:an?|the|this|our|my)\s+)?(?:(?:\d+(?:\.\d+)?\s*[- ]?\s*(?:seconds?|secs?|s|minutes?|mins?)\b|\d+\s*[- ]?\s*shots?\b|short|quick|vertical|horizontal|cinematic|anime|social|tiktok|youtube)[\s-]*)+(?:[\w'’-]+\s+){0,3}?(?:ad|advert|commercial|teaser|trailer|promo|music video|video|film|short|reel|opener|spot|story|sequence|montage|clip|edit)\b/i;
const FRAME_ANY = /^\s*(?:an?|the|this)\s+(?:[\w'’-]+\s+){0,4}?(?:ad|advert|commercial|teaser|trailer|promo|music video|video|film|reel|opener|spot|montage)\s+(?:for|about|of|showing|featuring|selling|introducing)\b/i;
function splitContext(d){ let t=String(d||'').replace(/\s+/g,' ').trim(); const ctx=[];
 for(let g=0;g<3;g++){ const m=t.match(/^([^.:;!?]{3,160})([.:;!?])\s*(.*)$/); if(!m) break; const head=m[1]; if(!(FRAME_HEAD.test(head)||FRAME_ANY.test(head))) break; if(!m[3]) break; ctx.push(head.trim()); t=m[3].trim(); }
 t=t.replace(/^(?:we\s+)?(?:open(?:s|ing)?|start(?:s|ing)?|begin(?:s|ning)?)\s+(?:on|with)\s+/i,'');
 const c=ctx.join('. '); const sec=c.match(/(\d+(?:\.\d+)?)\s*[- ]?\s*(seconds?|secs?|s|minutes?|mins?)\b/i); const n=c.match(/(\d+)\s*[- ]?\s*shots?\b/i);
 const total=sec?Math.round(parseFloat(sec[1])*(/^m/i.test(sec[2])?60:1)):null;
 return { body:t||String(d).trim(), context:c||null, total_seconds:total, shots_requested:n?+n[1]:null }; }
function splitBeats(d){ let t=' '+String(d||'').replace(/\s+/g,' ')+' '; t=t.replace(/\b(and then|then|cut to|next|after that|afterwards|finally|followed by|ending (on|with))\b/gi,'|'); const parts=t.split(/[|.;!?\n]+|,\s*(?=(close[- ]?up|wide|aerial|drone|macro|medium|a |an |the |we see|she |he |they ))/i).map(x=>x&&x.trim()).filter(x=>x&&x.length>3&&!/^(close[- ]?up|wide|aerial|drone|macro|medium|a|an|the|we see|she|he|they)$/i.test(x));
 return parts.length?parts.slice(0,8):[String(d).trim()]; }
const promoUntil = r => { const m=String((r.tier||'')+' '+(r.stated||'')).match(/(?:discount|promo\w*|offer)[^.;]*?through\s+(?:([A-Z][a-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?)/i); if(!m) return null; const d=new Date(`${m[1]} ${m[2]}, ${m[3]||'2026'} 12:00:00 GMT`); return isNaN(d)?null:d.toISOString().slice(0,10); };
const NOW_DAY = () => new Date().toISOString().slice(0,10);
const supportedRows = DATA.prices.filter(p=>p.status==='supported'&&typeof p.perSecond==='number'&&!(promoUntil(p)&&promoUntil(p)<NOW_DAY()));
// documented reference-image capacity for reference-to-video (only where the vendor page shows a single-reference r2v); unknown = no cap applied
const MAX_REFS = [[/^Vivix W1$/,1,'Vivix W1 page only documents Ref-to-Video with one reference image.']];
const maxRefs = model => (MAX_REFS.find(([r])=>r.test(model))||[])[1]??null;
const famCheapest = f => supportedRows.filter(p=>p.family===f).sort((a,b)=>a.perSecond-b.perSecond)[0]||null;
const capFirst = s => s.charAt(0).toUpperCase()+s.slice(1);
const TAIL = /[→+=>|"“”‘’'`]|\b(as|when|while|until|then|before|after)\b|\b(recording|records?|camcorder|vhs|footage ends?|ends?|ending|hand|hands|covers?|reaches?|grabs?|walks?|turns?|says?|shifts?|fades?|drips?|appears?|moves?|watermark|signature|subscribe|follow|credit|prompt by|made with|--\w+)\b|^\s*(and|or|but)\b/i;
function craftFrom(prompt){ const seen=new Set(); return String(prompt||'').replace(/\[[^\]]*\]/g,' ').replace(/"[^"]*"|“[^”]*”/g,' ').split(/[,.;:!?\n]+/).map(x=>x.trim()).filter(x=>!TAIL.test(x)).filter(x=>x.length>5&&x.split(/\s+/).length<=7&&CRAFT.test(x)&&!/\b[A-Z]{3,}\b/.test(x)&&!/^(keep|use|make|create|shift|dolly|tilt|show|add|let)\b/i.test(x)&&!/@|https?:|#\w|\b(she|he|they|her|his|woman|man|girl|boy)\b/i.test(x)).filter(x=>{const k=x.toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,3).join(', '); }
function cleanBeat(beat){ let t=beat.replace(/^[^:]{0,60}:\s*/,'').replace(/[,\s]+$/,'').trim();
 t=t.replace(/^(?:(?:a|an|the)\s+)?(?:slow\s+|quick\s+|extreme\s+)?(?:close[- ]?up|macro(?: shot)?|wide(?: shot)?|establishing shot|medium shot|aerial(?: shot)?|drone shot|tracking shot|push[- ]in|pull[- ]back|pov shot)\s*(?:of|on|as|over|showing|where)?\s*/i,'').trim();
 return t||beat.trim(); }
const MODE_LABEL={t2v:'text-to-video',i2v:'image-to-video (start frame)',r2v:'reference-to-video',start_end:'start/end frame',v2v:'video-to-video',lipsync:'native audio with lip sync'};
const modesFor = model => { const r=(DATA.modes&&DATA.modes.rules||[]).find(x=>new RegExp(x.match).test(model)); return r?{...r.modes,_source:r.source,_evidence:r.evidence,_checked:DATA.modes.checked}:{t2v:'unknown',i2v:'unknown',r2v:'unknown',start_end:'unknown',v2v:'unknown',lipsync:'unknown',_source:null,_evidence:'No mode documentation checked for this endpoint.',_checked:DATA.modes&&DATA.modes.checked}; };
const modesOut = m => Object.fromEntries(Object.keys(MODE_LABEL).map(k=>[k,m[k]]).concat([['source',m._source],['evidence',m._evidence],['checked',m._checked]]));
const rowsCheapestByModel = () => { const by={}; for(const r of supportedRows){ const k=r.model+'|'+r.host; if(!by[k]||r.perSecond<by[k].perSecond) by[k]=r; } return Object.values(by); };
const UNIQUE_ROWS = rowsCheapestByModel();
function desiredModes(type, consistent, beat){ const w=[]; if(type==='lipsync') w.push(['lipsync','the beat has spoken lines, so native audio with lip sync avoids a separate lip-sync pass']);
 if(consistent){ w.push(['r2v','reference-to-video keeps the same character/product consistent across shots']); w.push(['i2v','a start frame generated from the reference sheet keeps the subject consistent']); }
 if(/\b(transform|morph|turns into|becomes|from .+ to )\b/i.test(beat)) w.push(['start_end','start and end frames pin exactly where the shot begins and lands']);
 if(type==='product'||type==='ads') w.push(['i2v','a start frame locks the exact product look (shape, label, colour) before motion']);
 w.push(['t2v','text-to-video is simplest when nothing has to match another shot']); w.push(['i2v','image-to-video from a generated start frame']); return w; }
function pickMode(row, wants){ const m=modesFor(row.model); for(const [k,why] of wants) if(m[k]==='yes') return {mode:k,why}; return {mode:null,why:'The docs we checked do not confirm any generation mode for this endpoint; check the vendor page before using it.'}; }
function sheetsFor(desc, style){ const out=[]; const st=style?` Style: ${style}.`:'';
 const ch=desc.match(/\bsame ((?:[a-z\-]+ ){0,2}(?:model|woman|man|girl|boy|person|character|hero|actor|presenter|kid|dog|cat))\b/i)||desc.match(/\b(?:a|an|the)\s+((?:[a-z\-]+\s){0,3}(?:character|hero|girl|boy|woman|man|model|actor|presenter))\b/i);
 const pr=desc.match(/\b(perfume bottle|perfume|bottle|sneakers?|shoes?|watch|can|phone|jar|bag|car|serum|lipstick|headphones)\b/i);
 if(ch) out.push({kind:'character',subject:ch[1].toLowerCase(),prompt:`Character reference sheet of the ${ch[1].toLowerCase()}: front, three-quarter and side views plus a face close-up, neutral expression, same outfit, hair and features in every view, plain light-grey background, soft even studio lighting, high detail.${st}`});
 if(pr) out.push({kind:'product',subject:pr[1].toLowerCase(),prompt:`Product reference sheet of the ${pr[1].toLowerCase()}: front, side, back and top views plus a label close-up, true colours and materials, plain light-grey background, soft even studio lighting, no props, high detail.${st}`});
 return out; }
function imageModelFor(row){ if(/Runway/i.test(row.host)) return {name:'Runway Gen-4 Image (gen4_image)', why:'same Runway API account; supports tagged reference images (@tag) for consistency', source:'https://docs.dev.runwayml.com/guides/using-the-api/', price:'not tracked by Atlas'};
 if(/xAI/i.test(row.host)) return {name:'Grok Imagine Image', why:'same xAI account; suggestion only', source:'https://docs.x.ai/developers/model-capabilities/video/generation', price:'not tracked by Atlas'};
 return {name:'Any image model that accepts reference images (e.g. FLUX, Nano Banana, Gen-4 Image)', why:'suggestion only; Atlas does not track image-model prices', source:null, price:'not tracked by Atlas'}; }
function planShots(a){
 const desc=String(a.description||'').trim(); if(!desc) throw Object.assign(new Error('description is required'),{code:-32602});
 let sec=Math.max(1,Math.min(30,Number(a.clip_seconds)||5)); const style=a.style?String(a.style).trim():''; const whole=norm(desc);
 const B=a.budget_usd!=null&&a.budget_usd!==''?Number(a.budget_usd):null; const MPS=a.max_per_shot!=null&&a.max_per_shot!==''?Number(a.max_per_shot):null;
 const globalTypes=Object.entries(TYPE_KW).filter(([k,r])=>r.test(whole)).map(([k])=>k);
 const ctx=splitContext(desc); const beats=splitBeats(ctx.body); const consistent=/\b(same|consistent|recurring|throughout|every shot|each shot)\b/i.test(desc)||globalTypes.includes('characters')||beats.length>1&&globalTypes.includes('product');
 if(!(Number(a.clip_seconds)>0)&&ctx.total_seconds) sec=Math.max(1,Math.min(30,Math.round(ctx.total_seconds/beats.length)));
 const sheets=consistent?sheetsFor(desc,style):[]; const sheet=sheets[0]||null;
 const PRON={character:/\b(she|her|hers|herself|he|him|his|himself|they|them|their)\b/i, product:/\b(it|its|label|cap|lid|logo|packaging|bottle|can)\b/i};
 const mentions=(beat,x)=>{ const b=' '+beat.toLowerCase()+' '; const head=x.subject.split(/\s+/).pop().replace(/s$/,''); return new RegExp('\\b'+head+'s?\\b','i').test(b)||PRON[x.kind].test(b)||(x.kind==='character'&&/\b(model|woman|man|girl|boy|person|hero|actor|presenter)\b/i.test(head)&&/\b(her|she|he|him)\b/.test(b)); };
 const shots=beats.map((beat,i)=>{ const b=norm(beat); let types=Object.entries(TYPE_KW).filter(([k,r])=>r.test(b)).map(([k])=>k); if(!types.length) types=globalTypes.filter(t=>t!=='lipsync'); const type=types[0]||'cinematic';
  const framing=(FRAMING.find(([r])=>r.test(b))||[])[1]||null; const q=beat+' '+(style||'')+' '+types.join(' ');
  let hits=search(SHOTS,q,e=>e.types.includes(type)); if(!hits.length) hits=search(SHOTS,q); if(!hits.length) hits=search(SHOTS,type).slice(0,5);
  const ex=hits[0]?hits[0].e:null; const evidence={}; for(const h of hits.slice(0,15)){ const f=famOf(h.e.model); if(f) evidence[f]=(evidence[f]||0)+1; }
  const rel=sheets.filter(x=>mentions(beat,x)); const wants=desiredModes(type,consistent&&rel.length>0,beat);
  // candidate endpoints: every supported row, with the best mode it actually supports
  const cands=UNIQUE_ROWS.map(row=>{ const pm=pickMode(row,wants.filter(w=>!(w[0]==='r2v'&&maxRefs(row.model)!=null&&rel.length>maxRefs(row.model)))); const rank=pm.mode?wants.findIndex(w=>w[0]===pm.mode):99; return {row,f:row.family,ev:evidence[row.family]||0,mode:pm.mode,why:pm.why,rank}; }).filter(c=>c.mode);
  cands.sort((x,y)=>x.rank-y.rank||y.ev-x.ev||(famOf(ex&&ex.model||'')===y.f)-(famOf(ex&&ex.model||'')===x.f)||x.row.perSecond-y.row.perSecond);
  const subj=capFirst(cleanBeat(beat)); const craft=ex?craftFrom(ex.prompt):'';
  const wfJob=type==='lipsync'?'lip-sync':consistent&&sheetsFor(desc,style).some(x=>x.kind==='character')?'consistent-character':(type==='product'||type==='ads')?'product-ad':null;
  const wf=wfJob?DATA.guides.filter(g=>g.jobs.includes(wfJob)&&!g.legacy).sort((x,y)=>(y.stars||0)-(x.stars||0))[0]:null;
  return { beat, type, framing, subj, craft, ex, cands, wfJob, wf, rel }; });
 // choose: best-ranked candidate; then enforce max_per_shot and total budget by moving to cheaper candidates (same or next-best mode)
 const pick=shots.map(()=>0); const costOf=(i,j=pick[i])=>shots[i].cands[j].row.perSecond*sec; const total=()=>shots.reduce((t,_,i)=>t+costOf(i),0);
 let sameEndpoint=null; if(consistent&&shots.length>1){ const key=c=>c.row.model+'|'+c.row.host; const common=shots[0].cands.map(key).filter(k=>shots.every(sh=>sh.cands.some(c=>key(c)===k)));
  const score=k=>shots.reduce((t,sh)=>{const c=sh.cands.find(c=>key(c)===k);return t+c.rank*10-c.ev*0.1+c.row.perSecond;},0);
  const fitsK=k=>shots.every((sh,i)=>{const c=sh.cands.find(c=>key(c)===k);return (MPS==null||c.row.perSecond*sec<=MPS)})&&(B==null||shots.reduce((t,sh)=>t+sh.cands.find(c=>key(c)===k).row.perSecond*sec,0)<=B);
  const ranked=common.sort((x,y)=>score(x)-score(y)); const best=ranked.find(fitsK)||null;
  if(best){ sameEndpoint=best; shots.forEach((sh,i)=>{ pick[i]=sh.cands.findIndex(c=>key(c)===best); }); } }
 if(!sameEndpoint&&MPS!=null) shots.forEach((sh,i)=>{ if(costOf(i)>MPS){ const j=sh.cands.map((c,j)=>j).filter(j=>costOf(i,j)<=MPS).sort((x,y)=>sh.cands[x].rank-sh.cands[y].rank||costOf(i,x)-costOf(i,y))[0]; if(j!=null) pick[i]=j; } });
 if(!sameEndpoint&&B!=null){ let g=0; while(total()>B+1e-9&&g++<200){ let bi=-1,bj=-1,best=0; shots.forEach((sh,i)=>sh.cands.forEach((c,j)=>{ const save=costOf(i)-costOf(i,j); if(save<=1e-12) return; if(MPS!=null&&costOf(i,j)>MPS) return; const score=save/(1+Math.max(0,c.rank-sh.cands[pick[i]].rank)); if(score>best){best=score;bi=i;bj=j;} })); if(bi<0) break; pick[bi]=bj; } }
 const fits=B==null||total()<=B+1e-9; const fitsShot=i=>MPS==null||costOf(i)<=MPS+1e-9;
 const out=shots.map((sh,i)=>{ const c=sh.cands[pick[i]]; const row=c.row; const M=DATA.models.find(m=>m.key===c.f); const cost=+costOf(i).toFixed(2); const mo=modesFor(row.model);
  const pfx=sh.framing?capFirst(sh.framing)+': '+sh.subj.charAt(0).toLowerCase()+sh.subj.slice(1)+'.':sh.subj+'.';
  const rs=sh.rel; const ref=(c.mode==='r2v'||c.mode==='i2v')&&rs.length?` Keep ${rs.map(x=>'the '+x.subject).join(' and ')} identical to the reference image${rs.length>1?'s':''}.`:'';
  const videoPrompt=[pfx, style?`Style: ${style}.`:'', sh.craft?capFirst(sh.craft)+'.':'', ref.trim()].filter(Boolean).join(' ');
  const still=`${sh.framing?capFirst(sh.framing)+' still frame':'Still frame'}: ${sh.subj.charAt(0).toLowerCase()+sh.subj.slice(1)}${style?', '+style:''}${sh.craft?', '+sh.craft.toLowerCase():''}. Composed as the first frame of a video shot, sharp focus, no text overlays.`;
  const imgs=[]; if(c.mode==='i2v') imgs.push({frame:'start frame',prompt:still+(sh.rel.length?` Match ${sh.rel.map(x=>'the '+x.subject).join(' and ')} to the reference sheet${sh.rel.length>1?'s':''} (use as image reference).`:'')});
  if(c.mode==='start_end'){ imgs.push({frame:'start frame',prompt:still}); imgs.push({frame:'end frame',prompt:`Still frame: the final moment of the shot: ${sh.subj.charAt(0).toLowerCase()+sh.subj.slice(1)}, action completed, same camera position, lighting and style${style?' ('+style+')':''} as the start frame.`}); }
  if(c.mode==='r2v'&&sh.rel.length) sh.rel.forEach(x=>imgs.push({frame:`reference image (${x.kind})`,prompt:`Use the shared ${x.kind} reference sheet (see reference_sheets).`}));
  if(c.mode==='r2v'&&!sh.rel.length) imgs.push({frame:'reference image',prompt:still});
  const cheaper=sh.cands.map((x,j)=>({x,j})).filter(o=>o.x.row.perSecond<row.perSecond&&o.x.mode===c.mode).sort((p,q)=>p.x.rank-q.x.rank||p.x.row.perSecond-q.x.row.perSecond)[0];
  const over=(B!=null&&!fits)||!fitsShot(i);
  return { shot:i+1, beat:sh.beat.replace(/^[^:]{0,80}:\s*/,'').replace(/[,;\s]+$/,'').trim(), shot_type:sh.type, framing:sh.framing,
   model:{ name:M?M.name:c.f, endpoint:row.model, host:row.host, tier:row.tier, per_second_usd:row.perSecond, ...(promoUntil(row)?{price_note:`limited-time promo price, vendor-stated until ${promoUntil(row)}`}:{}), source:row.source, checked:row.checked, evidence:`${c.ev} matching Atlas shot(s) made with ${M?M.name:c.f}` },
   mode:{ use:c.mode, label:MODE_LABEL[c.mode], reason:c.why, supported_modes:modesOut(mo) },
   video_prompt:videoPrompt, image_prompts:imgs,
   adapted_from: sh.ex?{title:sh.ex.title,creator:sh.ex.creator,model:sh.ex.model,original_prompt_excerpt:sh.ex.prompt.length>240?sh.ex.prompt.slice(0,237)+'…':sh.ex.prompt,source:sh.ex.source,atlas_url:sh.ex.url}:null,
   est_cost_usd:cost, cost_basis:`${sec}s × $${row.perSecond}/s (vendor-stated, ${row.host}, checked ${row.checked})`,
   ...(MPS!=null?{within_max_per_shot:fitsShot(i)}:{}),
   cheaper_alternative: cheaper&&(over||true)?{endpoint:cheaper.x.row.model,host:cheaper.x.row.host,per_second_usd:cheaper.x.row.perSecond,mode:cheaper.x.mode,est_cost_usd:+(cheaper.x.row.perSecond*sec).toFixed(2),source:cheaper.x.row.source,...(promoUntil(cheaper.x.row)?{price_note:`limited-time promo price, vendor-stated until ${promoUntil(cheaper.x.row)}`}:{}),tradeoff:cheaper.x.rank>c.rank?`uses ${MODE_LABEL[cheaper.x.mode]} instead of ${MODE_LABEL[c.mode]}`:'same mode, cheaper endpoint'}:null,
   workflow: sh.wf?{job:sh.wfJob,title:sh.wf.title,url:sh.wf.url,source:sh.wf.source}:null,
   guide: guideRef(c.f) }; });
 const T=+total().toFixed(2); const img=out.length?imageModelFor(shots[0].cands[pick[0]].row):null; const needsImages=out.some(s=>s.image_prompts.length)||!!sheet;
 const cheapestAll=+shots.reduce((t,sh)=>t+Math.min(...sh.cands.map(c=>c.row.perSecond))*sec,0).toFixed(2);
 return { beats:out.length, clip_seconds:sec, ...(ctx.context?{plan_context:{text:ctx.context,total_seconds:ctx.total_seconds,shots_requested:ctx.shots_requested,clip_seconds_from:Number(a.clip_seconds)>0?'clip_seconds argument':ctx.total_seconds?`total ${ctx.total_seconds}s ÷ ${out.length} shots`:'default'}}:{}), style:style||null, consistency:consistent?((sameEndpoint||new Set(out.map(o=>o.model&&o.model.endpoint+'|'+o.model.host)).size<=1)?(out.length>1?'on: same subject and the same endpoint in every shot':'on: same subject (single shot)'):'on: same subject, but no single endpoint fit every shot within your limits, so shots use different models; keep the reference sheet the same across them'):'off',
  ...(sheets.length?{reference_sheets:sheets.map(x=>{const fam0=out.length?shots[0].cands[pick[0]].f:null; if(x.kind==='character'&&out.length&&out.every((o,i)=>shots[i].cands[pick[i]].f==='seedance')) return {...x,prompt:`Two reference images of the ${x.subject}: (1) a head-and-shoulders headshot, neutral expression, plain background; (2) a full-body photo in the same outfit, plain background.${style?` Style: ${style}.`:''}`,why:'BytePlus Seedance 2.0 prompt guide: use a headshot plus a full-body photo; multi-view character sheets are not recommended because the model may read the angles as different people.',source:'https://docs.byteplus.com/en/docs/modelark/seedance-2-0-prompt-guide',use:'Upload as Image 1 (headshot) and Image 2 (full body) and tag the character as <name>@Image 1 in every shot.'}; return {...x,use:'Generate once; pass as the reference image (reference-to-video) or use it to generate each start frame (image-to-video).'};})}:{}),
  ...(needsImages?{suggested_image_model:img}:{}),
  guides:[topicRef('shot-vocabulary'),...(consistent?[topicRef('consistent-characters'),topicRef('tagging')]:[]),...(needsImages?[topicRef('i2v-vs-r2v')]:[])].filter(Boolean),
  shots:out, total_est_usd:T,
  ...(B!=null?{budget_usd:B,fits_budget:fits,budget_note:fits?`Fits: $${T} of $${B}.`:`Can't fit $${B}: the cheapest plan using documented modes is $${cheapestAll} for ${out.length} × ${sec}s. Use fewer or shorter shots, or raise the budget.`}:{}),
  ...(MPS!=null?{max_per_shot_usd:MPS,all_shots_within_max:out.every(s=>s.within_max_per_shot)}:{}),
  notes:['Deterministic plan from Atlas data; no AI generation. Prompts are adapted from sourced examples. Atlas has no evidence of how they perform, so test one shot first.','Modes come only from vendor docs (see supported_modes.source). "unknown" means the docs did not say, and such modes are never picked.','Costs are vendor-stated $/s × seconds. Image generation costs are not included.', CREDIT] }; }


// ---- guidance layer (data/guidance/*.json: vendor prompting docs + Atlas editorial, each item cited)
const G = DATA.guidance||{models:{},topics:{}};
const GALIAS = {grok:'grok-imagine','grok imagine':'grok-imagine','grok-imagine-video':'grok-imagine',minimax:'hailuo','hailuo ai':'hailuo',gemini:'veo','google veo':'veo',ray:'luma','luma ray':'luma','dream machine':'luma',lightricks:'ltx',alibaba:'wan',bytedance:'seedance',kuaishou:'kling'};
const gKey = s => { s=String(s||'').toLowerCase().trim(); return GALIAS[s]||s; };
const famKey = f => f==='grok'?'grok-imagine':f;
const atlasFam = k => k==='grok-imagine'?'grok':k;
const GUIDE_KINDS = ['structure','camera','responds_to','mode','consistency','tagging','audio','avoid','limits','workflow','technique','pricing'];
function provenExamples(k,n=3){ const f=atlasFam(k); return DATA.shots.filter(s=>!s.legacy&&(s.models||[]).includes(f)).sort((a,b)=>(b.likes||0)-(a.likes||0)).slice(0,n).map(s=>({title:s.title,creator:s.creator,likes:s.likes??null,url:s.url,source:s.source,prompt_excerpt:s.prompt.length>300?s.prompt.slice(0,297)+'…':s.prompt})); }
function guideRef(f){ const k=famKey(f), items=G.models[k]; if(!items) return null;
 const order=['structure','camera','mode','consistency','audio']; const tips=[]; for(const kd of order){ const x=items.find(i=>i.kind===kd&&i.origin==='vendor-doc'); if(x&&tips.length<3) tips.push({kind:x.kind,text:x.text,source:x.source}); }
 return { model:k, tool:`get_guide({"model":"${k}"})`, resource:`atlas://guides/${k}`, tips }; }
function topicRef(t){ return G.topics[t]?{topic:t,tool:`get_guide({"topic":"${t}"})`,resource:`atlas://guides/topic/${t}`}:null; }
function guideMd(title,items,ex){ const src=[...new Set(items.flatMap(i=>i.sources||[i.source]).filter(Boolean))];
 return `# ${title}\n\n${GUIDE_KINDS.filter(k=>items.some(i=>i.kind===k)).map(k=>`## ${k.replace('_',' ')}\n${items.filter(i=>i.kind===k).map(i=>`- ${i.text} (${i.origin==='atlas-editorial'?'Atlas editorial':i.credit||'source'}${i.source?': '+i.source:''})`).join('\n')}`).join('\n\n')}${ex&&ex.length?`\n\n## Proven Atlas examples\n${ex.map(e=>`- ${e.title} by ${e.creator||'unknown'}: ${e.url}`).join('\n')}`:''}\n\nSources: ${src.join(' · ')}\n`; }

const TOOLS = {
 plan_shots: {
  description: 'Plan a multi-shot AI video from a plain description (deterministic, built only from Atlas data; no AI generation). The description is split into beats (sentences, clauses, and cues like "then", "cut to", "close-up", "wide"). For each beat it returns a shot type; a recommended model endpoint with its current vendor-stated $/s and source; the generation mode to use (t2v, i2v, reference-to-video, start/end frame, v2v, lip sync; only modes the vendor docs confirm) with a one-line reason; image prompts for any input frames, plus a shared character/product reference sheet when shots must match; an adapted prompt built from the best-matching sourced example (credited and linked), an estimated cost (5 s per shot by default), and a how-to workflow when one applies (lip sync, consistent character…). It also returns a total. budget_usd (total) and/or max_per_shot steer it to cheaper supported endpoints; each shot also offers a cheaper alternative with its cost, and the plan says if the budget can\'t be met. Use this for "plan / storyboard / make me a video of…" requests; use find_shot for a single shot.',
  inputSchema: { type:'object', properties:{ description:{type:'string',description:'What the video should show, in plain words. Several beats are fine.'}, budget_usd:{type:'number',description:'Optional total budget in USD.'}, style:{type:'string',description:'Optional look applied to every shot, e.g. "35mm film, warm grade" or "anime".'}, max_per_shot:{type:'number',description:'Optional maximum USD per shot.'}, clip_seconds:{type:'number',default:5,description:'Seconds per shot (default 5).'} }, required:['description'] },
  run: a => planShots(a) },
 find_shot: {
  description: `Search AI Video Atlas's library of ${DATA.shots.length} sourced AI video shots (real prompts that creators posted, with the model used, an estimated cost and a link to the original). Use this FIRST when the user describes a shot, scene, style or job ("product ad with a rotating can", "anime fight", "lip sync dialogue", "drone over mountains"). Filters: shot_type (${DATA.types.map(t=>t.key).join(', ')}), model (e.g. kling, veo, seedance), max_cost_usd (estimated cost of the clip; when the prompt states no length we use a 5-second clip). Returns prompt excerpts; call best_prompt with a slug for the full prompt. Do not use for prices alone (use get_prices) or for tools/workflows (use get_workflow).`,
  inputSchema: { type:'object', properties:{ query:{type:'string',description:'What the shot should look like or achieve, in plain words.'}, shot_type:{type:'string',enum:DATA.types.map(t=>t.key)}, model:{type:'string',description:'Only shots made with this model family (strict; comparisons that merely include it are excluded), e.g. kling, veo, seedance, hailuo, runway, luma, wan, ltx, sora'}, max_cost_usd:{type:'number',description:'Max estimated cost per clip in USD'}, limit:{type:'integer',minimum:1,maximum:20,default:5} }, required:['query'] },
  run: a => { const f=a.model?famOf(a.model):null; const r=search(SHOTS,a.query||'',e=>(!a.shot_type||e.types.includes(a.shot_type))&&(!f||famOf(e.model)===f)&&(a.max_cost_usd==null||(e.cost.value5s!=null&&e.cost.value5s<=a.max_cost_usd))).slice(0,Math.min(20,a.limit||5)); return { count:r.length, results:r.map(x=>shotOut(x.e)), next: r.length?`Call best_prompt with shot="${r[0].e.slug}" for the full prompt${a.model?'':', or pass model to adapt it'}.`:'No match. Try fewer or simpler words, drop filters, or call get_workflow for how-to guides.', note:CREDIT }; } },
 best_prompt: {
  description: 'Get the full, sourced prompt that best matches a shot (free text or a slug from find_shot), optionally for a target model. Returns the exact prompt text as the creator posted it, the creator credit and source, the model it was made with, and factual adaptation notes when the target model differs (other Atlas shots on the target model and its current supported price). Atlas never claims how a prompt will perform on a model it was not made with; treat adaptation notes as guidance.',
  inputSchema: { type:'object', properties:{ shot:{type:'string',description:'A slug from find_shot or a plain description of the shot.'}, model:{type:'string',description:'Target model family (optional).'} }, required:['shot'] },
  run: a => { const f=a.model?famOf(a.model):null; let e=DATA.shots.find(x=>x.slug===String(a.shot).trim()); if(!e){ const onModel=f?search(SHOTS,a.shot,x=>x.models.includes(f))[0]:null; e=(onModel||search(SHOTS,a.shot)[0]||{}).e; }
   if(!e) return { found:false, next:'No matching shot. Try find_shot with simpler words.' };
   const out={ found:true, shot:shotOut(e,true) }; if(f&&!e.models.includes(f)){ const M=DATA.models.find(m=>m.key===f); const alt=search(SHOTS,e.title+' '+e.types.join(' '),x=>x.models.includes(f)).slice(0,3).map(x=>({title:x.e.title,slug:x.e.slug,url:x.e.url}));
    out.adaptation={ target_model:M?M.name:a.model, made_with:e.model, notes:[`This prompt was made with ${e.model}, not ${M?M.name:a.model}. Atlas has no evidence of how it performs on ${M?M.name:a.model}.`, M&&M.newestSupported?`Newest supported ${M.name} version we track: ${M.newestSupported.model} at $${M.newestSupported.perSecond}/s (${M.newestSupported.host}).`:`No supported per-second price for ${a.model} in Atlas.`, 'Keep the subject, action, camera and lighting lines; remove model-specific syntax (e.g. @references, version names) the target model does not support; check the target model\'s max clip length.'], similar_shots_on_target_model:alt }; }
   out.note=CREDIT; return out; } },
 recommend_model: {
  description: 'Recommend which AI video model to use for a shot, with the evidence: how many sourced Atlas shots of that kind were made with each model, the cheapest supported vendor-stated $/s, and an estimated total for the clip length and number of clips. Pass budget_usd (total) and/or max_per_shot to drop models whose estimate exceeds it; over-budget models are listed with their cost. Each row includes the generation modes the vendor docs confirm (t2v, i2v, reference-to-video, start/end, v2v, lip sync; unknown where docs do not say). Legacy, deprecated and discontinued models are never recommended. This ranks by evidence and price only, not by quality.',
  inputSchema: { type:'object', properties:{ shot:{type:'string'}, budget_usd:{type:'number',description:'Total budget for all clips'}, max_per_shot:{type:'number',description:'Max USD per clip'}, clip_seconds:{type:'number',default:5}, clips:{type:'integer',default:1} }, required:['shot'] },
  run: a => { const sec=a.clip_seconds||5, n=a.clips||1; const hits=search(SHOTS,a.shot).slice(0,40); const ev={}; for(const h of hits) for(const m of h.e.models) (ev[m]??=[]).push(h.e);
   let rows=DATA.models.filter(m=>m.cheapest).map(m=>{const p=m.cheapest.perSecond; return { model:m.name, key:m.key, matching_shots:(ev[m.key]||[]).length, example_shots:(ev[m.key]||[]).slice(0,2).map(e=>({title:e.title,url:e.url})), cheapest_supported:`$${p}/s (${m.cheapest.model}, ${m.cheapest.host}, checked ${m.cheapest.checked})`, estimated_total_usd:+(p*sec*n).toFixed(2), per_clip_usd:+(p*sec).toFixed(2), modes:modesOut(modesFor(m.cheapest.model)), newest_supported:m.newestSupported?`${m.newestSupported.model} $${m.newestSupported.perSecond}/s`:null, model_page:m.url };});
   const okB=r=>(a.budget_usd==null||r.estimated_total_usd<=a.budget_usd)&&(a.max_per_shot==null||r.per_clip_usd<=a.max_per_shot); const over=rows.filter(r=>!okB(r)).map(r=>({model:r.model,estimated_total_usd:r.estimated_total_usd})); rows=rows.filter(okB);
   rows.sort((x,y)=>y.matching_shots-x.matching_shots||x.estimated_total_usd-y.estimated_total_usd);
   return { assumptions:`${n} clip(s) × ${sec}s at the cheapest supported vendor-stated $/s. Estimates only; vendors may bill minimums or credits.`, recommendations:rows.slice(0,6), over_budget:over, next:'Call best_prompt with the shot and the chosen model, or get_prices for every tier.' }; } },
 get_prices: {
  description: 'Vendor-stated AI video prices per second from AI Video Atlas\'s tracker, each with its source URL and the date we checked it. Filter by model family or host. Legacy, deprecated and discontinued rows are excluded unless include_legacy=true (then they are flagged by status). Use for "how much does X cost", "cheapest model", or before quoting any cost.',
  inputSchema: { type:'object', properties:{ model:{type:'string'}, host:{type:'string'}, include_legacy:{type:'boolean',default:false}, sort:{type:'string',enum:['cheapest','model'],default:'cheapest'} } },
  run: a => { const f=a.model?famOf(a.model):null; let r=DATA.prices.filter(p=>(a.include_legacy||p.status==='supported'||p.status==='no-per-second-price')&&(!a.model||(f?p.family===f:norm(p.model).includes(norm(a.model))))&&(!a.host||norm(p.host).includes(norm(a.host))));
   r.sort((x,y)=>a.sort==='model'?x.model.localeCompare(y.model):(x.perSecond??1e9)-(y.perSecond??1e9)); return { count:r.length, rows:r.map(priceOut), page:f?`${SITE}/models/${f}/`:`${SITE}/prices/`, note:'Prices are copied verbatim from vendor/host pages; per_second_usd is null where the vendor bills per video or by credits (see stated).' }; } },
 get_workflow: {
  description: `How-to workflows, tools and model guides for AI video, grouped by job: ${DATA.jobs.map(j=>`${j.key} (${j.label})`).join(', ')}. Pass job for a curated list, query for free text (e.g. "comfyui lipsync", "upscale to 4k"), or slug for one item in full. Returns sources, creators, license and price as stated.`,
  inputSchema: { type:'object', properties:{ job:{type:'string',enum:DATA.jobs.map(j=>j.key)}, query:{type:'string'}, slug:{type:'string'}, limit:{type:'integer',default:8,maximum:25} } },
  run: a => { const out=e=>({title:e.title,type:e.type,url:e.url,creator:e.creator,source:e.source,summary:e.summary,how:e.how||undefined,models:e.models,jobs:e.jobs,license:e.license||undefined,price:e.price||undefined,github_stars:e.stars||undefined,legacy:e.legacy||undefined,slug:e.slug});
   if(a.slug){const e=DATA.guides.find(x=>x.slug===a.slug); return e?{found:true,item:out(e)}:{found:false}; }
   const r=search(GUIDES,a.query||'',e=>!a.job||e.jobs.includes(a.job)).sort((x,y)=>a.query?0:(y.e.stars||0)-(x.e.stars||0)).slice(0,Math.min(25,a.limit||8)); return { count:r.length, results:r.map(x=>out(x.e)), next:r.length?'Pass slug for one item in full.':'No match; try a job key or simpler words.' }; } },
 get_guide: {
  description: 'Prompting guidance from AI Video Atlas, sourced from vendor prompting docs (Google, BytePlus, Runway, Luma, MiniMax, Alibaba, LTX, xAI, fal) plus proven Atlas examples. Pass model (kling, veo, seedance, runway, luma, hailuo, wan, ltx, grok-imagine…) for prompt structure, camera language, what the model responds to, things to avoid and known limits; or topic (shot-vocabulary, tagging, consistent-characters, i2v-vs-r2v, setup-playbooks). Every item carries its source URL; items marked atlas-editorial are our summary, not a vendor claim. Call with no arguments to list what exists. Use before writing a prompt for a specific model.',
  inputSchema: { type:'object', properties:{ model:{type:'string',description:'Model family, e.g. kling, veo, seedance, runway, luma, hailuo, wan, ltx, grok-imagine'}, topic:{type:'string',enum:Object.keys(G.topics)}, kind:{type:'string',enum:GUIDE_KINDS,description:'Optional filter, e.g. camera or avoid'} } },
  run: a => { const avail={models:Object.keys(G.models).sort(),topics:Object.keys(G.topics).sort(),kinds:GUIDE_KINDS};
   if(!a.model&&!a.topic) return { available:avail, usage:'get_guide({"model":"kling"}) or get_guide({"topic":"consistent-characters"}); add kind to filter.' };
   const isT=!!a.topic, k=isT?a.topic:gKey(a.model), items=(isT?G.topics:G.models)[k];
   if(!items) return { error:`No guide for ${isT?'topic':'model'} "${a.topic||a.model}".`, available:avail };
   const sel=a.kind?items.filter(i=>i.kind===a.kind):items;
   return { [isT?'topic':'model']:k, resource:isT?`atlas://guides/topic/${k}`:`atlas://guides/${k}`, count:sel.length,
    items:sel.map(i=>({kind:i.kind,text:i.text,source:i.source,...(i.sources&&i.sources.length>1?{sources:i.sources}:{}),credit:i.credit||null,origin:i.origin||'source-note',checked:i.checked||null})),
    sources:[...new Set(sel.flatMap(i=>i.sources||[i.source]).filter(Boolean))],
    ...(isT?{}:{proven_examples:provenExamples(k),model_page:(DATA.models.find(m=>m.key===atlasFam(k))||{}).url||null}),
    note:'Vendor-doc items paraphrase the cited page; check the source before relying on a limit. Proven examples are sourced Atlas shots with their creators.' }; } },
 whats_new: {
  description: 'What is new in AI Video Atlas: the newest sourced shots and guides added in the last N days (default 7), newest first, with X like counts where we have them ("new" otherwise). Use for "what\'s new in AI video", weekly roundups, or trend questions. For the full weekly digest (new models, price changes, new shots, legacy prices) read https://aivideoatlas.com/digest/latest.json.',
  inputSchema: { type:'object', properties:{ days:{type:'integer',default:7,maximum:60}, kind:{type:'string',enum:['shots','guides','all'],default:'all'}, limit:{type:'integer',default:10,maximum:30} } },
  run: a => { const since=Date.now()-(a.days||7)*864e5; const lim=Math.min(30,a.limit||10); const k=a.kind||'all';
   const s=k!=='guides'?DATA.shots.filter(e=>Date.parse(e.date||0)>=since).sort((x,y)=>Date.parse(y.date)-Date.parse(x.date)).slice(0,lim).map(e=>({kind:'shot',title:e.title,url:e.url,model:e.model,creator:e.creator,posted:e.date,signal:e.likes?`${e.likes} likes on X`:'new',cost:e.cost.line})):[];
   const g=k!=='shots'?DATA.guides.filter(e=>Date.parse(e.date||0)>=since).sort((x,y)=>Date.parse(y.date)-Date.parse(x.date)).slice(0,lim).map(e=>({kind:e.type,title:e.title,url:e.url,creator:e.creator,added:e.date,summary:e.summary})):[];
   return { since:new Date(since).toISOString().slice(0,10), shots:s, guides:g, digest:{json:'https://aivideoatlas.com/digest/latest.json',markdown:'https://aivideoatlas.com/digest/latest.md',html:'https://aivideoatlas.com/digest/'}, data_generated:DATA.generated }; } },
};
const ANN = { readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false };
const GUIDE = `# AI Video Atlas: agent guide

AI Video Atlas (${SITE}) is a sourced directory of AI video: ${DATA.shots.length} real shots (prompt + model + estimated cost + creator credit), ${DATA.guides.length} workflows/tools/model guides, and vendor-stated prices per second for ${DATA.models.length} model families. Data updated ${DATA.generated.slice(0,10)}.

## Which tool when
- User wants a whole video, ad or sequence planned → plan_shots(description, budget_usd?, style?): beats → shot type, model + $/s + source, adapted credited prompt, cost, workflow, total.
- User describes a single shot or style → find_shot (filters: shot_type, model, max_cost_usd), then best_prompt(slug) for the full prompt.
- "Which model should I use / what will it cost?" → recommend_model(shot, budget_usd, clip_seconds, clips).
- "How much is X?" / "cheapest" → get_prices(model?, host?).
- "How do I do lip sync / consistent characters / upscale?" → get_workflow(job or query).
- "How do I prompt Kling / Veo / Seedance…?" → get_guide({model}). Topics: shot-vocabulary, tagging, consistent-characters, i2v-vs-r2v, setup-playbooks. plan_shots already returns a guide pointer per shot.
- "What's new?" → whats_new(days). Weekly digest for agents: https://aivideoatlas.com/digest/latest.json (also .md, archives at /digest/YYYY-MM-DD.json).

## Rules
- Generation modes (t2v, i2v, reference-to-video, start/end frame, v2v, lip sync) come only from vendor docs, with the source and check date; "unknown" modes are never recommended. plan_shots returns image prompts for any input frames, plus reference sheets when shots must match.
- Costs are estimates ("est.") from vendor-stated $/s; when a prompt states no clip length, 5 s is assumed. Legacy, deprecated and discontinued models are never used for estimates.
- "Not stated" / "unknown" means Atlas has no data. Never fill it in.
- Atlas does not judge quality. Rankings are by evidence (number of sourced shots) and price.
- ${CREDIT}
- Read-only and free; about 60 requests/min per client. On a 429, wait for Retry-After.

## Shot types
${DATA.types.map(t=>`- ${t.key}: ${t.label} (${t.count})`).join('\n')}

## Jobs (get_workflow)
${DATA.jobs.map(j=>`- ${j.key}: ${j.label}`).join('\n')}

## Models
${DATA.models.map(m=>`- ${m.key}: ${m.name}, ${m.shots} shots${m.cheapest?`, from $${m.cheapest.perSecond}/s`:''}`).join('\n')}
`;
const EXAMPLES = `# Worked examples

0. "Plan a 3-shot perfume ad under $5."
   plan_shots({description:"wide shot of the bottle on black marble, then a close-up of golden mist, then a slow push-in on the logo", budget_usd:5, style:"luxury, warm gold rim light"})
   Present each shot (type, model, $/s with source, adapted prompt, est. cost, credit and link), then the total and whether it fits.

1. "I need a 10-second product ad of a sneaker spinning, under $3."
   recommend_model({shot:"sneaker product ad spinning", budget_usd:3, clip_seconds:10}) → pick the top model
   find_shot({query:"sneaker product spin", shot_type:"product"}) → best_prompt({shot:"<slug>", model:"<picked>"})
   Answer with the prompt, the model, the estimate and its basis, and credit the creator.

2. "What's the cheapest way to make Veo videos?"  get_prices({model:"veo"}), then quote the top rows with their source and check date.

3. "How do I keep my character consistent across shots?"  get_workflow({job:"consistent-character"}) + find_shot({query:"consistent character", shot_type:"characters"}).

4. "Kling prompt for an anime fight under $1"  find_shot({query:"anime fight", model:"kling", max_cost_usd:1}).

5. "What's new this week?"  whats_new({days:7}).
`;
const RES = { 'atlas://guide':['Agent guide','How to use AI Video Atlas tools, cost rules and credit rules.',GUIDE], 'atlas://examples':['Worked examples','Multi-tool sessions for common requests.',EXAMPLES], 'atlas://pricing-rules':['Pricing rules','How cost estimates are computed.', 'Cost lines use the version named in the shot if we have a supported vendor-stated $/s for it, else the newest supported version of that model; otherwise "unknown". Legacy/deprecated/discontinued rows are never used. Totals = $/s × seconds (5 s assumed if the prompt states none) × clips. Prices are copied from vendor/host pages with a check date.'], 'atlas://shot-types':['Shot types','Outcome categories and counts.', JSON.stringify(DATA.types)] };
for(const [k,items] of Object.entries(G.models)) RES['atlas://guides/'+k]=[`Prompting guide: ${k}`,`Sourced prompting guidance for ${k}: structure, camera, what it responds to, avoid, limits.`,guideMd(`Prompting guide: ${k}`,items,provenExamples(k))];
for(const [t,items] of Object.entries(G.topics)) RES['atlas://guides/topic/'+t]=[`Guide: ${t}`,`Sourced guidance on ${t}.`,guideMd(`Guide: ${t}`,items)];
const PROMPTS = { write_prompt_for_model:{ description:'Write a video prompt for a specific model using its sourced Atlas prompting guide and proven examples.', arguments:[{name:'model',description:'Model family, e.g. kling, veo, seedance',required:true},{name:'shot',description:'What the shot should show',required:true}], text:a=>`Use AI Video Atlas: call get_guide({"model":"${a.model}"}) and follow its structure, camera and avoid items, look at its proven_examples, then write one prompt for ${a.model} for this shot: "${a.shot}". Cite the guide sources you used and say which mode (t2v, i2v, reference, first/last frame) the prompt assumes.` }, consistent_character_plan:{ description:'Plan a multi-shot video that keeps one character or product consistent.', arguments:[{name:'idea',required:true}], text:a=>`Use AI Video Atlas: get_guide({"topic":"consistent-characters"}) and get_guide({"topic":"tagging"}), then plan_shots for "${a.idea}" and make sure the reference assets and tags match the chosen model's guide.` }, plan_a_shot:{ description:'Plan an AI video end to end with Atlas: shots, models, prompts, costs, workflow.', arguments:[{name:'shot',description:'What you want to make',required:true},{name:'budget_usd',description:'Optional budget',required:false}], text:a=>`Plan this AI video using the AI Video Atlas tools: "${a.shot}"${a.budget_usd?` with a budget of $${a.budget_usd}`:''}. 0) plan_shots for a shot-by-shot plan, then refine: 1) recommend_model, 2) find_shot for the closest sourced examples, 3) best_prompt for the top example adapted to the chosen model, 4) get_workflow if a job applies (lip sync, consistent character…). Report model, prompt, estimated cost with its basis, and credit the creator.` }, budget_check:{ description:'Estimate what a batch of clips will cost on each model.', arguments:[{name:'clip_seconds',required:true},{name:'clips',required:true}], text:a=>`Use get_prices and recommend_model to estimate the cost of ${a.clips} clips of ${a.clip_seconds}s on each supported model. Show $/s, source, check date and total.` } };
const INSTRUCTIONS = `AI Video Atlas: sourced AI video shots (prompt + model + est. cost + creator), workflows by job, and vendor-stated prices per second. Use plan_shots to storyboard and price a whole video, find_shot for a described shot, recommend_model for "which model / what cost", get_prices for prices, get_workflow for how-to, whats_new for news. Read atlas://guide for rules: costs are estimates, legacy models are excluded, "not stated" means unknown, and always credit and link the creator. Read-only, free, no key. Use get_guide for sourced per-model prompting guidance (structure, camera language, what to avoid, limits) before writing a prompt for a specific model.`;

// ---- rate limit (per isolate; IP is used in memory only and never stored or logged)
const RL = new Map();
function limited(ip){ const now=Date.now(), m=60e3; let r=RL.get(ip); if(!r||now-r.t>m){ r={t:now,n:0}; RL.set(ip,r);} r.n++; if(RL.size>5000) RL.clear(); return r.n>60 ? Math.ceil((r.t+m-now)/1000) : 0; }
const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-methods':'GET, POST, OPTIONS', 'access-control-allow-headers':'content-type, mcp-protocol-version, mcp-session-id, accept', 'access-control-expose-headers':'mcp-session-id' };
const json = (o,s=200,h={}) => new Response(JSON.stringify(o,null,1),{status:s,headers:{'content-type':'application/json; charset=utf-8',...CORS,...h}});
// ---- anonymous metrics: per-day tally in a Durable Object (free tier). Stores counts only: no IPs, no query text, no session ids.
let EVENTS=[]; const cname=v=>String(v==null||v===''?'unknown':v).toLowerCase().replace(/[^a-z0-9._@\/ -]/g,'').trim().slice(0,40)||'unknown';
function metric(ev,a,b,channel){ EVENTS.push(ev==='initialize'?{e:'init',client:cname(a)}:{e:'tool',tool:String(a).slice(0,40),ch:channel}); }
const dayKey=()=>new Date().toISOString().slice(0,10); // UTC day
let CUR_SESSION='';
function log(kind,name,args,count,ms,client){ metric('tool',name,client,kind); try{ const q=args&&(args.query||args.shot||args.job||args.model||''); console.log(JSON.stringify({ev:'atlas_query',kind,tool:name,q:String(q).toLowerCase().trim().slice(0,200),args:Object.keys(args||{}),count,ms,client:client||null})); }catch(e){} }
const countOf = r => r==null?0:(r.beats ?? r.count ?? r.results?.length ?? r.rows?.length ?? r.recommendations?.length ?? (r.found===false?0:1));
function callTool(name,args){ const t=TOOLS[name]; if(!t) throw Object.assign(new Error(`Unknown tool: ${name}`),{code:-32602}); return t.run(args||{}); }

let NEW_SESSION='';
async function mcp(req, client){
 let body; try{ body=await req.json(); }catch(e){ return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},400); }
 CUR_SESSION=(req.headers.get('mcp-session-id')||'').slice(0,40); NEW_SESSION=''; /* set after the only await so concurrent requests in one isolate don't mix */
 const one = async m => { const {id,method,params}=m; if(id===undefined||id===null) return null; const ok=result=>({jsonrpc:'2.0',id,result}); const err=(code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
  try{ switch(method){
   case 'initialize': { const ci=(params&&params.clientInfo)||{}; NEW_SESSION=crypto.randomUUID(); metric('initialize',ci.name||'unknown'); } return ok({ protocolVersion:(params&&params.protocolVersion)||'2025-06-18', capabilities:{tools:{listChanged:false},resources:{listChanged:false},prompts:{listChanged:false}}, serverInfo:{name:'ai-video-atlas',title:'AI Video Atlas',version:VERSION,websiteUrl:SITE}, instructions:INSTRUCTIONS });
   case 'ping': return ok({});
   case 'tools/list': return ok({ tools:Object.entries(TOOLS).map(([name,t])=>({name,title:name.replace(/_/g,' '),description:t.description,inputSchema:t.inputSchema,annotations:ANN})) });
   case 'tools/call': { const t0=Date.now(); const r=callTool(params.name,params.arguments); log('mcp',params.name,params.arguments,countOf(r),Date.now()-t0,client); return ok({ content:[{type:'text',text:JSON.stringify(r,null,1)}], structuredContent:r, isError:false }); }
   case 'resources/list': return ok({ resources:Object.entries(RES).map(([uri,[name,description]])=>({uri,name,description,mimeType:'text/markdown'})) });
   case 'resources/read': { const r=RES[params.uri]; if(!r) return err(-32602,'Unknown resource'); return ok({ contents:[{uri:params.uri,mimeType:'text/markdown',text:r[2]}] }); }
   case 'prompts/list': return ok({ prompts:Object.entries(PROMPTS).map(([name,p])=>({name,description:p.description,arguments:p.arguments})) });
   case 'prompts/get': { const p=PROMPTS[params.name]; if(!p) return err(-32602,'Unknown prompt'); return ok({ description:p.description, messages:[{role:'user',content:{type:'text',text:p.text(params.arguments||{})}}] }); }
   default: return err(-32601,`Method not found: ${method}`);
  } }catch(e){ return method==='tools/call' ? ok({content:[{type:'text',text:`Error: ${e.message}`}],isError:true}) : err(e.code||-32603,e.message); } };
 const sid=()=>NEW_SESSION?{'mcp-session-id':NEW_SESSION}:{};
 if(Array.isArray(body)){ const r=(await Promise.all(body.map(one))).filter(Boolean); return r.length?json(r,200,sid()):new Response(null,{status:202,headers:CORS}); }
 const r=await one(body); return r?json(r,200,sid()):new Response(null,{status:202,headers:CORS});
}
function openapi(){ const paths={}; for(const [name,t] of Object.entries(TOOLS)){ paths[`/v1/${name}`]={get:{operationId:name,summary:t.description.split('. ')[0],description:t.description,parameters:Object.entries(t.inputSchema.properties).map(([k,s])=>({name:k,in:'query',required:(t.inputSchema.required||[]).includes(k),description:s.description||'',schema:{type:s.type,...(s.enum?{enum:s.enum}:{}),...(s.default!==undefined?{default:s.default}:{})}})),responses:{'200':{description:'Result',content:{'application/json':{schema:{type:'object'}}}},'429':{description:'Rate limited; see Retry-After'}}}}; }
 return {openapi:'3.1.0',info:{title:'AI Video Atlas API',version:VERSION,description:INSTRUCTIONS+' Guide: '+SITE+'/agents/',contact:{url:SITE+'/agents/'}},servers:[{url:'https://mcp.aivideoatlas.com'}],paths}; }
// One Durable Object per hashed IP (the hash is computed in memory; nothing is persisted). Fixed 60s window, 60 requests.
function v6prefix(a){ let [h,t]=a.split('::'); const H=h?h.split(':'):[], T=t!==undefined&&t?t.split(':'):[]; const full=t===undefined?H:[...H,...Array(8-H.length-T.length).fill('0'),...T]; return full.slice(0,3).map(x=>parseInt(x||'0',16).toString(16)).join(':')+'::/48'; }
export class RateLimiter { constructor(state){ this.state=state; this.t=0; this.n=0; } async fetch(req){
  const u=new URL(req.url);
  if(u.pathname==='/stats/add'){ const ev=await req.json(); const st=this.state.storage; const T=(await st.get('t'))||{sessions:0,tool_calls:0,mcp:0,rest:0,tools:{},clients:{}};
   for(const x of ev){ if(x.e==='init'){ T.sessions++; T.clients[x.client]=(T.clients[x.client]||0)+1; } else if(x.e==='tool'){ T.tool_calls++; T[x.ch==='rest'?'rest':'mcp']++; T.tools[x.tool]=(T.tools[x.tool]||0)+1; } }
   const cl=Object.entries(T.clients); if(cl.length>200) T.clients=Object.fromEntries(cl.sort((a,b)=>b[1]-a[1]).slice(0,100));
   await st.put('t',T); return new Response('ok'); }
  if(u.pathname==='/stats/get') return new Response(JSON.stringify((await this.state.storage.get('t'))||null),{headers:{'content-type':'application/json'}}); const now=Date.now(); if(now-this.t>60e3){ this.t=now; this.n=0; } this.n++; if(this.n>60) return new Response('limited',{status:429,headers:{'retry-after':String(Math.ceil((this.t+60e3-now)/1000))}}); return new Response('ok'); } }
async function statsDaily(env,days){ const out=[]; const now=Date.now(); for(let k=days-1;k>=0;k--){ const d=new Date(now-k*864e5).toISOString().slice(0,10); let t=null; try{ const r=await env.LIMITER.get(env.LIMITER.idFromName('stats:'+d)).fetch('https://st/stats/get'); t=await r.json(); }catch(e){} t=t||{sessions:0,tool_calls:0,mcp:0,rest:0,tools:{},clients:{}};
  out.push({date:d,sessions:t.sessions,tool_calls:t.tool_calls,mcp_calls:t.mcp,rest_calls:t.rest,tools:t.tools,top_clients:Object.entries(t.clients).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,sessions])=>({name,sessions}))}); }
 return out; }
export default { async fetch(req, env, ctx){ const res=await handle(req,env); const ev=EVENTS; EVENTS=[];
  if(ev.length&&env&&env.LIMITER){ const p=env.LIMITER.get(env.LIMITER.idFromName('stats:'+dayKey())).fetch('https://st/stats/add',{method:'POST',body:JSON.stringify(ev)}).catch(e=>console.log(JSON.stringify({ev:'stats_error',msg:String(e.message).slice(0,100)}))); if(ctx&&ctx.waitUntil) ctx.waitUntil(p); else await p; }
  return res; } };
async function handle(req, env){
 const url=new URL(req.url); if(req.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
 const rawIp=req.headers.get('cf-connecting-ip')||'0'; const ip=rawIp.includes(':')?v6prefix(rawIp):rawIp; /* IPv6 clients (and VPN/egress pools) rotate addresses, so limit per /48 */ let wait=limited(ip); if(!wait&&env&&env.LIMITER){ try{ const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('atlas:'+ip)))].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join(''); const r=await env.LIMITER.get(env.LIMITER.idFromName(h)).fetch('https://rl/hit'); if(r.status===429) wait=Number(r.headers.get('retry-after'))||60; }catch(e){ console.log(JSON.stringify({ev:'rl_error',msg:String(e.message).slice(0,100)})); } } if(wait) return json({error:'rate_limited',retry_after_seconds:wait},429,{'retry-after':String(wait)});
 const p=url.pathname.replace(/\/+$/,'')||'/';
 if(p==='/mcp'){ if(req.method==='POST') return mcp(req, req.headers.get('user-agent')?.slice(0,40)); return json({error:'Use POST (MCP streamable HTTP, JSON responses). SSE streams are not offered.'},405,{allow:'POST, OPTIONS'}); }
 if(p==='/openapi.json') return json(openapi());
 if(p==='/stats/daily'){ const days=Math.max(1,Math.min(31,Number(url.searchParams.get('days'))||7)); if(!env||!env.LIMITER) return json({error:'stats unavailable'},503); return json({note:'Aggregate anonymous counts per UTC day: MCP initialize events (sessions), tool calls by tool, MCP vs REST, top client names. No IPs, no query text.',days:await statsDaily(env,days)}); }
 if(p==='/guide'||p==='/guide.md') return new Response(GUIDE,{headers:{'content-type':'text/markdown; charset=utf-8',...CORS}});
 if(p==='/examples.md') return new Response(EXAMPLES,{headers:{'content-type':'text/markdown; charset=utf-8',...CORS}});
 if(p==='/.well-known/mcp.json'||p==='/') return json({name:'AI Video Atlas',description:INSTRUCTIONS,mcp:{url:'https://mcp.aivideoatlas.com/mcp',transport:'streamable-http',auth:'none'},openapi:'https://mcp.aivideoatlas.com/openapi.json',guide:'https://mcp.aivideoatlas.com/guide.md',docs:SITE+'/agents/',tools:Object.keys(TOOLS),data_generated:DATA.generated});
 const m=p.match(/^\/v1\/([a-z_]+)$/); if(m&&TOOLS[m[1]]){ const t=TOOLS[m[1]], a={}; for(const [k,v] of url.searchParams){ const s=t.inputSchema.properties[k]; if(!s) continue; a[k]=s.type==='number'||s.type==='integer'?Number(v):s.type==='boolean'?v==='true':v; } const t0=Date.now(); try{ const r=t.run(a); log('rest',m[1],a,countOf(r),Date.now()-t0,null); return json(r);}catch(e){ return json({error:e.message},400);} }
 return json({error:'Not found',see:'/.well-known/mcp.json'},404);
}
