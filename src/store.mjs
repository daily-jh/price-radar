import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {analyze,payable,conditions} from './domain.mjs';

export function createStore(path=':memory:') {
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,mode TEXT NOT NULL,identity TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(mode,identity));
    CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),fingerprint TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS watches(product_id TEXT NOT NULL REFERENCES products(id),condition TEXT NOT NULL,target INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(product_id,condition));
    CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),dedupe TEXT UNIQUE NOT NULL,data TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,at TEXT NOT NULL);
    PRAGMA user_version=1;`);
  const settings=()=>JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('preferences')?.value||'{"dropThreshold":25}');
  const records=id=>db.prepare('SELECT data FROM observations WHERE product_id=?').all(id).map(r=>JSON.parse(r.data));
  const product=id=>{const row=db.prepare('SELECT data FROM products WHERE id=?').get(id);return row?JSON.parse(row.data):null;};
  const list=mode=>db.prepare('SELECT data FROM products WHERE mode=? ORDER BY rowid DESC').all(mode).map(r=>{const p=JSON.parse(r.data);return analyze(p,records(p.id),Date.now(),settings().dropThreshold);});
  const audit=action=>db.prepare('INSERT INTO audit VALUES(?,?,?)').run(randomUUID(),action,new Date().toISOString());
  function addProduct(data,mode) {
    const p={...data,id:randomUUID(),mode,createdAt:new Date().toISOString()};
    const identity=JSON.stringify([p.brand,p.model,p.sku]);
    const existing=db.prepare('SELECT id FROM products WHERE mode=? AND identity=?').get(mode,identity);
    if(existing)return product(existing.id);
    db.prepare('INSERT INTO products VALUES(?,?,?,?)').run(p.id,mode,identity,JSON.stringify(p));audit('product.create');return p;
  }
  function addRecord(id,data) {
    if(!product(id))throw new Error('상품을 찾을 수 없습니다.');
    const fingerprint=createHash('sha256').update(JSON.stringify([id,data])).digest('hex');
    const old=db.prepare('SELECT data FROM observations WHERE fingerprint=?').get(fingerprint);if(old)return {...JSON.parse(old.data),duplicate:true};
    const r={...data,id:randomUUID(),productId:id,recordedAt:new Date().toISOString(),method:product(id).mode==='DEMO'?'DEMO':'MANUAL'};
    db.prepare('INSERT INTO observations VALUES(?,?,?,?)').run(r.id,id,fingerprint,JSON.stringify(r));audit('observation.create');return r;
  }
  function evaluate(mode) {
    for(const p of list(mode)) {
      if(!p.best)continue;
      const rules=db.prepare('SELECT * FROM watches WHERE product_id=? AND enabled=1').all(p.id);
      const events=[];
      for(const w of rules) {
        const best=p.latest.filter(r=>!r.warnings.length&&r.kind!=='LAUNCH_MSRP'&&r.condition===w.condition).sort((a,b)=>a.payable-b.payable)[0];
        if(best&&best.payable<=w.target)events.push({type:'목표가 달성',r:best,message:`${conditions[w.condition]} ${best.payable.toLocaleString('ko-KR')}원 · 목표 ${w.target.toLocaleString('ko-KR')}원`});
      }
      if(p.drop?.percent>=settings().dropThreshold)events.push({type:p.classification,r:p.best,message:`동일 상태 30일 중앙값 대비 ${p.drop.percent}% 하락 · 검증 필요`});
      for(const e of events) {
        const day=new Date(Date.parse(e.r.observedAt)+9*3600000).toISOString().slice(0,10);
        const dedupe=JSON.stringify([mode,p.id,e.r.source,e.r.condition,e.type,day,payable(e.r)]);
        const a={id:randomUUID(),productId:p.id,name:p.name,type:e.type,message:e.message,mode,at:new Date().toISOString(),status:'앱 내부 기록'};
        db.prepare('INSERT OR IGNORE INTO alerts VALUES(?,?,?,?,0)').run(a.id,p.id,dedupe,JSON.stringify(a));
      }
    }
  }
  return {db,records,product,list,addProduct,addRecord,evaluate,settings,audit,
    setSettings(value){db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('preferences',JSON.stringify(value));},
    watches(mode){return db.prepare('SELECT w.*,p.data FROM watches w JOIN products p ON p.id=w.product_id WHERE p.mode=?').all(mode).map(w=>({productId:w.product_id,condition:w.condition,target:w.target,enabled:!!w.enabled,product:JSON.parse(w.data)}));},
    watch(id,condition,target,enabled=true){db.prepare('INSERT OR REPLACE INTO watches VALUES(?,?,?,?)').run(id,condition,target,enabled?1:0);audit('watch.save');},
    alerts(mode){return db.prepare('SELECT a.data,a.acknowledged FROM alerts a JOIN products p ON p.id=a.product_id WHERE p.mode=? ORDER BY a.rowid DESC LIMIT 200').all(mode).map(a=>({...JSON.parse(a.data),acknowledged:!!a.acknowledged}));},
    acknowledge(id,mode){db.prepare('UPDATE alerts SET acknowledged=1 WHERE id=? AND product_id IN (SELECT id FROM products WHERE mode=?)').run(id,mode);},
    export(mode){return {version:1,exportedAt:new Date().toISOString(),mode,products:list(mode).map(({id})=>({...product(id),records:records(id)})),watches:this.watches(mode),alerts:this.alerts(mode)};}
  };
}
export function seedDemo(store,now=Date.now()) {
  if(store.list('DEMO').length)return;
  const products=[['오디오랩','노이즈 캔슬링 헤드폰 H7','H7','블랙 / 국내 정품','디지털',599000,379000,329000,299000],['픽셀웍스','27인치 QHD 모니터','Q27','27인치 / 화이트','디지털',459000,319000,289000,189000],['홈브루','전자동 커피머신 C3','C3','실버 / 기본 구성','생활가전',899000,639000,579000,429000],['클린홈','무선 청소기 V8','V8','그레이 / 배터리 1개','생활가전',499000,329000,299000,219000],['모션','스마트워치 S2','S2','44mm / 블랙','디지털',299000,219000,199000,169000],['리드온','전자책 리더 R6','R6','32GB / 화이트','디지털',249000,209000,null,179000]];
  products.forEach((x,i)=>{
    const [brand,name,model,sku,category,launch,naver,hot,current]=x,p=store.addProduct({name,brand,model,sku,category},'DEMO');
    const baseRecord={shipping:0,discount:0,discountConfirmed:false,conditional:false,eligible:false,matched:true,verified:true,stock:'IN_STOCK',url:null,note:'시연용 가상 가격 · 실제 판매 정보가 아닙니다.',currency:'KRW',expiresAt:null};
    const add=(kind,condition,base,time,extra={})=>store.addRecord(p.id,{...baseRecord,kind,condition,base,source:kind==='COUPANG'?'쿠팡 (가상)':kind==='NAVER_LOWEST'?'네이버 (가상)':kind==='LAUNCH_MSRP'?'제조사 (가상)':'핫딜 (가상)',observedAt:new Date(time).toISOString(),...extra});
    for(let day=30;day>=1;day--)for(const [condition,mult] of [['NEW',1.18],['OPEN_BOX',1],['RETURN_LIKE_NEW',.93]])add('COUPANG',condition,Math.round((current*(i===1?1.9:1.37)+((day%5)-2)*3000)*mult/1000)*1000,now-day*86400000);
    add('LAUNCH_MSRP','NEW',launch,now-1000);add('NAVER_LOWEST','NEW',naver,now-1000);
    if(hot)add('HOT_DEAL_CURRENT','NEW',hot,now-1000,{expiresAt:new Date(now+86400000).toISOString()});
    add('COUPANG','NEW',naver+10000,now-1000);add('COUPANG','OPEN_BOX',current,now-1000);
    add('COUPANG','RETURN_LIKE_NEW',current-20000,now-1000,{stock:i===0?'OUT_OF_STOCK':'IN_STOCK'});
    add('COUPANG','RETURN_GOOD',current-35000,now-1000,{stock:'UNKNOWN'});
    add('COUPANG','RETURN_FAIR',current-45000,now-1000,{shipping:null,stock:'UNKNOWN'});
    if(i<2)store.watch(p.id,'OPEN_BOX',current+5000);
  });store.evaluate('DEMO');
}
