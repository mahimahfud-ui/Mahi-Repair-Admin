import { env } from './http.ts';
function pemBytes(pem:string){const b64=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');return Uint8Array.from(atob(b64),c=>c.charCodeAt(0));}
export async function signCanonicalPayload(payload:string){
 const pem=env('RECIPE_SIGNING_PRIVATE_KEY_PEM');
 const key=await crypto.subtle.importKey('pkcs8',pemBytes(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const modulusLength=(key.algorithm as RsaHashedKeyAlgorithm).modulusLength;
 if(modulusLength!==3072)throw new Error('The repair signing key must be RSA-3072.');
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(payload));
 const bytes=new Uint8Array(signature);let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));
 return btoa(binary);
}
