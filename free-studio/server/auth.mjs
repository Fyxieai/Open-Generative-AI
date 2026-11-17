import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const loopback=host=>['127.0.0.1','::1','localhost'].includes(host);
export function configuration(env) {
  const production=env.NODE_ENV==='production';
  const host=env.HOST??'127.0.0.1';const password=env.STUDIO_PASSWORD??'';
  if(production && !password)throw new Error('STUDIO_PASSWORD is required in production');
  if(!password && !loopback(host))throw new Error('A password is required when not bound to a loopback host');
  if(production && !env.STUDIO_ORIGIN)throw new Error('STUDIO_ORIGIN is required in production');
  let origin;
  try {origin=new URL(env.STUDIO_ORIGIN??`http://localhost:${env.PORT??3210}`);}catch{throw new Error('STUDIO_ORIGIN must be a valid origin');}
  if(origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash || !['http:','https:'].includes(origin.protocol) || (production && origin.protocol!=='https:'))throw new Error('STUDIO_ORIGIN must be an HTTPS origin in production');
  return {production,host,password,origin:origin.origin,secure:origin.protocol==='https:',localMode:!password};
}
const digest=value=>createHash('sha256').update(value).digest();
export class Auth {
  constructor(config,store,now=Date.now) {this.config=config;this.store=store;this.now=now;this.sessions=new Map();this.attempts=new Map();}
  sameOrigin(req) {return req.headers.origin===this.config.origin && (!req.headers['sec-fetch-site'] || ['same-origin','none'].includes(req.headers['sec-fetch-site']));}
  localRequest(req) {
    const remote=req.socket.remoteAddress;
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return false;
    try {return loopback(new URL('http://'+req.headers.host).hostname.replace(/^\[|\]$/g,''));}catch{return false;}
  }
  authenticated(req) {
    if(this.config.localMode)return this.localRequest(req);
    const token=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('studio_session='))?.slice(15);
    if(!token || token.length>300)return false;
    const [id,signature]=token.split('.');if(!id || !signature)return false;
    const expected=createHmac('sha256',this.store.key).update(id).digest('hex');
    if(signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return false;
    const expires=this.sessions.get(id);if(!expires || expires<=this.now()){this.sessions.delete(id);return false;}return true;
  }
  cookie(token,maxAge=43200) {return `studio_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.config.secure?'; Secure':''}`;}
  login(req,password) {
    if(typeof password!=='string' || password.length>4096)throw Object.assign(new Error('Invalid password'),{status:401});
    const address=req.socket.remoteAddress;
    const previous=this.attempts.get(address);
    const record=previous && previous.reset>this.now()?previous:{count:0,reset:this.now()+15*60*1000};
    if(record.count>=5)throw Object.assign(new Error('Too many login attempts. Try again in 15 minutes.'),{status:429});
    if(!this.config.password || !timingSafeEqual(digest(password),digest(this.config.password))) {
      record.count++;this.attempts.set(address,record);throw Object.assign(new Error('Invalid password'),{status:401});
    }
    this.attempts.delete(address);
    // Expired sessions are removed whenever a login occurs.
    for(const [id,expiry] of this.sessions)if(expiry<=this.now())this.sessions.delete(id);
    const id=randomBytes(32).toString('hex');this.sessions.set(id,this.now()+12*3600000);
    const signature=createHmac('sha256',this.store.key).update(id).digest('hex');return this.cookie(`${id}.${signature}`);
  }
  logout(req) {const token=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('studio_session='))?.slice(15);if(token)this.sessions.delete(token.split('.')[0]);return this.cookie('',0);}
}
