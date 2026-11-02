import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.mjs';
test('T20: backup restore retains products, observations, rules and alerts',()=>{
  const dir=mkdtempSync(join(tmpdir(),'price-radar-test-'));
  try {
    const store=createStore(join(dir,'original.sqlite'));
    const p=store.addProduct({name:'Backup test',brand:'Test',model:'M',sku:'1',category:'기타'},'MANUAL');
    store.addRecord(p.id,{kind:'OTHER',condition:'NEW',base:100,shipping:0,discount:0,discountConfirmed:false,conditional:false,eligible:false,matched:true,verified:true,stock:'IN_STOCK',observedAt:new Date(Date.now()-1000).toISOString(),expiresAt:null,source:'test',url:null});
    store.watch(p.id,'NEW',110);store.evaluate('MANUAL');store.db.prepare('VACUUM INTO ?').run(join(dir,'backup.sqlite'));store.db.close();
    const restored=createStore(join(dir,'backup.sqlite'));assert.equal(restored.list('MANUAL')[0].price,100);assert.equal(restored.watches('MANUAL').length,1);assert.equal(restored.alerts('MANUAL').length,1);restored.evaluate('MANUAL');assert.equal(restored.alerts('MANUAL').length,1);restored.db.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
