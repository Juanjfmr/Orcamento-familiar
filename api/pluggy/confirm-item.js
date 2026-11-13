import {reply,authorizeUser,isUuid,pluggyApi} from "../../lib/pluggy-server.js";
export default async function handler(req,res){
  if(req.method!=="POST")return reply(res,405,{error:"method_not_allowed"});
  if(!process.env.PLUGGY_CONFIRM_SECRET||!process.env.SUPABASE_URL){
    return reply(res,503,{error:"confirmation_not_configured"});
  }
  try{
    const user=await authorizeUser(req);
    if(!user)return reply(res,401,{error:"session_or_household_required"});
    const itemId=req.body?.itemId;
    if(!isUuid(itemId))return reply(res,400,{error:"invalid_item_id"});
    // Server-side lookup is mandatory: never trust an itemId or owner from PluggyConnect onSuccess.
    const provider=await pluggyApi("/items/"+encodeURIComponent(itemId));
    if(!provider.ok||!provider.data||provider.data.clientUserId!==user.userId){
      return reply(res,403,{error:"item_not_owned_by_user"});
    }
    // Calls a narrow authenticated RPC: JWT binds the owner, server-only proof authorizes insertion.
    const saved=await fetch(process.env.SUPABASE_URL+"/rest/v1/rpc/finn_register_verified_item",{
      method:"POST",signal:AbortSignal.timeout(10000),
      headers:{...user.headers,"content-type":"application/json"},
      body:JSON.stringify({p_secret:process.env.PLUGGY_CONFIRM_SECRET,p_item_id:itemId})
    });
    if(!saved.ok)return reply(res,502,{error:"connection_registration_failed"});
    return reply(res,200,{registered:true,status:"pending_sync"});
  }catch{
    return reply(res,502,{error:"confirmation_temporarily_unavailable"});
  }
}