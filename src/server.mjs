import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {createStore,seedDemo} from './store.mjs';
import {validateProduct,validateRecord,conditions,money,dailyHistory,analyze} from './domain.mjs';
import {importCSV,csvHeader} from './csv.mjs';

export function createApp(options={}) {
  const localDemo=options.localDemo??process.env.LOCAL_DEMO==='true';
  const passwordHash=options.passwordHash??process.env.PASSWORD_HASH;
  if(!localDemo&&!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash||''))throw new Error('먼저 node src/password.mjs로 PASSWORD_HASH를 설정하세요.');
  const store=options.store||createStore(process.env.DATABASE_PATH||'data/radar.sqlite');seedDemo(store);
  const origin=options.origin||process.env.APP_ORIGIN||'http://127.0.0.1:3080';
  const secure=options.secure??process.env.COOKIE_SECURE==='true';
  if(!localDemo&&!new URL(origin).hostname.match(/^(127\.0\.0\.1|localhost)$/)&&(!secure||!origin.startsWith('https://')))throw new Error('외부 배포는 HTTPS와 COOKIE_SECURE=true가 필요합니다.');
  const sessions=new Map(),attempts=new Map();
  const sources=[{name:'수동 입력',status:'사용 가능',method:'MANUAL'},{name:'시연 데이터',status:'가상 데이터',method:'DEMO'},{name:'쿠팡 가격 자동 수집',status:'미연동 · 사용권 미확보'},{name:'네이버 가격 자동 수집',status:'미연동 · 사용권 미확보'},{name:'핫딜 피드',status:'미연동 · 사용권 미확보'},{name:'텔레그램 / 이메일',status:'미연동 · 앱 내부 알림만 사용'}];
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    function send(status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
    function ok(data,mode='DEMO'){send(200,{data,meta:{as_of:new Date().toISOString(),data_mode:mode,source_status:'자동 수집 미연동'},warnings:localDemo?['로컬 데모 · 실제 데이터 입력 불가']:[],errors:[]});}
    async function body(){let size=0,parts=[];for await(const c of req){size+=c.length;if(size>1_100_000)throw new Error('요청이 너무 큽니다.');parts.push(c);}try{return JSON.parse(Buffer.concat(parts).toString()||'{}');}catch{throw new Error('JSON 형식을 확인하세요.');}}
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('radar_session='))?.slice(14);
    let session=sessions.get(token);
    if(session&&session.expires<Date.now()){sessions.delete(token);session=null;}
    const loggedIn=localDemo||!!session;
    try {
      if(req.method==='GET'&&url.pathname==='/healthz')return ok({status:'ok'});
      if(req.method==='GET'&&url.pathname==='/api/session')return ok({authenticated:loggedIn,localDemo,csrf:session?.csrf||'local-preview'});
      if(!['GET','HEAD'].includes(req.method)) {
        if(req.headers.origin!==origin)return send(403,{error:'요청 출처가 일치하지 않습니다.'});
        if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON 요청만 허용합니다.'});
      }
      if(req.method==='POST'&&url.pathname==='/api/login') {
        if(localDemo)return ok({authenticated:true,csrf:'local-preview'});
        const key=req.socket.remoteAddress, now=Date.now(), rate=attempts.get(key)||{count:0,until:now+900000};
        if(rate.until<now){rate.count=0;rate.until=now+900000;}
        if(rate.count>=5)return send(429,{error:'로그인 시도가 많습니다. 15분 후 다시 시도하세요.'});
        const {password}=await body();rate.count++;attempts.set(key,rate);
        const [salt,hash]=passwordHash.split(':');
        if(typeof password!=='string'||password.length>1024||!timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex')))return send(401,{error:'비밀번호가 일치하지 않습니다.'});
        attempts.delete(key);if(token)sessions.delete(token);
        const id=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(id,{csrf,expires:now+8*3600000});
        res.setHeader('Set-Cookie',`radar_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`);return ok({authenticated:true,csrf});
      }
      if(url.pathname.startsWith('/api/')) {
        if(!loggedIn)return send(401,{error:'로그인이 필요합니다.'});
        if(req.method!=='GET'&&req.headers['x-csrf-token']!==(session?.csrf||'local-preview'))return send(403,{error:'세션을 새로고침하세요.'});
        if(req.method==='POST'&&url.pathname==='/api/logout'){sessions.delete(token);res.setHeader('Set-Cookie','radar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');return ok({});}
        const mode=url.searchParams.get('mode')||'DEMO';if(!['DEMO','MANUAL'].includes(mode))return send(400,{error:'지원하지 않는 모드입니다.'});
        if(localDemo&&mode!=='DEMO')return send(403,{error:'로컬 미리보기에서는 가상 데이터만 사용할 수 있습니다.'});
        const path=url.pathname.replace('/api/v1','');
        const selected=id=>{const p=store.product(id);if(!p||p.mode!==mode)throw new Error('현재 모드의 상품을 찾을 수 없습니다.');return p;};
        if(req.method==='GET') {
          if(path==='/products'||path==='/deals'||path==='/returns') {let all=store.list(mode);if(path==='/deals')all=all.filter(p=>p.drop?.percent>=store.settings().dropThreshold);if(path==='/returns')all=all.filter(p=>p.latest.some(r=>r.condition!=='NEW'&&r.condition!=='UNKNOWN'&&!r.warnings.length));return ok(all,mode);}
          const match=path.match(/^\/products\/([^/]+)(?:\/(comparison|history))?$/);
          if(match){const p=selected(match[1]);if(match[2]==='history'){const days=Number(url.searchParams.get('days')||30),condition=url.searchParams.get('condition')||'NEW';if(![7,30,90].includes(days)||!conditions[condition])throw new Error('이력 필터를 확인하세요.');return ok(dailyHistory(store.records(p.id),condition,days),mode);}return ok({...analyze(p,store.records(p.id),Date.now(),store.settings().dropThreshold),records:store.records(p.id)},mode);}
          if(path==='/sources')return ok(sources,mode);
          if(path==='/watch-rules')return ok(store.watches(mode),mode);
          if(path==='/alerts'){store.evaluate(mode);return ok(store.alerts(mode),mode);}
          if(path==='/settings')return ok(store.settings(),mode);
          if(path==='/export')return ok(store.export(mode),mode);
          if(path==='/csv-template')return ok(csvHeader+'\n',mode);
        }
        if(req.method==='POST') {
          const b=await body();
          if(path==='/products')return ok(store.addProduct(validateProduct(b),mode),mode);
          if(path==='/manual-observations'){selected(b.productId);const r=store.addRecord(b.productId,validateRecord(b));store.evaluate(mode);return ok(r,mode);}
          if(path==='/watch-rules'){selected(b.productId);if(!conditions[b.condition])throw new Error('상태를 확인하세요.');const target=money(b.target);if(!target)throw new Error('목표가를 입력하세요.');store.watch(b.productId,b.condition,target,b.enabled!==false);store.evaluate(mode);return ok({},mode);}
          if(path==='/alerts/ack'){store.acknowledge(String(b.id),mode);return ok({},mode);}
          if(path==='/settings'){if(!Number.isInteger(b.dropThreshold)||b.dropThreshold<15||b.dropThreshold>60)throw new Error('급락 기준은 15~60% 정수로 입력하세요.');store.setSettings({dropThreshold:b.dropThreshold});return ok(store.settings(),mode);}
          if(path==='/imports/manual'){if(mode!=='MANUAL')throw new Error('CSV는 수동 운영 모드에서만 등록합니다.');return ok(importCSV(store,b.csv),mode);}
        }
        return send(404,{error:'요청한 기능을 찾을 수 없습니다.'});
      }
      if(!['GET','HEAD'].includes(req.method))return send(405,{error:'허용하지 않는 요청입니다.'});
      const assets={'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml']};
      const asset=assets[url.pathname]||['index.html','text/html'];
      const bytes=await readFile(fileURLToPath(new URL('../public/'+asset[0],import.meta.url)));res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(e){send(400,{error:e.message});}
  });
  const interval=setInterval(()=>{store.evaluate('MANUAL');for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);for(const [ip,a]of attempts)if(a.until<Date.now())attempts.delete(ip);},60000);interval.unref();
  server.on('close',()=>clearInterval(interval));return {server,store};
}
if(process.argv[1]===fileURLToPath(import.meta.url)||process.argv[1]?.endsWith('preview.mjs')) {
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3080);
  if(process.env.LOCAL_DEMO==='true'&&host!=='127.0.0.1')throw new Error('데모 미리보기는 로컬 주소에만 실행할 수 있습니다.');
  const {server}=createApp();server.listen(port,host,()=>console.log(`PRICE RADAR: http://${host}:${port}`));
}
