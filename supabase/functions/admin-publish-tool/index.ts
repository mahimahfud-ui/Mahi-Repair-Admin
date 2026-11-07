import { requireOwner, respond, preflight, handleError, jsonBody, rateLimit } from '../_shared/http.ts';
import { z } from 'npm:zod@4';
import { RecipeSchema, canonicalJson } from '../_shared/recipe.ts';
import { signCanonicalPayload } from '../_shared/sign.ts';
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return preflight(req);try{
 const {user,admin}=await requireOwner(req);await rateLimit(admin,`publish:${user.id}`,8,60);const body=await jsonBody(req);const Input=z.object({tool_id:z.string().uuid(),source_version_id:z.string().uuid().optional(),changelog:z.string().max(2000).optional()}).strict();const parsed=Input.safeParse(body);if(!parsed.success)return respond(req,{error:{code:'INVALID_PUBLISH_REQUEST',issues:parsed.error.issues}},422);
 const {data:tool,error}=await admin.from('repair_tools').select('id,slug,status,version,draft_recipe').eq('id',parsed.data.tool_id).single();if(error||!tool)throw Object.assign(new Error('Tool not found'),{status:404});
 if(tool.status==='ARCHIVED'||tool.status==='DISABLED')throw Object.assign(new Error('Archived or disabled tools cannot be published. Re-enable explicitly first.'),{status:409});
 let source=tool.draft_recipe;if(parsed.data.source_version_id){const prior=await admin.from('repair_tool_versions').select('payload').eq('id',parsed.data.source_version_id).eq('tool_id',tool.id).single();if(prior.error||!prior.data)throw Object.assign(new Error('Source version not found for this tool'),{status:404});source=prior.data.payload;}
 const changelog=String(parsed.data.changelog??source.changelog??'');const nextPayload={...source,toolId:tool.slug,version:tool.version+1,changelog};
 const checked=RecipeSchema.safeParse(nextPayload);if(!checked.success)return respond(req,{error:{code:'INVALID_RECIPE',issues:checked.error.issues}},422);
 const canonical=canonicalJson(checked.data);const signature=await signCanonicalPayload(canonical);
 const {data:publishedVersion,error:publishError}=await admin.rpc('commit_repair_tool_version',{p_tool_id:tool.id,p_expected_version:tool.version,p_payload:checked.data,p_canonical_payload:canonical,p_signature:signature,p_changelog:changelog,p_published_by:user.id});
 if(publishError)throw Object.assign(new Error(publishError.message),{status:409});
 // The SQL commit RPC writes the publication audit record in the same transaction.
 return respond(req,{data:{tool_id:tool.id,version:publishedVersion,signature_algorithm:'RSA-SHA256',published:true}});
}catch(e){return handleError(req,e);}});
