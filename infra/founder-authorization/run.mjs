// Local-only cluster. Never accepts a hosted URL or existing database.
import EmbeddedPostgres from 'embedded-postgres';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');process.chdir(root);
const databaseDir=path.join(root,'.phase1-checks','founder-pg-'+randomUUID());
const port=55439,password=randomUUID();
const cluster=new EmbeddedPostgres({databaseDir,user:'postgres',password,port,persistent:true,
 postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let child;
try{
 await cluster.initialise();await cluster.start();
 child=spawn(process.execPath,['--test','tests/founder-authorization-races.test.mjs'],{
  cwd:root,stdio:'inherit',windowsHide:true,
  env:{...process.env,FOUNDER_LOCAL_PG_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`}
 });
 process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
}finally{
 if(process.platform==='win32'){
  const require=createRequire(import.meta.url);
  const binary=path.resolve(path.dirname(require.resolve('@embedded-postgres/windows-x64')),'../native/bin/pg_ctl.exe');
  await promisify(execFile)(binary,['stop','-D',databaseDir,'-m','fast','-w'],{windowsHide:true});
 }else await cluster.stop();
 // Only this newly created local cluster directory may be removed.
 if(path.dirname(databaseDir)!==path.join(root,'.phase1-checks'))throw Error('Unsafe test cleanup path');
 fs.rmSync(databaseDir,{recursive:true,force:true});
}
