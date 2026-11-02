import {validateProduct,validateRecord} from './domain.mjs';
export const csvHeader='product_name,brand,model_number,sku_key,condition,source_code,source_url,base_price_krw,shipping_krw,discount_krw,observed_at_kst,availability,verification_note';
export function parseCSV(input) {
  if(typeof input!=='string'||input.length>1_000_000)throw new Error('CSV는 1MB 이하 텍스트여야 합니다.');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<input.length;i++) {const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
  if(quoted)throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift()?.map(x=>x.replace(/^\uFEFF/,'').trim());
  if(!header||csvHeader.split(',').some(h=>!header.includes(h)))throw new Error('CSV 필수 열이 누락되었습니다. 샘플 양식을 확인하세요.');
  if(rows.length>1000)throw new Error('한 번에 1,000행까지 등록할 수 있습니다.');
  return rows.filter(r=>r.some(Boolean)).map((r,index)=>({line:index+2,data:Object.fromEntries(header.map((h,i)=>[h,r[i]??'']))}));
}
export function importCSV(store,input) {
  const rows=parseCSV(input),result={inserted:0,duplicates:0,errors:[]};
  for(const {line,data:d} of rows)try {
    const p=validateProduct({name:d.product_name,brand:d.brand,model:d.model_number,sku:d.sku_key,category:'기타'});
    const timestamp=/([zZ]|[+-]\d\d:\d\d)$/.test(d.observed_at_kst)?d.observed_at_kst:d.observed_at_kst.replace(' ','T')+'+09:00';
    const r=validateRecord({kind:'OTHER',condition:d.condition,base:Number(d.base_price_krw),shipping:d.shipping_krw===''?null:Number(d.shipping_krw),discount:Number(d.discount_krw||0),observedAt:timestamp,stock:d.availability,url:d.source_url,source:d.source_code,note:d.verification_note,matched:false,verified:false});
    const product=store.addProduct(p,'MANUAL');const record=store.addRecord(product.id,r);result[record.duplicate?'duplicates':'inserted']++;
  }catch(e){result.errors.push({line,message:e.message});}
  return result;
}
