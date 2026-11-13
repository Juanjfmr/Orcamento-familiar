// Duo Finn / Vercel Node function. Never put Pluggy secrets in the browser or repository.
// The endpoint does NOT activate until these environment variables are configured:
// SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET
const origin = "https://api.pluggy.ai";
let sessionKey = null;
let sessionExpiresAt = 0;
function respond(res,status,body){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.end(JSON.stringify(body));
}
async function responseJson(url, init) {
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>({}));
  return {status:response.status,ok:response.ok,data};
}
async function pluggyKey(clientId,clientSecret){
  if(sessionKey && Date.now()<sessionExpiresAt)return sessionKey;
  const result=await responseJson(origin+"/auth",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({clientId,clientSecret})
  });
  if(!result.ok||typeof result.data.apiKey!=="string")throw Error("pluggy_auth_failed");
  sessionKey=result.data.apiKey;
  sessionExpiresAt=Date.now()+110*60*1000; // validade oficial: 2 horas; margem de segurança
  return sessionKey;
}
export default async function handler(req,res){
  if(req.method!=="POST")return respond(res,405,{error:"method_not_allowed"});
  const env=process.env;
  if(!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY ||
     !env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET){
    return respond(res,503,{error:"provider_not_configured"});
  }
  const authz=String(req.headers.authorization||"");
  if(!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(authz)){
    return respond(res,401,{error:"authentication_required"});
  }
  const headers={"apikey":env.SUPABASE_PUBLISHABLE_KEY,"Authorization":authz};
  try{
    // Validate user's Supabase session on the server; never trust a client user_id.
    const user=await responseJson(env.SUPABASE_URL+"/auth/v1/user",{headers});
    if(!user.ok||!user.data.id)return respond(res,401,{error:"invalid_session"});
    // RPC also checks membership. A logged-in stranger cannot generate bank tokens.
    const family=await responseJson(env.SUPABASE_URL+"/rest/v1/rpc/finn_my_household",{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},body:"{}"
    });
    if(!family.ok||!Array.isArray(family.data)||family.data.length!==1){
      return respond(res,403,{error:"household_membership_required"});
    }
    const key=await pluggyKey(env.PLUGGY_CLIENT_ID,env.PLUGGY_CLIENT_SECRET);
    const connect=await responseJson(origin+"/connect_token",{
      method:"POST",
      headers:{"X-API-KEY":key,"Content-Type":"application/json"},
      body:JSON.stringify({options:{clientUserId:user.data.id,avoidDuplicates:true}})
    });
    if(!connect.ok||typeof connect.data.accessToken!=="string"){
      return respond(res,502,{error:"bank_token_unavailable"});
    }
    return respond(res,200,{accessToken:connect.data.accessToken,expiresInSeconds:1800});
  }catch(error){
    // Do not return provider credentials, bank identifiers, private errors or tokens.
    return respond(res,502,{error:"bank_provider_unavailable"});
  }
}