import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync,randomBytes} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {createStore} from '../src/store.mjs';
test('authenticated API, CSRF, data persistence and logout integration',async()=>{
  const password=randomBytes(24).toString('hex'),salt=randomBytes(16).toString('hex'),origin='http://127.0.0.1:3099';
  const {server,store}=createApp({store:createStore(),origin,passwordHash:salt+':'+scryptSync(password,salt,64).toString('hex')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/api/v1/products')).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).data.csrf;
    assert.match(login.headers.get('set-cookie'),/HttpOnly/);
    const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf};
    assert.equal((await fetch(base+'/api/v1/products?mode=MANUAL',{headers})).status,200);
    const payload={name:'Monitor',brand:'Example',model:'M1',sku:'27 white',category:'기타'};
    assert.equal((await fetch(base+'/api/v1/products?mode=MANUAL',{method:'POST',headers:{...headers,'X-CSRF-Token':'wrong'},body:JSON.stringify(payload)})).status,403);
    assert.equal((await fetch(base+'/api/v1/products?mode=MANUAL',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:JSON.stringify(payload)})).status,403);
    const saved=await fetch(base+'/api/v1/products?mode=MANUAL',{method:'POST',headers,body:JSON.stringify(payload)});assert.equal(saved.status,200);const id=(await saved.json()).data.id;
    assert.equal((await fetch(base+`/api/v1/products/${id}?mode=DEMO`,{headers})).status,400);
    const manual=await fetch(base+'/api/v1/products?mode=MANUAL',{headers});assert.equal((await manual.json()).data.length,1);
    await fetch(base+'/api/logout',{method:'POST',headers,body:'{}'});assert.equal((await fetch(base+'/api/v1/products',{headers})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));store.db.close();}
});
test('server refuses missing credentials',()=>assert.throws(()=>createApp({localDemo:false,passwordHash:''}),/PASSWORD_HASH/));
