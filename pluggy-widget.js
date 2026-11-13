// Pluggy Connect for vanilla JS, scoped to the authenticated owner.
let loadPromise;
function loadWidget(){
  if(window.PluggyConnect)return Promise.resolve(window.PluggyConnect);
  if(!loadPromise)loadPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.pluggy.ai/connect/v2/pluggy-connect.js";
    script.async=true;
    script.onload=()=>window.PluggyConnect?resolve(window.PluggyConnect):reject(Error("PluggyConnect not loaded"));
    script.onerror=()=>reject(Error("PluggyConnect script unavailable"));
    document.head.append(script);
  }).catch(ex=>{loadPromise=null;throw ex;});
  return loadPromise;
}
async function authorizedPost(path,token,body={}){
  const response=await fetch(path,{
    method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},
    body:JSON.stringify(body),credentials:"same-origin"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"provider_unavailable");
  return data;
}
export async function launchPluggy(db,{onConnected,onWarning,onFailure}){
  const session=await db.auth.getSession();
  const token=session.data?.session?.access_token;
  if(!token)throw Error("Sua sessão expirou. Entre novamente.");
  const [PluggyConnect,connect]=await Promise.all([
    loadWidget(),
    authorizedPost("/api/pluggy/connect-token",token)
  ]);
  if(!connect.accessToken)throw Error("A Pluggy não retornou o token de conexão.");
  if(!connect.webhookEnabled)onWarning("Aviso: o webhook automático ainda não foi confirmado.");
  const widget=new PluggyConnect({
    connectToken:connect.accessToken,
    includeSandbox:true,
    onSuccess:async data=>{
      try{
        const itemId=data?.item?.id;
        if(typeof itemId!=="string")throw Error("A conexão não retornou um identificador.");
        const confirmed=await authorizedPost("/api/pluggy/confirm-item",token,{itemId});
        if(confirmed.registered)await onConnected();
      }catch{
        onFailure("A autorização bancária ocorreu, mas não foi possível confirmar a propriedade da conexão. Nenhum extrato foi importado.");
      }
    },
    onError:()=>onFailure("A conexão bancária não foi concluída. Você pode tentar novamente.")
  });
  widget.init();
}
