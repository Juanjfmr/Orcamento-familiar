// Duo Finn: server-only Pluggy helpers. Do not import in the browser.
const origin="https://api.pluggy.ai";
let cachedKey=null, keyExpiry=0;
export const isUuid=(s)=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export function reply(res,status,data){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Content-Type-Options","nosniff");
  return res.end(JSON.stringify(data));
}
export async function requestJson(url,init={}){
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(10000)});
  return {ok:response.ok,status:response.status,
          data:await response.json().catch(()=>({}))};
}
export async function authorizeUser(req){
  const env=process.env;
  const auth=String(req.headers.authorization||"");
  if(!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(auth))return null;
  if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:auth};
  const user=await requestJson(env.SUPABASE_URL+"/auth/v1/user",{headers});
  if(!user.ok||!isUuid(user.data.id))return null;
  const home=await requestJson(env.SUPABASE_URL+"/rest/v1/rpc/finn_my_household",{
    method:"POST",headers:{...headers,"content-type":"application/json"},body:"{}"
  });
  if(!home.ok||!Array.isArray(home.data)||home.data.length!==1)return null;
  return {userId:user.data.id,household:home.data[0],headers};
}
export async function pluggyKey(){
  const env=process.env;
  if(!env.PLUGGY_CLIENT_ID||!env.PLUGGY_CLIENT_SECRET)throw Error("pluggy_not_configured");
  if(cachedKey&&Date.now()<keyExpiry)return cachedKey;
  const result=await requestJson(origin+"/auth",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({clientId:env.PLUGGY_CLIENT_ID,clientSecret:env.PLUGGY_CLIENT_SECRET})
  });
  if(!result.ok||typeof result.data.apiKey!=="string")throw Error("pluggy_auth_failed");
  cachedKey=result.data.apiKey;
  keyExpiry=Date.now()+100*60*1000;
  return cachedKey;
}
export async function pluggyApi(path,init={}){
  const key=await pluggyKey();
  return requestJson(origin+path,{
    ...init,
    headers:{"X-API-KEY":key,...(init.headers||{})}
  });
}
export async function ensurePluggyWebhook(){
  const secret=process.env.PLUGGY_WEBHOOK_SECRET;
  const supabase=process.env.SUPABASE_URL;
  if(!secret||!supabase)return false;
  const webhookUrl=new URL("/functions/v1/pluggy-webhook",supabase).href;
  const listed=await pluggyApi("/webhooks");
  // Fail closed when we cannot inspect existing hooks.
  if(!listed.ok||!Array.isArray(listed.data.results))return false;
  const registered=listed.data.results.find(x=>x.url===webhookUrl&&x.event==="all"&&!x.disabledAt);
  if(registered){
    return registered.headers?.["X-Duo-Webhook-Secret"]===secret;
  }
  const created=await pluggyApi("/webhooks",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
      url:webhookUrl,event:"all",
      headers:{"X-Duo-Webhook-Secret":secret}
    })
  });
  return created.ok&&created.data?.url===webhookUrl;
}
