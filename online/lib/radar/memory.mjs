import {analyze,payable,conditions} from './domain.mjs';
export function memoryStore(snapshot) {
  const data=structuredClone(snapshot||{products:[],records:[],watches:[],alerts:[],settings:{dropThreshold:25}});
  const product=id=>data.products.find(p=>p.id===id)||null;
  const records=id=>data.records.filter(r=>r.productId===id);
  const list=mode=>data.products.filter(p=>p.mode===mode).map(p=>analyze(p,records(p.id),Date.now(),data.settings.dropThreshold));
  return {data,product,records,list,settings:()=>data.settings,
    addProduct(input,mode){const old=data.products.find(p=>p.mode===mode&&p.brand===input.brand&&p.model===input.model&&p.sku===input.sku);if(old)return old;const p={...input,id:crypto.randomUUID(),mode,createdAt:new Date().toISOString()};data.products.push(p);return p;},
    addRecord(id,input){if(!product(id))throw new Error('상품을 찾을 수 없습니다.');const fingerprint=JSON.stringify([id,input]);const old=data.records.find(r=>r.fingerprint===fingerprint);if(old)return {...old,duplicate:true};const r={...input,id:crypto.randomUUID(),productId:id,recordedAt:new Date().toISOString(),method:product(id).mode==='DEMO'?'DEMO':'MANUAL',fingerprint};data.records.push(r);return r;},
    watch(id,condition,target,enabled=true){data.watches=data.watches.filter(w=>w.productId!==id||w.condition!==condition);data.watches.push({productId:id,condition,target,enabled});},
    watches(mode){return data.watches.filter(w=>product(w.productId)?.mode===mode).map(w=>({...w,product:product(w.productId)}));},
    alerts(mode){return data.alerts.filter(a=>a.mode===mode).slice().reverse().slice(0,200);},
    acknowledge(id,mode){const a=data.alerts.find(a=>a.id===id&&a.mode===mode);if(a)a.acknowledged=true;},
    setSettings(value){data.settings=value;},
    evaluate(mode){for(const p of list(mode)){
      if(!p.best)continue;const events=[];
      for(const w of data.watches.filter(w=>w.productId===p.id&&w.enabled)){
        const best=p.latest.filter(r=>!r.warnings.length&&r.kind!=='LAUNCH_MSRP'&&r.condition===w.condition).sort((a,b)=>a.payable-b.payable)[0];
        if(best&&best.payable<=w.target)events.push({type:'목표가 달성',r:best,message:`${conditions[w.condition]} ${best.payable.toLocaleString('ko-KR')}원 · 목표 ${w.target.toLocaleString('ko-KR')}원`});
      }
      if(p.drop?.percent>=data.settings.dropThreshold)events.push({type:p.classification,r:p.best,message:`동일 상태 30일 중앙값 대비 ${p.drop.percent}% 하락 · 검증 필요`});
      for(const e of events){const day=new Date(Date.parse(e.r.observedAt)+9*3600000).toISOString().slice(0,10),dedupe=JSON.stringify([mode,p.id,e.r.source,e.r.condition,e.type,day,payable(e.r)]);if(data.alerts.some(a=>a.dedupe===dedupe))continue;data.alerts.push({id:crypto.randomUUID(),dedupe,productId:p.id,name:p.name,type:e.type,message:e.message,mode,at:new Date().toISOString(),status:'앱 내부 기록',acknowledged:false});}
    }},
    export(mode){return {version:1,exportedAt:new Date().toISOString(),mode,products:data.products.filter(p=>p.mode===mode).map(p=>({...p,records:records(p.id).map(({fingerprint,...r})=>r)})),watches:this.watches(mode),alerts:this.alerts(mode)};},
  };
}
