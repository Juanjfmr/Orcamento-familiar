import {reply,authorizeUser,pluggyKey,pluggyApi,ensurePluggyWebhook} from "../../lib/pluggy-server.js";
export default async function handler(req,res){
  if(req.method!=="POST")return reply(res,405,{error:"method_not_allowed"});
  if(!process.env.PLUGGY_CLIENT_SECRET)return reply(res,503,{error:"bank_provider_not_configured"});
  try{
    const user=await authorizeUser(req);
    if(!user)return reply(res,401,{error:"session_or_household_required"});
    await pluggyKey();
    const [webhookEnabled,connect]=await Promise.all([
      ensurePluggyWebhook().catch(()=>false),
      pluggyApi("/connect_token",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({options:{clientUserId:user.userId,avoidDuplicates:true}})
      })
    ]);
    if(!connect.ok||typeof connect.data.accessToken!=="string"){
      return reply(res,502,{error:"connect_token_unavailable"});
    }
    return reply(res,200,{
      accessToken:connect.data.accessToken,
      expiresInSeconds:1800,webhookEnabled:Boolean(webhookEnabled)
    });
  }catch{
    return reply(res,502,{error:"bank_provider_unavailable"});
  }
}