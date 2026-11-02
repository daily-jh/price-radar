export const conditions = {NEW:'새상품',OPEN_BOX:'미개봉',RETURN_LIKE_NEW:'반품 최상',RETURN_GOOD:'반품 상',RETURN_FAIR:'반품 중',UNKNOWN:'상태 미확인'};
export const kinds = {LAUNCH_MSRP:'공식 출시가',NAVER_LOWEST:'네이버 최저가',HOT_DEAL_CURRENT:'현재 핫딜가',COUPANG:'쿠팡 판매가',OTHER:'기타 판매가'};
export const MAX_MONEY = 1_000_000_000;
export function money(v, nullable=false) {
  if (nullable && (v === null || v === undefined || v === '')) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > MAX_MONEY) throw new Error('금액은 0~10억 원 사이의 정수여야 합니다.');
  return v;
}
export function safeURL(value) {
  if (!value) return null;
  let u; try {u=new URL(value);} catch {throw new Error('올바른 출처 URL을 입력하세요.');}
  const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') || !h.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(h) || /^[\d.]+$/.test(h) || h.includes(':') || h.endsWith('.local') || h.endsWith('.localhost')) throw new Error('출처는 공개 도메인의 HTTPS 주소만 등록할 수 있습니다.');
  u.hash=''; return u.href;
}
export function text(v, label, max=200) {
  if(typeof v!=='string'||!v.trim()||v.length>max) throw new Error(`${label}: 1~${max}자로 입력하세요.`);
  return v.trim();
}
export function validateProduct(input) {
  return {name:text(input.name,'상품명'),brand:text(input.brand,'제조사',80),model:text(input.model,'모델번호',100),sku:text(input.sku,'옵션/SKU',200),category:text(input.category||'기타','카테고리',60)};
}
export function validateRecord(input, now=Date.now()) {
  const base=money(input.base); if(!base) throw new Error('판매가는 0원보다 커야 합니다.');
  const shipping=money(input.shipping,true), discount=money(input.discount??0);
  if(discount>base) throw new Error('할인액이 판매가를 초과합니다.');
  if(!conditions[input.condition]||!kinds[input.kind]) throw new Error('가격 종류와 상품 상태를 확인하세요.');
  if(!['IN_STOCK','OUT_OF_STOCK','UNKNOWN','ENDED'].includes(input.stock)) throw new Error('재고 상태를 확인하세요.');
  const observed=Date.parse(input.observedAt);
  if(!Number.isFinite(observed)||observed>now+60_000) throw new Error('관측 시각이 올바르지 않거나 미래입니다.');
  const expires=input.expiresAt?Date.parse(input.expiresAt):null;
  if(expires!==null&&!Number.isFinite(expires)) throw new Error('종료 시각을 확인하세요.');
  if(input.kind==='HOT_DEAL_CURRENT' && expires===null) throw new Error('핫딜 종료 시각이 필요합니다.');
  return {kind:input.kind,condition:input.condition,base,shipping,discount,discountConfirmed:input.discountConfirmed===true,conditional:input.conditional===true,eligible:input.eligible===true,matched:input.matched===true,verified:input.verified===true,stock:input.stock,observedAt:new Date(observed).toISOString(),expiresAt:expires===null?null:new Date(expires).toISOString(),url:safeURL(input.url),source:text(input.source,'출처',100),note:String(input.note||'').slice(0,1000),currency:'KRW'};
}
export function payable(r) {return r.shipping===null?null:r.base+r.shipping-(r.discountConfirmed?r.discount:0);}
export const saving=(reference,price)=>reference>0 && price!==null?{amount:reference-price,percent:Math.round((reference-price)/reference*1000)/10}:null;
export const median=xs=>{if(!xs.length)return null; const a=[...xs].sort((a,b)=>a-b), i=Math.floor(a.length/2); return a.length%2?a[i]:Math.round((a[i-1]+a[i])/2);};
export function reasons(r,now=Date.now()) {
  const out=[];
  if(now-Date.parse(r.observedAt)>86400000)out.push('오래된 가격');
  if(r.expiresAt&&Date.parse(r.expiresAt)<=now)out.push('기간 종료');
  if(r.stock!=='IN_STOCK')out.push(r.stock==='OUT_OF_STOCK'?'품절':'재고 미확인 또는 종료');
  if(r.shipping===null)out.push('배송비 미확인');
  if(!r.matched)out.push('옵션 일치 미확인');
  if(!r.verified)out.push('검증 필요');
  if(r.conditional&&!r.eligible)out.push('회원·카드 적용 미확인');
  return out;
}
export function dailyHistory(records,condition,days=30,now=Date.now()) {
  const groups=new Map(),seen=new Set();
  for(const r of records) {
    if(r.condition!==condition || ['LAUNCH_MSRP','NAVER_LOWEST'].includes(r.kind) || !r.matched || !r.verified || r.stock!=='IN_STOCK' || r.shipping===null || (r.conditional&&!r.eligible) || (r.expiresAt&&Date.parse(r.expiresAt)<=Date.parse(r.observedAt)))continue;
    const time=Date.parse(r.observedAt); if(time<now-days*86400000||time>=now)continue;
    const key=`${r.source}|${r.kind}|${r.observedAt}|${payable(r)}`; if(seen.has(key))continue;seen.add(key);
    const date=new Date(time+9*3600000).toISOString().slice(0,10);
    if(!groups.has(date))groups.set(date,[]);groups.get(date).push(payable(r));
  }
  return [...groups].map(([date,values])=>({date,price:median(values)})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function latestRecords(records) {
  const map=new Map();
  for(const r of records) {const key=JSON.stringify([r.kind,r.condition,r.source,r.url,r.conditional]);if(!map.has(key)||Date.parse(r.observedAt)>Date.parse(map.get(key).observedAt))map.set(key,r);}
  return [...map.values()];
}
export function analyze(product,records,now=Date.now(),threshold=25) {
  const latest=latestRecords(records), current=latest.filter(r=>r.kind!=='LAUNCH_MSRP'&&!reasons(r,now).length);
  const best=[...current].sort((a,b)=>payable(a)-payable(b))[0]||null;
  const references={};
  for(const kind of ['LAUNCH_MSRP','NAVER_LOWEST','HOT_DEAL_CURRENT']) {
    const candidates=latest.filter(r=>r.kind===kind&&(kind==='LAUNCH_MSRP'?r.verified&&r.matched:!reasons(r,now).length));
    references[kind]=candidates.sort((a,b)=>(kind==='LAUNCH_MSRP'?Date.parse(b.observedAt)-Date.parse(a.observedAt):payable(a)-payable(b)))[0]||null;
  }
  const history=best?dailyHistory(records,best.condition,30,Date.parse(best.observedAt)):[];
  const baseline=history.length>=5?median(history.map(x=>x.price)):null;
  const price=best?payable(best):null, drop=saving(baseline,price);
  let classification='이력 부족';
  if(baseline)classification=drop.percent>=60?'오류가격 의심':drop.percent>=40?'강력 특가':drop.percent>=threshold?'특가':drop.percent>=15?'관찰':'일반 관측';
  const newPrice=current.filter(r=>r.condition==='NEW').sort((a,b)=>payable(a)-payable(b))[0];
  const historical=best?records.filter(r=>r.condition===best.condition&&r.kind!=='LAUNCH_MSRP'&&r.matched&&r.verified&&r.stock==='IN_STOCK'&&r.shipping!==null&&(!r.conditional||r.eligible)&&Date.parse(r.observedAt)<=now):[];
  const others=best?current.filter(r=>r.id!==best.id&&r.condition===best.condition):[];
  return {...product,best,price,references,median30:baseline,historyDays:history.length,drop,classification,returnGap:best&&best.condition!=='NEW'&&newPrice?saving(payable(newPrice),price):null,marketSaving:others.length?saving(Math.min(...others.map(payable)),price):null,marketCount:others.length,observedLow:historical.length?Math.min(...historical.map(payable)):null,recordingSince:historical.length?historical.map(r=>r.observedAt).sort()[0]:null,latest:latest.map(r=>({...r,payable:payable(r),warnings:reasons(r,now)})),confidence:best?(product.mode==='DEMO'?'LOW':baseline?'MEDIUM':'LOW'):'UNAVAILABLE'};
}
