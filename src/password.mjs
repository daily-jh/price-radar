import {randomBytes,scryptSync} from 'node:crypto';
import {Writable} from 'node:stream';
import readline from 'node:readline';
if(!process.stdin.isTTY)throw new Error('터미널에서 직접 실행하세요.');
const hidden=new Writable({write(_chunk,_enc,done){done();}});
process.stdout.write('관리자 비밀번호 (12자 이상, 입력은 표시되지 않음): ');
const rl=readline.createInterface({input:process.stdin,output:hidden,terminal:true});
rl.question('',password=>{rl.close();if(password.length<12){console.error('\n12자 이상 입력하세요.');process.exitCode=1;return;}const salt=randomBytes(16).toString('hex');console.log(`\nPASSWORD_HASH=${salt}:${scryptSync(password,salt,64).toString('hex')}`);});
