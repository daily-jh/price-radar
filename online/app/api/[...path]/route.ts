import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import {validateProduct,validateRecord,conditions,money,dailyHistory,analyze} from '../../../lib/radar/domain.mjs';
import {importCSV,csvHeader} from '../../../lib/radar/csv.mjs';
import {loadDataset,saveDataset} from '../../../lib/radar/persistence.mjs';
export const dynamic='force-dynamic';
const sources=[{name:'수동 입력',status:'온라인 저장 사용 가능',method:'MANUAL'},{name:'시연 데이터',status:'가상 데이터',method:'DEMO'},{name:'쿠팡 가격 자동 수집',status:'미연동 · 사용권 미확보'},{name:'네이버 가격 자동 수집',status:'미연동 · 사용권 미확보'},{name:'핫딜 피드',status:'미연동 · 사용권 미확보'},{name:'텔레그램 / 이메일',status:'미연동 · 앱 내부 알림만 사용'}];
function reply(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function handle(request:Request){
  const user=await getChatGPTUser(),url=new URL(request.url),mode=url.searchParams.get('mode')||'DEMO',path=url.pathname.replace(/^\/api(?:\/v1)?/,'');
  if(path==='/session')return reply({data:{authenticated:!!user,online:true,localDemo:false,csrf:'same-origin'}});
  if(!user)return reply({error:'로그인이 필요합니다.'},401);
  if(!['DEMO','MANUAL'].includes(mode))return reply({error:'지원하지 않는 데이터 모드입니다.'},400);
  const ok=(data:unknown)=>reply({data,meta:{as_of:new Date().toISOString(),data_mode:mode,source_status:'자동 수집 미연동'},warnings:[],errors:[]});
  try{
    if(request.method==='POST'){
      if(request.headers.get('origin')!==url.origin)return reply({error:'요청 출처가 일치하지 않습니다.'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json')||request.headers.get('x-csrf-token')!=='same-origin')return reply({error:'요청 형식을 확인하세요.'},403);
    }
    if(path==='/sources'&&request.method==='GET')return ok(sources);
    if(!env.DB)throw new Error('온라인 저장소에 연결하지 못했습니다.');
    const {store,version}=await loadDataset(env.DB,user.userId,mode);
    const selected=(id:string)=>{const p=store.product(id);if(!p||p.mode!==mode)throw new Error('현재 모드의 상품을 찾을 수 없습니다.');return p;};
    if(request.method==='GET'){
      if(['/products','/deals','/returns'].includes(path)){let all=store.list(mode);if(path==='/deals')all=all.filter((p:any)=>p.drop?.percent>=store.settings().dropThreshold);if(path==='/returns')all=all.filter((p:any)=>p.latest.some((r:any)=>!['NEW','UNKNOWN'].includes(r.condition)&&!r.warnings.length));return ok(all);}
      const match=path.match(/^\/products\/([^/]+)(?:\/(comparison|history))?$/);
      if(match){const p=selected(match[1]);if(match[2]==='history'){const days=Number(url.searchParams.get('days')||30),condition=url.searchParams.get('condition')||'NEW';if(![7,30,90].includes(days)||!Object.hasOwn(conditions,condition))throw new Error('이력 필터를 확인하세요.');return ok(dailyHistory(store.records(p.id),condition,days));}return ok({...analyze(p,store.records(p.id),Date.now(),store.settings().dropThreshold),records:store.records(p.id).map(({fingerprint,...r}:any)=>r)});}
      if(path==='/watch-rules')return ok(store.watches(mode));
      if(path==='/alerts')return ok(store.alerts(mode));
      if(path==='/settings')return ok(store.settings());
      if(path==='/export')return ok(store.export(mode));
      if(path==='/csv-template')return ok(csvHeader+'\n');
    }
    if(request.method==='POST'){
      if(Number(request.headers.get('content-length')||0)>1_100_000)return reply({error:'입력 파일이 너무 큽니다.'},413);
      const raw=await request.text();if(new TextEncoder().encode(raw).length>1_100_000)return reply({error:'입력 파일이 너무 큽니다.'},413);
      const b=JSON.parse(raw);let result:unknown;
      if(path==='/products')result=store.addProduct(validateProduct(b),mode);
      else if(path==='/manual-observations'){selected(b.productId);result=store.addRecord(b.productId,validateRecord(b));}
      else if(path==='/watch-rules'){selected(b.productId);if(!Object.hasOwn(conditions,b.condition))throw new Error('상태를 확인하세요.');const target=money(b.target);if(!target)throw new Error('목표가를 입력하세요.');store.watch(b.productId,b.condition,target,b.enabled!==false);result={};}
      else if(path==='/alerts/ack'){store.acknowledge(String(b.id),mode);result={};}
      else if(path==='/settings'){if(!Number.isInteger(b.dropThreshold)||b.dropThreshold<15||b.dropThreshold>60)throw new Error('급락 기준은 15~60% 정수로 입력하세요.');store.setSettings({dropThreshold:b.dropThreshold});result=store.settings();}
      else if(path==='/imports/manual'){if(mode!=='MANUAL')throw new Error('CSV는 수동 운영 모드에서 등록합니다.');result=importCSV(store,b.csv);}
      else return reply({error:'요청한 기능을 찾을 수 없습니다.'},404);
      store.evaluate(mode);await saveDataset(env.DB,user.userId,mode,store,version);return ok(result);
    }
    return reply({error:'요청한 기능을 찾을 수 없습니다.'},404);
  }catch(error){const e=error as Error&{status?:number};console.error('radar_request_failed',e.name);return reply({error:e.message},e.status||400);}
}
export const GET=handle;
export const POST=handle;
