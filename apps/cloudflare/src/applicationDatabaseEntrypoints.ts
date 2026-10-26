/** Fixed, reviewed startup programs for the already-published images. The
 * supported Container entrypoint override selects this transport; callers
 * cannot provide commands. No image rebuild, Access token or DNS is needed.
 * cloudflared is an opaque WebSocket carrier here, NOT an Access application.
 * The original request-only APIs and verify-full PostgreSQL drivers are reused. */
export const NODE_VPC_DATABASE_ENTRYPOINT = String.raw`
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const env={...process.env}, end=Date.parse(env.CLOUDFLARE_APPLICATION_EXPIRES_AT??'');
let connector,app;
function stop(){app?.kill('SIGKILL');connector?.kill('SIGKILL');}
try{
 const db=new URL(env.DATABASE_URL);
 if(env.NODE_ENV!=='production'||env.SMARTAIHUB_APPLICATION_RUNTIME!=='cloudflare-http'||env.CLOUDFLARE_CONTAINER_POLICY!=='on-demand'||
 !Number.isFinite(end)||end<=Date.now()||end-Date.now()>600000||db.hostname!=='db.smartaihub.app'||
 !/^sah_cf_app_[a-f0-9]{12}$/.test(decodeURIComponent(db.username))||!db.password||
 !['postgres:','postgresql:'].includes(db.protocol)||[...db.searchParams.keys()].some(k=>/^ssl/i.test(k))||
 env.DATABASE_SSL_MODE!=='verify-full'||!env.DATABASE_SSL_CA)throw Error();
 db.hostname='127.0.0.1';db.port='15432';env.DATABASE_URL=db.href;env.DATABASE_SSL_SERVER_NAME='db.smartaihub.app';
 for(const k of ['DATABASE_ACCESS_CLIENT_ID','DATABASE_ACCESS_CLIENT_SECRET','TUNNEL_SERVICE_TOKEN_ID','TUNNEL_SERVICE_TOKEN_SECRET'])delete env[k];
 const timer=setTimeout(()=>{stop();process.exit(0);},end-Date.now());
 process.once('SIGTERM',()=>{stop();process.exit(0);});process.once('SIGINT',()=>{stop();process.exit(0);});
 connector=spawn('/usr/local/bin/cloudflared',['access','tcp','--hostname','http://database.application.internal','--url','127.0.0.1:15432','--log-level','error'],
 {env:{PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin'},stdio:['ignore','ignore','ignore']});
 const exited=new Promise(resolve=>{connector.once('exit',resolve);connector.once('error',resolve);});
 const {createApplicationDatabaseTls}=await import('/app/server/_core/applicationDatabaseTls.ts');
 const {default:postgres}=await import('postgres');
 const client=postgres(env.DATABASE_URL,{ssl:createApplicationDatabaseTls(env.DATABASE_URL,env),max:1,connect_timeout:3});
 let ready=false;
 try{for(let n=0;n<5;n++){if(connector.exitCode!==null)break;try{await client.unsafe('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}}
 finally{await client.end({timeout:1});}
 if(!ready)throw Error();
 app=spawn(process.execPath,['/app/server/_core/cloudflare-http-api/index.mjs'],{env,stdio:['ignore','inherit','inherit']});
 await Promise.race([exited,once(app,'exit')]);clearTimeout(timer);stop();
}catch{stop();console.error('APPLICATION_VPC_DATABASE_START_FAILED');process.exit(1);}
`;

export const PYTHON_VPC_DATABASE_ENTRYPOINT = String.raw`
import os,sys,re,signal,subprocess,threading
from datetime import datetime,timezone
from urllib.parse import urlsplit,urlunsplit,parse_qsl
env=dict(os.environ);connector=app=None
def stop():
 for child in (app,connector):
  if child is not None:
   try: os.killpg(child.pid,signal.SIGKILL)
   except ProcessLookupError: pass
def deadline():
 stop();os._exit(0)
try:
 end=datetime.fromisoformat(env.get('CLOUDFLARE_APPLICATION_EXPIRES_AT','').replace('Z','+00:00'))
 remaining=end.timestamp()-datetime.now(timezone.utc).timestamp();db=urlsplit(env['DATABASE_URL'])
 if env.get('ENVIRONMENT')!='production' or env.get('SMARTAIHUB_APPLICATION_RUNTIME')!='cloudflare-http' or env.get('CLOUDFLARE_CONTAINER_POLICY')!='on-demand' or end.tzinfo is None or not 0<remaining<=600 or db.hostname!='db.smartaihub.app' or not re.fullmatch(r'sah_cf_app_[a-f0-9]{12}',db.username or '') or not db.password or db.scheme not in ('postgres','postgresql','postgresql+asyncpg') or any(k.lower().startswith('ssl') for k,_ in parse_qsl(db.query)) or env.get('DATABASE_SSL_MODE')!='verify-full' or not env.get('DATABASE_SSL_CA'): raise ValueError()
 env['DATABASE_URL']=urlunsplit(db._replace(scheme='postgresql+asyncpg',netloc=db.netloc.rsplit('@',1)[0]+'@db.smartaihub.app:15432'))
 for k in ('DATABASE_ACCESS_CLIENT_ID','DATABASE_ACCESS_CLIENT_SECRET','TUNNEL_SERVICE_TOKEN_ID','TUNNEL_SERVICE_TOKEN_SECRET'): env.pop(k,None)
 timer=threading.Timer(remaining,deadline);timer.daemon=True;timer.start()
 for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,lambda *_:deadline())
 connector=subprocess.Popen(['/usr/local/bin/cloudflared','access','tcp','--hostname','http://database.application.internal','--url','127.0.0.1:15432','--log-level','error'],env={'PATH':env.get('PATH','/usr/local/bin:/usr/bin:/bin')},stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 app=subprocess.Popen([sys.executable,'-m','app.core.cloudflare_http_entrypoint','--serve'],env=env,stdin=subprocess.DEVNULL,start_new_session=True)
 event=threading.Event()
 while not event.wait(.1):
  if connector.poll() is not None or app.poll() is not None:raise RuntimeError()
except Exception:
 stop();sys.stderr.write('APPLICATION_VPC_DATABASE_START_FAILED\n');sys.exit(1)
`;

export function applicationVpcDatabaseEntrypoint(runtime: "node-http" | "python-http") {
  return runtime === "node-http" ? ["node", "--import=tsx", "--input-type=module", "-e", NODE_VPC_DATABASE_ENTRYPOINT]
    : ["python", "-c", PYTHON_VPC_DATABASE_ENTRYPOINT];
}
