import {SignJWT,jwtVerify} from 'jose';import {cookies} from 'next/headers';
const key=()=>new TextEncoder().encode(process.env.AUTH_SESSION_SECRET||'');
export type Session={id:string;role:'owner'|'admin'|'clerk';name:string};
export async function sign(s:Session){if(key().length<32)throw Error('AUTH_SESSION_SECRET must be 32+ characters');return new SignJWT(s).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(key())}
export async function session():Promise<Session|null>{try{const c=cookies().get('shop_session')?.value;if(!c)return null;const {payload}=await jwtVerify(c,key());return {id:String(payload.id),role:payload.role as Session['role'],name:String(payload.name)}}catch{return null}}
export function privileged(s:Session|null){return !!s&&s.role!=='clerk'}
