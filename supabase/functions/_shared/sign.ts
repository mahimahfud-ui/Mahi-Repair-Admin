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

/**
 * Verify signatures against the exact RSA public key bundled in the Android app.
 * Public verification material only; the private signing key remains in Supabase secrets.
 */
const ANDROID_RECIPE_SIGNING_PUBLIC_KEY_BASE64 = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAoO8m4oNIqIb0kGdLI6fWZKwS4Ffe0bfIS3XX2Z0lQV+Df+hOCvDIC/ADqiz2px9lVkiOKTZGSLCSJNOzFXXiqhG6s8vhp18BxbSIimTW7JY/JL6+Y/4leAQTuZOkj7EN9DHtwtUP6UusWUyDR4iB8/SRpxeK0VM1BMFvqXZlR+AhN5IALS1Gwz+UbpEZkPcGG/uiesAMuL3/jkRay+GD+ynCHzX6XS3CYJmH3GebGWDhZJlm8TOwUipCKm/fu1a1cKzrYu9pR7luBU1dOhQMnitaclEeovDKrXwyC3idwCrO5ovslKp2BwY9AxRDzv7qz1oc64EKNZnyis0HScvppGmaCf/NJJz//TpAkJy2MxwAc2n38jTyOtW1Om9UNNpjxjbddfXYwtLil78XGIZetDz+KzRaa9CdNKhdPAmwLhKf2KSNfOPCUp4dM/mAjEtK51I/puisNrGE6jYiyzOMHPR8jFDLm21N2/rbYMdyo1ptNEs2OBwLx4UefPaE4QHrAgMBAAE=';

export async function verifyCanonicalPayloadSignature(payload: string, signatureBase64: string): Promise<boolean> {
  try {
    const der = Uint8Array.from(atob(ANDROID_RECIPE_SIGNING_PUBLIC_KEY_BASE64), (character) => character.charCodeAt(0));
    const publicKey = await crypto.subtle.importKey(
      'spki',
      der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signature = Uint8Array.from(atob(signatureBase64), (character) => character.charCodeAt(0));
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}
