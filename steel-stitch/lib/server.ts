import {NextResponse} from 'next/server';import {session,privileged} from './auth';import {db} from './db';
export async function context(admin=false){const s=await session();if(!s||(admin&&!privileged(s)))throw Error('Unauthorized');return {s,client:db()}}
export function fail(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:'Request failed'},{status:e instanceof Error&&e.message==='Unauthorized'?403:400})}
