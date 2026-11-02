import {memoryStore} from './memory.mjs';
import {seedDemo} from './seed.mjs';
export async function loadDataset(db,owner,mode){
  let row=await db.prepare('SELECT version,data FROM radar_datasets WHERE owner=? AND mode=?').bind(owner,mode).first();
  if(!row){const initial=memoryStore();if(mode==='DEMO')seedDemo(initial);await db.prepare('INSERT OR IGNORE INTO radar_datasets(owner,mode,version,data,updated_at) VALUES(?,?,0,?,?)').bind(owner,mode,JSON.stringify(initial.data),new Date().toISOString()).run();row=await db.prepare('SELECT version,data FROM radar_datasets WHERE owner=? AND mode=?').bind(owner,mode).first();}
  if(!row)throw new Error('저장소 초기화에 실패했습니다. 다시 시도하세요.');
  return {store:memoryStore(JSON.parse(row.data)),version:row.version};
}
export async function saveDataset(db,owner,mode,store,version){
  const json=JSON.stringify(store.data);
  if(new TextEncoder().encode(json).length>1_800_000||store.data.records.length>5000)throw new Error('저장 한도에 도달했습니다. 내보내기 후 기록 보관 구성을 확장하세요.');
  const result=await db.prepare('UPDATE radar_datasets SET data=?,version=version+1,updated_at=? WHERE owner=? AND mode=? AND version=?').bind(json,new Date().toISOString(),owner,mode,version).run();
  if(result.meta.changes!==1){const e=new Error('다른 창에서 기록이 변경되었습니다. 새로고침 후 다시 저장하세요.');e.status=409;throw e;}
}
