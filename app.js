import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
import { supabaseUrl, supabasePublishableKey } from "./config.js";

const db = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const categories = ["Moradia","Alimentação","Mercado","Transporte","Saúde","Educação","Lazer","Assinaturas","Outros","Revisar"];
const pages = [["inicio","Início"],["fluxo","Fluxo"],["cartoes","Cartões"],["casa","Nossa casa"],["privado","Meu extrato"],["agente","Agente"]];
const app = document.getElementById("app");
const now = new Date();
const s = {
  page:"inicio", loading:true, busy:false, user:null, household:null, dashboard:null,
  breakdown:[],accounts:[],transactions:[],invite:"",message:"",error:"",
  month:String(now.getFullYear())+"-"+String(now.getMonth()+1).padStart(2,"0")
};
const e = v => String(v??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl = cents=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((Number(cents)||0)/100);
const monthStart=()=>s.month+"-01";
const nextMonth=()=>{const [y,m]=s.month.split("-").map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);};
const row=(label,value,sub="")=>'<div class="line"><div><b>'+e(label)+'</b>'+(sub?'<small>'+e(sub)+'</small>':"")+'</div><strong>'+e(value)+'</strong></div>';
const card=(content,extra="")=>'<article class="card '+extra+'">'+content+'</article>';
const errorText=error=>e(error?.message||String(error||"Não foi possível concluir a operação."));
function button(label,action,extra=""){return '<button type="button" class="btn '+extra+'" data-action="'+action+'">'+label+'</button>';}
function nav(){return pages.map(p=>'<button type="button" data-page="'+p[0]+'" class="'+(s.page===p[0]?"active":"")+'">'+p[1]+'</button>').join("");}
function signin(){
  return '<section class="auth-shell"><div class="auth-brand"><span class="logo">◈</span><b>Duo Finn</b><small>Finanças em casal</small></div>'+
  card('<h1>Acesse suas finanças</h1><p class="sub">Cada titular entra com seu próprio e-mail. Os extratos permanecem individuais.</p>'+
  '<form id="auth-form" class="form"><label>E-mail<input type="email" name="email" autocomplete="email" required placeholder="seu@email.com"></label>'+
  '<label>Senha<input type="password" name="password" autocomplete="current-password" minlength="8" required></label>'+
  '<div class="form-buttons"><button type="submit" name="mode" value="login" class="btn">Entrar</button>'+
  '<button type="submit" name="mode" value="signup" class="btn outline">Criar acesso</button></div></form>'+
  '<p class="sub tiny">Depois de criar o acesso, confirme o e-mail se o Supabase solicitar. Não use senhas bancárias.</p>')+
  '<p class="smallprint">Aplicação privada em desenvolvimento. Nenhum banco conectado.</p></section>';
}
function setup(){
  return '<div class="page-title"><h1>Configurar família</h1><p class="sub">Sua conta foi autenticada. Agora conecte os dois titulares à mesma família.</p></div>'+
  '<div class="two">'+card('<span class="eyebrow">Primeiro titular</span><h2>Criar nossa família</h2><p class="sub">Crie o espaço financeiro compartilhado. Depois gere um convite para o segundo titular.</p>'+
  button("Criar família","create-household"))+
  card('<span class="eyebrow">Segundo titular</span><h2>Entrar na família</h2><p class="sub">Use o código de convite fornecido pelo primeiro titular.</p>'+
  '<form id="join-form" class="form"><label>Código de convite<input name="code" maxlength="64" minlength="64" autocomplete="off" required placeholder="Cole o código de 64 caracteres"></label><button class="btn" type="submit">Entrar na família</button></form>')+'</div>';
}
function familyBar(){
 const h=s.household;
 if(!h)return "";
 if(Number(h.member_count)>=2)return card('<span class="ok">Os dois titulares estão vinculados à família.</span>','slim');
 if(h.member_role!=="owner")return card('<span class="sub">Aguardando o convite ser aceito pelo outro titular.</span>','slim');
 return card('<div class="between"><div><b>Convide o segundo titular</b><p class="sub">O convite expira em 48 horas e permite apenas mais uma pessoa.</p></div>'+button("Gerar convite","invite","outline")+'</div>'+
  (s.invite?'<label class="code-label">Código de convite<input readonly value="'+e(s.invite)+'" aria-label="Código para o segundo titular"></label>'+button("Copiar convite","copy-invite","outline"):''));
}
function overview(){
 const d=s.dashboard||{},cats=s.breakdown||[];
 return '<div class="page-title between"><div><span class="eyebrow">Visão compartilhada</span><h1>Visão geral</h1></div><span class="pill">Mês: '+e(s.month)+'</span></div>'+
 (s.accounts.length===0?card('<div class="empty-icon">⌁</div><h2>Seus bancos ainda não estão conectados</h2><p class="sub">O Supabase já está vinculado. A conexão bancária automática depende da autorização Pluggy de cada titular. Nenhum valor real foi importado.</p><span class="pill muted-pill">Integração Pluggy pendente</span>','empty'):"")+
 card('<span class="eyebrow">Saldo nas contas do casal</span><div class="hero-number">'+brl(d.available_cents)+'</div>'+
 '<p class="sub">Consolidado bancário. Não inclui limite de cartão.</p><div class="metrics">'+
 [['Receitas',d.income_cents],['Despesas',d.expense_cents],['Resultado',(Number(d.income_cents)||0)-(Number(d.expense_cents)||0)]].map(x=>'<div><small>'+x[0]+'</small><strong>'+brl(x[1])+'</strong></div>').join("")+'</div>','hero')+
 '<div class="two">'+card('<h2>Gastos por categoria</h2>'+(cats.length?cats.map(x=>row(x.category,brl(x.expense_cents))).join(""):'<p class="sub">Ainda não há transações categorizadas.</p>'))+
 card('<h2>Faturas de cartões</h2><div class="kpi">'+brl(d.invoice_cents)+'</div><p class="sub">O pagamento da fatura não será somado outra vez às despesas.</p>')+'</div>'+
 familyBar()+
 '<p class="smallprint">Última atualização bancária: '+e(d.last_synced_at?new Date(d.last_synced_at).toLocaleString("pt-BR"):"ainda não realizada")+'</p>';
}
function cashflow(){const d=s.dashboard||{};
 return '<div class="page-title"><h1>Fluxo de caixa</h1><p class="sub">Resultados do casal; sem expor o extrato do outro titular.</p></div>'+
 '<div class="three">'+[['Receitas',d.income_cents],['Despesas',d.expense_cents],['Saldo do mês',(Number(d.income_cents)||0)-(Number(d.expense_cents)||0)]].map(x=>card('<span class="eyebrow">'+x[0]+'</span><div class="kpi">'+brl(x[1])+'</div>')).join("")+'</div>'+
 card('<h2>Distribuição das despesas</h2>'+(s.breakdown.length?s.breakdown.map(x=>row(x.category,brl(x.expense_cents))).join(""):'<p class="sub">As categorias aparecerão depois da sincronização bancária.</p>'));
}
function cards(){const d=s.dashboard||{},cards=s.accounts.filter(x=>x.kind==="credit");
 return '<div class="page-title"><h1>Cartões</h1><p class="sub">O total é compartilhado; detalhes apenas dos seus cartões.</p></div>'+
 card('<span class="eyebrow">Faturas familiares</span><div class="kpi">'+brl(d.invoice_cents)+'</div>')+
 card('<h2>Meus cartões</h2>'+(cards.length?cards.map(x=>row(x.display_name,brl(x.invoice_cents))).join(""):'<p class="sub">Nenhum cartão importado para este titular.</p>'));
}
function house(){return '<div class="page-title"><h1>Nossa casa</h1><p class="sub">Compromissos de vocês dois, sem divisão de contas.</p></div>'+
 card('<h2>Despesas familiares</h2><p class="sub">Os gastos com moradia aparecerão automaticamente após a integração bancária.</p>')+
 card('<h2>Financiamento imobiliário <span class="pill muted-pill">V2</span></h2><p class="sub">Um financiamento ativo. Importação posterior de PDF atualizado, evolução do saldo devedor e simulação de amortização.</p>');
}
function statement(){
 return '<div class="page-title"><h1>Meu extrato <span class="pill">Privado</span></h1><p class="sub">Apenas movimentações pertencentes à sua conta autenticada.</p></div>'+
 card('<h2>Movimentações</h2>'+(s.transactions.length?s.transactions.map(t=>'<div class="line statement"><div><b>'+e(t.description)+'</b><small>'+e(t.booked_on)+' · '+e(t.category_override||t.inferred_category||"Revisar")+'</small></div><div class="side"><strong>'+brl(t.amount_cents)+'</strong><select data-category-id="'+e(t.id)+'" aria-label="Categoria do lançamento">'+categories.map(c=>'<option value="'+e(c)+'" '+((t.category_override||t.inferred_category||"Revisar")===c?"selected":"")+'>'+e(c)+'</option>').join("")+'</select></div></div>').join(""):'<p class="sub">Seu extrato aparecerá aqui após a primeira sincronização.</p>'));
}
function agent(){return '<div class="page-title"><h1>Agente financeiro</h1><p class="sub">Consulta pelo WhatsApp dos dois titulares.</p></div>'+
 card('<h2>Integração em preparação</h2><p class="sub">O agente será reativo no WhatsApp, mas a categorização por IA ocorrerá automaticamente depois de cada sincronização bancária. Nenhuma API de IA ou WhatsApp está ativa ainda.</p>')+
 card('<h2>O agente poderá responder</h2>'+['Quanto gastamos no mês?','Quais categorias consumiram mais?','Quanto temos disponível?','Quais contas estão próximas de vencer?'].map(x=>'<p class="example">'+e(x)+'</p>').join(""));
}
function shell(content){
 const h=s.household;
 return '<div class="layout"><aside><div class="brand"><span class="logo">◈</span><div><b>Duo Finn</b><small>Finanças em casal</small></div></div>'+
 '<div class="menulabel">Menu</div><nav>'+nav()+'</nav>'+
 '<div class="sidefoot"><small>Conta autenticada</small><strong>'+e(s.user?.email||"")+'</strong><button class="link" data-action="logout">Sair da conta</button></div></aside>'+
 '<main class="main"><header><div class="top-brand"><span class="logo">◈</span><strong>Duo Finn</strong></div><span class="tag">Ambiente familiar privado</span><button class="link" data-action="logout">Sair</button></header>'+
 '<div class="content">'+(h?content:setup())+'</div></main><nav class="bottom">'+nav()+'</nav></div>';
}
function draw(){
 let content;
 if(s.loading)content='<div class="loading"><div class="spinner"></div>Carregando dados protegidos...</div>';
 else if(!s.user)content=signin();
 else content=shell(s.page==="inicio"?overview():s.page==="fluxo"?cashflow():s.page==="cartoes"?cards():s.page==="casa"?house():s.page==="privado"?statement():agent());
 app.innerHTML=content+(s.error?'<div role="alert" class="toast error">'+e(s.error)+'</div>':"")+(s.message?'<div role="status" class="toast">'+e(s.message)+'</div>':"");
}
async function refresh(){
 s.loading=true;s.error="";draw();
 try{
  const auth=await db.auth.getUser();
  if(auth.error)throw auth.error;
  s.user=auth.data.user;s.invite="";
  if(!s.user){s.household=null;s.dashboard=null;s.breakdown=[];s.accounts=[];s.transactions=[];return;}
  const home=await db.rpc("finn_my_household");
  if(home.error)throw home.error;
  s.household=home.data?.[0]||null;
  if(!s.household){s.dashboard=null;s.breakdown=[];s.accounts=[];s.transactions=[];return;}
  const [summary,cats,accounts,tx]=await Promise.all([
    db.rpc("finn_family_dashboard",{p_month:monthStart()}),
    db.rpc("finn_family_categories",{p_month:monthStart()}),
    db.from("bank_accounts").select("id,display_name,kind,balance_cents,invoice_cents,last_synced_at").order("created_at"),
    db.from("transactions").select("id,description,amount_cents,booked_on,inferred_category,category_override,kind").gte("booked_on",monthStart()).lt("booked_on",nextMonth()).order("booked_on",{ascending:false}).limit(100)
  ]);
  for(const r of [summary,cats,accounts,tx])if(r.error)throw r.error;
  s.dashboard=summary.data?.[0]||null;s.breakdown=cats.data||[];
  s.accounts=accounts.data||[];s.transactions=tx.data||[];
 }catch(ex){s.error=errorText(ex);}
 finally{s.loading=false;draw();}
}
function actionAsync(work){if(s.busy)return;s.busy=true;s.error="";s.message="";work().catch(x=>{s.error=errorText(x);}).finally(()=>{s.busy=false;draw();});}
document.addEventListener("click",ev=>{
 const page=ev.target.closest("[data-page]");if(page){s.page=page.dataset.page;draw();return;}
 const btn=ev.target.closest("[data-action]");if(!btn)return;
 const a=btn.dataset.action;
 if(a==="logout")actionAsync(async()=>{const r=await db.auth.signOut();if(r.error)throw r.error;await refresh();});
 if(a==="create-household")actionAsync(async()=>{const r=await db.rpc("finn_create_household",{p_label:"Nossa casa"});if(r.error)throw r.error;s.message="Família criada.";await refresh();});
 if(a==="invite")actionAsync(async()=>{const r=await db.rpc("finn_create_invite");if(r.error)throw r.error;s.invite=r.data;s.message="Convite válido por 48 horas.";});
 if(a==="copy-invite")actionAsync(async()=>{await navigator.clipboard.writeText(s.invite);s.message="Convite copiado.";});
});
document.addEventListener("submit",ev=>{
 if(ev.target.id==="auth-form"){
  ev.preventDefault();const form=ev.target;const email=form.elements.email.value.trim();const password=form.elements.password.value;
  const mode=ev.submitter?.value||"login";
  actionAsync(async()=>{
   if(mode==="signup"){
    const r=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
    if(r.error)throw r.error;
    s.message="Cadastro solicitado. Confirme o e-mail, caso necessário, e entre.";
   }else{
    const r=await db.auth.signInWithPassword({email,password});if(r.error)throw r.error;
    await refresh();
   }
  });
 }
 if(ev.target.id==="join-form"){ev.preventDefault();const code=ev.target.elements.code.value.trim();actionAsync(async()=>{const r=await db.rpc("finn_join_household",{p_code:code});if(r.error)throw r.error;await refresh();});}
});
document.addEventListener("change",ev=>{
 const control=ev.target.closest("[data-category-id]");if(!control)return;
 const id=control.dataset.categoryId;const c=control.value;
 if(!categories.includes(c))return;
 actionAsync(async()=>{const r=await db.from("transactions").update({category_override:c}).eq("id",id);if(r.error)throw r.error;await refresh();});
});
db.auth.onAuthStateChange((_event,_session)=>{queueMicrotask(()=>refresh());});
refresh();