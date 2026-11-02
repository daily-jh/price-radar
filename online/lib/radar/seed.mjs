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
