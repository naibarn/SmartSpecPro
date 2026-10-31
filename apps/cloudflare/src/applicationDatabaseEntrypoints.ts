/** Fixed startup programs for the already-published images. The supported
 * entrypoint override selects these programs; callers cannot supply commands.
 * Native WebSocket clients use the private outbound binding on port 80, whose
 * traffic is encrypted by Cloudflare's network. PostgreSQL remains TLS with
 * verify-full end to end. No Access app, public DNS or image rebuild is used.
 * cloudflared access tcp is intentionally NOT used: it forces HTTPS even when
 * passed http://, which cannot reach the private HTTP interception endpoint. */
export const NODE_DATABASE_CARRIER_SOURCE = String.raw`
async function createDatabaseCarrier(endpoint,port){
 const {createServer}=await import('node:net');const connections=new Set();
 const server=createServer(socket=>{
  socket.pause();const ws=new WebSocket(endpoint);ws.binaryType='arraybuffer';
  let count=0,closed=false;
  const stop=()=>{if(closed)return;closed=true;connections.delete(stop);socket.destroy();try{ws.close();}catch{}};
  connections.add(stop);socket.once('error',stop);socket.once('close',stop);
  ws.addEventListener('error',stop);ws.addEventListener('close',stop);ws.addEventListener('open',()=>socket.resume());
  socket.on('data',data=>{count+=data.length;if(ws.readyState!==1||ws.bufferedAmount>1048576||count>67108864)stop();else ws.send(data);});
  ws.addEventListener('message',event=>{
   if(!(event.data instanceof ArrayBuffer)||(count+=event.data.byteLength)>67108864||socket.writableLength>1048576)stop();else socket.write(new Uint8Array(event.data));
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return{port:server.address().port,close(){for(const stop of connections)stop();return new Promise(resolve=>server.close(resolve));}};
}
`;
export const NODE_VPC_DATABASE_ENTRYPOINT = NODE_DATABASE_CARRIER_SOURCE + String.raw`
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const env={...process.env},end=Date.parse(env.CLOUDFLARE_APPLICATION_EXPIRES_AT??'');
let carrier,app,failureStage='configuration';
function stop(){app?.kill('SIGKILL');void carrier?.close();}
try{
 const db=new URL(env.DATABASE_URL),host=env.DATABASE_CONNECTOR_HOSTNAME??'',staging=host==='db-staging.smartaihub.app';
 if(env.NODE_ENV!=='production'||env.SMARTAIHUB_APPLICATION_RUNTIME!=='cloudflare-http'||env.CLOUDFLARE_CONTAINER_POLICY!=='on-demand'||
 !Number.isFinite(end)||end<=Date.now()||end-Date.now()>600000||db.hostname!==host||
 !/^sah_cf_app_[a-f0-9]{12}$/.test(decodeURIComponent(db.username))||
 db.port!==(staging?'5432':'5433')||!db.password||
 !['postgres:','postgresql:'].includes(db.protocol)||[...db.searchParams.keys()].some(k=>/^ssl/i.test(k))||
 env.DATABASE_SSL_MODE!=='verify-full'||!env.DATABASE_SSL_CA)throw Error();
 db.hostname='127.0.0.1';db.port='15432';env.DATABASE_URL=db.href;env.DATABASE_SSL_SERVER_NAME=host;
 for(const k of ['DATABASE_ACCESS_CLIENT_ID','DATABASE_ACCESS_CLIENT_SECRET','TUNNEL_SERVICE_TOKEN_ID','TUNNEL_SERVICE_TOKEN_SECRET'])delete env[k];
 const timer=setTimeout(()=>{stop();process.exit(0);},end-Date.now());
 process.once('SIGTERM',()=>{stop();process.exit(0);});process.once('SIGINT',()=>{stop();process.exit(0);});
 failureStage='database-bridge';
 carrier=await createDatabaseCarrier('ws://database.application.internal/',15432);
 const {createApplicationDatabaseTls}=await import('/app/server/_core/applicationDatabaseTls.ts');
 const {default:postgres}=await import('postgres');
 failureStage='database-tls';
 const ssl=createApplicationDatabaseTls(env.DATABASE_URL,env);
 failureStage='database-connect';
 const client=postgres(env.DATABASE_URL,{ssl,max:1,connect_timeout:8});
 let ready=false;
 try{for(let n=0;n<3;n++){let timeout;try{await Promise.race([client.unsafe('SELECT 1'),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error()),10000);})]);ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}finally{clearTimeout(timeout);}}}
 finally{await client.end({timeout:1});}
 if(!ready)throw Error();
 failureStage='application-start';
 app=spawn(process.execPath,['/app/server/_core/cloudflare-http-api/index.mjs'],{env,stdio:['ignore','inherit','inherit']});
 await once(app,'exit');clearTimeout(timer);stop();
}catch{stop();console.error('APPLICATION_VPC_DATABASE_START_FAILED:'+failureStage);process.exit(1);}
`;
export const PYTHON_DATABASE_CARRIER_SOURCE = String.raw`
async def forward_database(reader,writer,session,endpoint):
 try:
  async with session.ws_connect(endpoint,max_msg_size=1048576) as ws:
   transferred=0
   async def upstream():
    nonlocal transferred
    while True:
     data=await reader.read(65536)
     if not data:return
     transferred+=len(data)
     if transferred>67108864:raise ValueError()
     await ws.send_bytes(data)
   async def downstream():
    nonlocal transferred
    async for message in ws:
     if message.type!=aiohttp.WSMsgType.BINARY:return
     transferred+=len(message.data)
     if transferred>67108864:raise ValueError()
     writer.write(message.data);await writer.drain()
   tasks=[asyncio.create_task(upstream()),asyncio.create_task(downstream())]
   try:await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
   finally:
    for task in tasks:task.cancel()
    await asyncio.gather(*tasks,return_exceptions=True)
 except Exception:pass
 finally:
  writer.close()
  try:await asyncio.wait_for(writer.wait_closed(),2)
  except Exception:pass
`;
export const PYTHON_VPC_DATABASE_ENTRYPOINT = String.raw`
import os,sys,re,signal,threading,asyncio,aiohttp,functools
from datetime import datetime,timezone
from urllib.parse import urlsplit,urlunsplit,parse_qsl
` + PYTHON_DATABASE_CARRIER_SOURCE + String.raw`
failure_stage='configuration'
try:
 env=dict(os.environ);end=datetime.fromisoformat(env.get('CLOUDFLARE_APPLICATION_EXPIRES_AT','').replace('Z','+00:00'))
 remaining=end.timestamp()-datetime.now(timezone.utc).timestamp();db=urlsplit(env['DATABASE_URL'])
 host=env.get('DATABASE_CONNECTOR_HOSTNAME','');staging=host=='db-staging.smartaihub.app'
 role_pattern=r'sah_cf_app_[a-f0-9]{12}'
 port='5432' if staging else '5433'
 if env.get('ENVIRONMENT')!='production' or env.get('SMARTAIHUB_APPLICATION_RUNTIME')!='cloudflare-http' or env.get('CLOUDFLARE_CONTAINER_POLICY')!='on-demand' or end.tzinfo is None or not 0<remaining<=600 or db.hostname!=host or db.port!=port or not re.fullmatch(role_pattern,db.username or '') or not db.password or db.scheme not in ('postgres','postgresql','postgresql+asyncpg') or any(k.lower().startswith('ssl') for k,_ in parse_qsl(db.query)) or env.get('DATABASE_SSL_MODE')!='verify-full' or not env.get('DATABASE_SSL_CA'):raise ValueError()
 os.environ['DATABASE_URL']=urlunsplit(db._replace(scheme='postgresql+asyncpg',netloc=db.netloc.rsplit('@',1)[0]+'@'+host+':15432'))
 for k in ('DATABASE_ACCESS_CLIENT_ID','DATABASE_ACCESS_CLIENT_SECRET','TUNNEL_SERVICE_TOKEN_ID','TUNNEL_SERVICE_TOKEN_SECRET'):os.environ.pop(k,None)
 timer=threading.Timer(remaining,lambda:os._exit(0));timer.daemon=True;timer.start()
 for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,lambda *_:os._exit(0))
 from app.core.cloudflare_http_entrypoint import DatabaseConnectorEventLoop,serve_http
 failure_stage='database-bridge'
 async def main():
  async with aiohttp.ClientSession() as session:
   server=await asyncio.start_server(functools.partial(forward_database,session=session,endpoint='http://database.application.internal/'),'127.0.0.1',15432)
   async with server:await serve_http()
 failure_stage='database-connect'
 asyncio.run(main(),loop_factory=lambda:DatabaseConnectorEventLoop(host))
 timer.cancel()
except Exception:
 sys.stderr.write('APPLICATION_VPC_DATABASE_START_FAILED:'+failure_stage+'\n');sys.exit(1)
`;
export function applicationVpcDatabaseEntrypoint(runtime: "node-http" | "python-http") {
  return runtime === "node-http" ? ["node", "--import=tsx", "--input-type=module", "-e", NODE_VPC_DATABASE_ENTRYPOINT]
    : ["python", "-c", PYTHON_VPC_DATABASE_ENTRYPOINT];
}
