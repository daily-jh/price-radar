import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {randomBytes,scryptSync} from 'node:crypto';
import {Writable} from 'node:stream';
import readline from 'node:readline/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const demo=process.argv.includes('--demo');
if(!demo&&!existsSync('.env')) {
  if(!process.stdin.isTTY)throw new Error('start-private.cmd를 직접 실행해 비밀번호를 설정하세요.');
  const hidden=new Writable({write(_c,_e,done){done();}}),rl=readline.createInterface({input:process.stdin,output:hidden,terminal:true});
  let password,confirm;
  do {process.stdout.write('관리자 비밀번호 (12자 이상, 입력 내용 숨김): ');password=await rl.question('');process.stdout.write('\n다시 입력: ');confirm=await rl.question('');process.stdout.write('\n');if(password.length<12||password!==confirm)console.log('12자 이상이고 두 입력이 같아야 합니다.');}while(password.length<12||password!==confirm);
  rl.close();const salt=randomBytes(16).toString('hex');
  writeFileSync('.env',`HOST=127.0.0.1\nPORT=3082\nAPP_ORIGIN=http://127.0.0.1:3082\nPASSWORD_HASH=${salt}:${scryptSync(password,salt,64).toString('hex')}\nCOOKIE_SECURE=false\nDATABASE_PATH=data/radar.sqlite\nLOCAL_DEMO=false\n`,{mode:0o600});password=null;confirm=null;
  console.log('비밀번호 해시를 이 컴퓨터의 .env에 저장했습니다.');
}
if(!demo)process.loadEnvFile('.env');
const {createApp}=await import('./server.mjs');
const {createStore}=await import('./store.mjs');
const port=demo?3081:Number(process.env.PORT||3082);
if(!demo&&process.env.HOST!=='127.0.0.1')throw new Error('이 실행기는 로컬 전용입니다. 서버 배포에는 npm start를 사용하세요.');
const {server}=createApp({localDemo:demo,...(demo?{store:createStore(),origin:`http://127.0.0.1:${port}`}:{})});
server.on('error',e=>{if(e.code==='EADDRINUSE')console.error('이미 실행 중이거나 포트를 사용 중입니다. 브라우저에서 아래 주소를 확인하세요.');else console.error(e.message);console.log(`http://127.0.0.1:${port}`);});
server.listen(port,'127.0.0.1',()=>{const url=`http://127.0.0.1:${port}`;console.log(`PRICE RADAR ${demo?'데모':'개인용'}: ${url}\n종료: Ctrl+C. 이 창을 닫으면 사이트가 종료됩니다.`);if(process.platform==='win32')spawn('explorer.exe',[url],{stdio:'ignore',windowsHide:true}).unref();});
