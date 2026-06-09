/**
 * enriquecimento.js — Módulo Enriquecimento (Plano Mestre de Enriquecimento)
 * Integrado ao investAI sem alterar nada da base existente.
 */

const ENR_KEY = 'investai_enr_v1';

const ENR_DEFAULTS = {
  idade: 40,
  pjReceita:0, pjFolha:0, pjAluguel:0, pjImpostos:0, pjOutras:0,
  nFunc:1, proLabore:0,
  dividas: [],
  rendaEsposa:0,
  rendas: [],
  pfMoradia:0, pfEscola:0, pfSeguroCarro:0, pfVestuario:0,
  pfAlimFarmacia:0, pfCartaoOutros:0, pfOutras:0, rotativo:false,
  selic:14.5, ipca:4.8, cdi:14.4,
  investModo:'importar', totalManual:0,
  carteira:[],
  eventos:[],
  metas:[],
  historico:[],
};

let ENR = JSON.parse(JSON.stringify(ENR_DEFAULTS));
let ENR_SEC = 'empresa';
let _enrDebounce = null;
let _enrCharts = {};

function enrBrl(v) {
  return (isFinite(v)?v:0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
}
function enrId()  { return 'i'+Date.now()+Math.random().toString(36).slice(2,6); }
function enrHojeMais(d) { const x=new Date(); x.setDate(x.getDate()+d); return x.toISOString().slice(0,10); }

function enrTempoMeta(ja,alvo,aporte,taxaAnual) {
  if(ja>=alvo) return {meses:0,atingido:true};
  const r=Math.pow(1+taxaAnual/100,1/12)-1; let bal=ja;
  for(let m=1;m<=600;m++){bal=bal*(1+r)+aporte; if(bal>=alvo) return {meses:m,atingido:true};}
  return {meses:null,atingido:false};
}

function enrSerieMeta(ja,alvo,aporte,taxaAnual,mesesAlvo) {
  const r=Math.pow(1+taxaAnual/100,1/12)-1;
  const fim=mesesAlvo?Math.min(600,mesesAlvo+24):360;
  let bal=ja, bolso=ja;
  const serie=[{ano:0,valor:Math.round(bal),bolso:Math.round(bolso)}];
  for(let m=1;m<=fim;m++){
    bal=bal*(1+r)+aporte; bolso+=aporte;
    if(m%12===0) serie.push({ano:m/12,valor:Math.round(bal),bolso:Math.round(bolso)});
  }
  return serie;
}

function enrCalcMeta(meta) {
  const taxa=+meta.taxa, alvo=+meta.valorAlvo;
  const invs=meta.invs||[];
  const jaAplicado=invs.reduce((a,x)=>a+(+x.valor||0),0);
  const aporte=invs.reduce((a,x)=>a+(+x.recorrencia||0),0);
  const falta=Math.max(0,alvo-jaAplicado);
  const prog=alvo>0?Math.min(1,jaAplicado/alvo):0;
  const t=enrTempoMeta(jaAplicado,alvo,aporte,taxa);
  const serie=enrSerieMeta(jaAplicado,alvo,aporte,taxa,t.meses);
  let dataPrev=null;
  if(t.meses){const dp=new Date();dp.setMonth(dp.getMonth()+t.meses);dataPrev=dp;}
  let doBolso=null,juros=null;
  if(t.meses!=null){doBolso=jaAplicado+aporte*t.meses;juros=Math.max(0,alvo-doBolso);}
  return {taxa,alvo,invs,jaAplicado,aporte,falta,prog,t,serie,dataPrev,doBolso,juros};
}

function enrAcelerar(meta,c) {
  const out=[];
  if(c.jaAplicado>=c.alvo){out.push('Meta atingida. Considere realocar os aportes para outra meta.');return out;}
  const t1=enrTempoMeta(c.jaAplicado,c.alvo,c.aporte+500,c.taxa);
  if(c.t.meses&&t1.meses){const g=c.t.meses-t1.meses;if(g>0)out.push('Aumentar a recorrencia em R$ 500/mes antecipa a meta em '+g+' '+(g===1?'mes':'meses')+'.');}
  if(c.taxa<7){const t2=enrTempoMeta(c.jaAplicado,c.alvo,c.aporte,7.5);if(t2.meses&&c.t.meses){const g=c.t.meses-t2.meses;if(g>0)out.push('Buscar ~7,5% de juro real (Tesouro IPCA+) antecipa ~'+g+' meses.');}}
  if(c.aporte<=0)out.push('Adicione aportes mensais: sem recorrencia, so o rendimento trabalha.');
  if((meta.invs||[]).length===0)out.push('Adicione os investimentos desta meta para o calculo ser preciso.');
  if(out.length===0)out.push('No ritmo atual a meta esta no caminho. Mantenha a disciplina.');
  return out;
}

function enrIrAliquota(d) { return d<=180?0.225:d<=360?0.20:d<=720?0.175:0.15; }

function enrProjetarItem(it, macro) {
  const v=+it.valor||0, taxa=+it.taxa||0; let rAnual, risco=false;
  switch(it.tipo){
    case 'selic': rAnual=macro.selic; break;
    case 'cdi':   rAnual=macro.cdi*(taxa/100); break;
    case 'ipca':  rAnual=macro.ipca+taxa; break;
    case 'prefixado': rAnual=taxa; break;
    case 'fii':   rAnual=taxa; risco=true; break;
    default:      rAnual=taxa; risco=['acoes','fundo','cripto'].includes(it.tipo);
  }
  const bruto=v*(rAnual/100);
  let dias=545;
  if(it.dataAplic){const d0=new Date(it.dataAplic);const dH=new Date();dH.setFullYear(dH.getFullYear()+1);dias=Math.max(0,Math.round((dH-d0)/86400000));}
  const aliq=it.isento?0:(risco?0.15:enrIrAliquota(dias));
  const ir=bruto>0?bruto*aliq:0;
  const liquido=bruto-ir, valorFinal=v+liquido;
  let banda=null;
  if(risco){const bx=(rr)=>{const g=v*(rr/100),i=g>0?g*0.15:0;return v+g-i;};banda={pess:bx(rAnual-25),base:valorFinal,otim:bx(rAnual+25)};}
  return {rAnual,bruto,ir,liquido,valorFinal,risco,banda,aliq};
}

function enrMarcosIR(carteira) {
  const out=[];
  (carteira||[]).forEach(it=>{
    if(it.isento||['acoes','fundo','cripto','fii'].includes(it.tipo)||!it.dataAplic) return;
    const d0=new Date(it.dataAplic);
    [[361,0.175],[721,0.15]].forEach(([dias,aliq])=>{
      const d=new Date(d0); d.setDate(d.getDate()+dias);
      out.push({date:d.toISOString().slice(0,10),titulo:it.nome+': IR cai p/ '+(aliq*100).toFixed(1)+'%',tipo:'ir',alarme:0,desc:'A partir daqui resgatar paga menos imposto.'});
    });
  });
  return out;
}

function enrDiasAte(s) {
  const d=new Date(s+'T00:00:00');const h=new Date();h.setHours(0,0,0,0);return Math.round((d-h)/86400000);
}

function enrCalcDerived(s) {
  const macro={selic:+s.selic,ipca:+s.ipca,cdi:+s.cdi};
  const pjCustos=(+s.pjFolha)+(+s.pjAluguel)+(+s.pjImpostos)+(+s.pjOutras);
  const pjLucroApos=(+s.pjReceita)-pjCustos-(+s.proLabore);
  const pjMargem=+s.pjReceita>0?pjLucroApos/+s.pjReceita:0;
  const outrasRendas=(s.rendas||[]).reduce((a,x)=>a+(+x.valor||0),0);
  const rendaPF=(+s.proLabore)+(+s.rendaEsposa)+outrasRendas;
  const dividas=s.dividas||[];
  const totalDividas=dividas.reduce((a,x)=>a+(+x.valor||0),0);
  const parcelaMensalTotal=dividas.reduce((a,x)=>+x.parcelas>0?(+x.valor||0)/+x.parcelas:0,0);
  const comprometimento=+s.pjReceita>0?parcelaMensalTotal/+s.pjReceita:0;
  const pfDespesas=(+s.pfMoradia)+(+s.pfEscola)+(+s.pfSeguroCarro)+(+s.pfVestuario)+(+s.pfAlimFarmacia)+(+s.pfCartaoOutros)+(+s.pfOutras);
  const sobraPF=rendaPF-pfDespesas;
  const motor=sobraPF+Math.max(0,pjLucroApos);
  const itens=(s.carteira||[]).map(it=>({it,r:enrProjetarItem(it,macro)}));
  const carteiraTotal=itens.reduce((a,x)=>a+(+x.it.valor||0),0);
  const projBase=itens.reduce((a,x)=>a+x.r.valorFinal,0);
  const projPess=itens.reduce((a,x)=>a+(x.r.banda?x.r.banda.pess:x.r.valorFinal),0);
  const projOtim=itens.reduce((a,x)=>a+(x.r.banda?x.r.banda.otim:x.r.valorFinal),0);
  const ganhoBase=projBase-carteiraTotal;
  const metasCalc=(s.metas||[]).map(meta=>({meta,c:enrCalcMeta(meta)}));
  const somaAlvo=metasCalc.reduce((a,x)=>a+(isFinite(x.c.alvo)?x.c.alvo:0),0);
  const somaJa=metasCalc.reduce((a,x)=>a+x.c.jaAplicado,0);
  const somaFalta=metasCalc.reduce((a,x)=>a+x.c.falta,0);
  const aporteAlocado=metasCalc.reduce((a,x)=>a+x.c.aporte,0);
  const metaInvsTotal=somaJa;
  const totalAplicadoView=s.investModo==='manual'?(+s.totalManual||0):(carteiraTotal+metaInvsTotal);
  return {pjCustos,pjLucroApos,pjMargem,rendaPF,totalDividas,parcelaMensalTotal,comprometimento,pfDespesas,sobraPF,motor,itens,carteiraTotal,projBase,projPess,projOtim,ganhoBase,metasCalc,somaAlvo,somaJa,somaFalta,aporteAlocado,metaInvsTotal,totalAplicadoView,macro};
}

async function enrLoad() {
  try {
    const sess=Auth.getSession();
    if(sess?.token) {
      const res=await fetch('/wnrinvestai/api/data',{headers:{'Authorization':'Bearer '+sess.token}});
      if(res.ok) {
        const data=await res.json();
        if(data[ENR_KEY]) { try{ENR={...ENR_DEFAULTS,...JSON.parse(data[ENR_KEY])};return;}catch(_){} }
      }
    }
  } catch(_) {}
  try {
    const raw=localStorage.getItem(Auth.prefix()+ENR_KEY);
    if(raw) ENR={...ENR_DEFAULTS,...JSON.parse(raw)};
  } catch(_) {}
}

function enrSave() {
  try { localStorage.setItem(Auth.prefix()+ENR_KEY,JSON.stringify(ENR)); } catch(_) {}
  clearTimeout(_enrDebounce);
  _enrDebounce=setTimeout(async()=>{
    try {
      const sess=Auth.getSession();
      if(!sess?.token) return;
      await fetch('/wnrinvestai/api/data/'+encodeURIComponent(ENR_KEY),{
        method:'PUT',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+sess.token},
        body:JSON.stringify({v:JSON.stringify(ENR)}),
        signal:(typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(8000):undefined),
      });
    } catch(_) {}
  },800);
}

function enrSet(k,v){ENR[k]=v;enrSave();renderEnriquecimento();}
function enrSetItem(id,k,v){ENR.carteira=(ENR.carteira||[]).map(c=>c.id===id?{...c,[k]:v}:c);enrSave();renderEnriquecimento();}
function enrAddItem(){ENR.carteira=[...(ENR.carteira||[]),{id:enrId(),nome:'Novo ativo',instituicao:'',tipo:'selic',valor:0,taxa:0,isento:false,dataAplic:enrHojeMais(0)}];enrSave();renderEnriquecimento();}
function enrDelItem(id){ENR.carteira=(ENR.carteira||[]).filter(c=>c.id!==id);enrSave();renderEnriquecimento();}
function enrSetEvento(id,k,v){ENR.eventos=(ENR.eventos||[]).map(e=>e.id===id?{...e,[k]:v}:e);enrSave();renderEnriquecimento();}
function enrAddEvento(){ENR.eventos=[...(ENR.eventos||[]),{id:enrId(),date:enrHojeMais(7),titulo:'Novo lembrete',tipo:'aportar',alarme:1}];enrSave();renderEnriquecimento();}
function enrDelEvento(id){ENR.eventos=(ENR.eventos||[]).filter(e=>e.id!==id);enrSave();renderEnriquecimento();}
function enrSetMeta(id,k,v){ENR.metas=(ENR.metas||[]).map(m=>m.id===id?{...m,[k]:v}:m);enrSave();renderEnriquecimento();}
function enrAddMeta(){ENR.metas=[...(ENR.metas||[]),{id:enrId(),nome:'Nova meta',valorAlvo:50000,taxa:7.5,invs:[]}];enrSave();renderEnriquecimento();}
function enrDelMeta(id){ENR.metas=(ENR.metas||[]).filter(m=>m.id!==id);enrSave();renderEnriquecimento();}
function enrAddInv(mid){ENR.metas=(ENR.metas||[]).map(m=>m.id===mid?{...m,invs:[...(m.invs||[]),{id:enrId(),investimento:'',tipo:'',valor:0,recorrencia:0}]}:m);enrSave();renderEnriquecimento();}
function enrSetInv(mid,iid,k,v){ENR.metas=(ENR.metas||[]).map(m=>m.id===mid?{...m,invs:(m.invs||[]).map(x=>x.id===iid?{...x,[k]:v}:x)}:m);enrSave();renderEnriquecimento();}
function enrDelInv(mid,iid){ENR.metas=(ENR.metas||[]).map(m=>m.id===mid?{...m,invs:(m.invs||[]).filter(x=>x.id!==iid)}:m);enrSave();renderEnriquecimento();}
function enrAddDivida(){ENR.dividas=[...(ENR.dividas||[]),{id:enrId(),identificacao:'',valor:0,parcelas:0}];enrSave();renderEnriquecimento();}
function enrSetDivida(id,k,v){ENR.dividas=(ENR.dividas||[]).map(x=>x.id===id?{...x,[k]:v}:x);enrSave();renderEnriquecimento();}
function enrDelDivida(id){ENR.dividas=(ENR.dividas||[]).filter(x=>x.id!==id);enrSave();renderEnriquecimento();}
function enrAddRenda(){ENR.rendas=[...(ENR.rendas||[]),{id:enrId(),tipo:'',valor:0}];enrSave();renderEnriquecimento();}
function enrSetRenda(id,k,v){ENR.rendas=(ENR.rendas||[]).map(x=>x.id===id?{...x,[k]:v}:x);enrSave();renderEnriquecimento();}
function enrDelRenda(id){ENR.rendas=(ENR.rendas||[]).filter(x=>x.id!==id);enrSave();renderEnriquecimento();}
function enrDelHistorico(id){ENR.historico=(ENR.historico||[]).filter(x=>x.id!==id);enrSave();renderEnriquecimento();}

function enrNav(sec){ENR_SEC=sec;renderEnriquecimento();}

const ENR_EV_FIXOS=[
  {date:'2026-06-17',titulo:'COPOM - decisao da Selic',tipo:'copom',alarme:1,desc:'Afeta seus pos-fixados.'},
  {date:'2026-08-05',titulo:'COPOM - decisao da Selic',tipo:'copom',alarme:1},
  {date:'2026-09-16',titulo:'COPOM - decisao da Selic',tipo:'copom',alarme:1},
  {date:'2026-11-04',titulo:'COPOM - decisao da Selic',tipo:'copom',alarme:1},
  {date:'2026-12-09',titulo:'COPOM - decisao da Selic',tipo:'copom',alarme:1},
  {date:'2026-07-10',titulo:'IPCA - divulgacao (~)',tipo:'ipca',alarme:0},
  {date:'2026-08-11',titulo:'IPCA - divulgacao (~)',tipo:'ipca',alarme:0},
  {date:'2026-09-10',titulo:'IPCA - divulgacao (~)',tipo:'ipca',alarme:0},
  {date:'2026-10-09',titulo:'IPCA - divulgacao (~)',tipo:'ipca',alarme:0},
];

const ENR_TIPOS={selic:'Pos-fixado (Selic)',cdi:'CDB % CDI',ipca:'Tesouro IPCA+',prefixado:'Prefixado',fii:'FII',acoes:'Acoes/IPO',fundo:'Fundo',cripto:'Cripto',outro:'Outro'};
const _eS='background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-primary);font-size:12.5px;font-family:var(--font-mono)';

function _enrNInput(label,val,fn) {
  return '<label style="display:block;margin-bottom:10px"><span style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">'+label+'</span><div style="display:flex;align-items:center;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px"><span style="color:var(--text-tertiary);font-size:12px;margin-right:5px">R$</span><input type="number" value="'+val+'" oninput="'+fn+'" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-primary);font-size:13px;padding:9px 0;font-family:var(--font-mono)"></div></label>';
}
function _enrRow(k,v,col) {
  col=col||'var(--text-secondary)';
  return '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span style="color:var(--text-tertiary)">'+k+'</span><span style="color:'+col+';font-weight:600">'+v+'</span></div>';
}
function _enrBig(k,v,col) {
  col=col||'var(--gold)';
  return '<div style="margin-right:16px;margin-bottom:8px"><div style="font-size:9.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em">'+k+'</div><div style="font-family:var(--font-serif,serif);font-size:19px;color:'+col+';margin-top:2px">'+v+'</div></div>';
}
function _enrCard(inner,style) {
  style=style||'';
  return '<div style="background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;'+style+'">'+inner+'</div>';
}
function _enrHead(badge,col,title,sub) {
  return '<div style="border-left:3px solid '+col+';padding-left:12px;margin-bottom:16px"><span style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:'+col+'">'+badge+'</span><div style="font-family:var(--font-serif,serif);font-size:20px;font-weight:600;margin:3px 0 0">'+title+'</div>'+(sub?'<p style="color:var(--text-tertiary);font-size:12px;margin:4px 0 0;line-height:1.5;max-width:600px">'+sub+'</p>':'')+'</div>';
}

function enrHtmlEmpresa(s,d) {
  var divs=(s.dividas||[]).map(function(dv){
    var parc=+dv.parcelas>0?(+dv.valor||0)/+dv.parcelas:0;
    return '<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input value="'+(dv.identificacao||'').replace(/"/g,'')+'" placeholder="Identificacao (ex.: Pronampe)" oninput="enrSetDivida(\''+dv.id+'\',\'identificacao\',this.value)" style="flex:1;'+_eS+'"><button onclick="enrDelDivida(\''+dv.id+'\')" style="background:transparent;border:none;cursor:pointer;color:var(--text-tertiary);font-size:16px">x</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label><span style="font-size:10px;color:var(--text-tertiary);display:block;margin-bottom:3px">Valor (saldo)</span><input type="number" value="'+dv.valor+'" oninput="enrSetDivida(\''+dv.id+'\',\'valor\',+this.value||0)" style="width:100%;box-sizing:border-box;'+_eS+'"></label><label><span style="font-size:10px;color:var(--text-tertiary);display:block;margin-bottom:3px">Parcelas (qtd)</span><input type="number" value="'+dv.parcelas+'" oninput="enrSetDivida(\''+dv.id+'\',\'parcelas\',+this.value||0)" style="width:100%;box-sizing:border-box;'+_eS+'"></label></div><div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Parcela mensal: <b style="color:var(--text-primary)">'+enrBrl(parc)+'</b></div></div>';
  }).join('');
  var cCol=d.comprometimento>=0.3?'var(--red)':d.comprometimento>=0.15?'var(--amber)':'var(--green)';
  return _enrHead('Pessoa Juridica - O Motor','#5B9BD5','Empresa','Onde o dinheiro nasce. Preencha os numeros reais da empresa.')+
    '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px">'+
    _enrCard(
      _enrNInput('Faturamento mensal medio',s.pjReceita,"enrSet('pjReceita',+this.value||0)")+
      _enrNInput('Folha dos funcionarios',s.pjFolha,"enrSet('pjFolha',+this.value||0)")+
      '<label style="display:block;margin-bottom:10px"><span style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">No de funcionarios</span><input type="number" value="'+s.nFunc+'" oninput="enrSet(\'nFunc\',+this.value||0)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      _enrNInput('Aluguel',s.pjAluguel,"enrSet('pjAluguel',+this.value||0)")+
      _enrNInput('Impostos (mes)',s.pjImpostos,"enrSet('pjImpostos',+this.value||0)")+
      _enrNInput('Outras despesas operacionais',s.pjOutras,"enrSet('pjOutras',+this.value||0)")+
      _enrNInput('Seu pro-labore (ponte p/ Familia)',s.proLabore,"enrSet('proLabore',+this.value||0)")
    )+
    '<div>'+
    _enrCard(
      _enrRow('Custos operacionais',enrBrl(d.pjCustos))+
      _enrRow('(-) Pro-labore',enrBrl(s.proLabore))+
      _enrRow('Lucro distribuivel',enrBrl(d.pjLucroApos),d.pjLucroApos>=0?'var(--green)':'var(--red)')+
      _enrRow('Margem',+s.pjReceita>0?(d.pjMargem*100).toFixed(1)+'%':'-'),
    'margin-bottom:12px')+
    _enrCard(
      '<div style="font-size:13px;font-weight:600;margin-bottom:10px">Dividas variaveis</div>'+divs+
      '<button onclick="enrAddDivida()" style="padding:8px 12px;border-radius:6px;cursor:pointer;border:1px dashed var(--border);background:transparent;color:var(--gold);font-size:12px;font-weight:600;margin-bottom:10px">+ Adicionar divida</button>'+
      _enrRow('Total dividas',enrBrl(d.totalDividas))+
      _enrRow('Parcela mensal total',enrBrl(d.parcelaMensalTotal)+'/mes','var(--amber)')+
      _enrRow('Comprometimento fat.',(d.comprometimento*100).toFixed(1)+'%',cCol)
    )+'</div></div>';
}

function enrHtmlFamilia(s,d) {
  var rendas=(s.rendas||[]).map(function(r){
    return '<div style="display:grid;grid-template-columns:1.3fr 1fr 28px;gap:8px;align-items:center;margin-bottom:8px"><input value="'+(r.tipo||'').replace(/"/g,'')+'" placeholder="Aluguel, freelancer..." oninput="enrSetRenda(\''+r.id+'\',\'tipo\',this.value)" style="'+_eS+'"><input type="number" value="'+r.valor+'" oninput="enrSetRenda(\''+r.id+'\',\'valor\',+this.value||0)" style="'+_eS+'"><button onclick="enrDelRenda(\''+r.id+'\')" style="background:transparent;border:none;cursor:pointer;color:var(--text-tertiary);font-size:16px">x</button></div>';
  }).join('');
  return _enrHead('Pessoa Fisica - O Reservatorio','var(--gold)','Familia','Renda, despesas e motor de poupanca familiar.')+
    '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px">'+
    _enrCard(
      '<div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Renda que entra</div>'+
      '<label style="display:block;margin-bottom:10px"><span style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">Pro-labore (so leitura — vem da Empresa)</span><div style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:9px 10px;color:var(--text-tertiary);font-size:13px;font-family:var(--font-mono)">'+enrBrl(s.proLabore)+'</div></label>'+
      _enrNInput('Salario CLT do conjuge',s.rendaEsposa,"enrSet('rendaEsposa',+this.value||0)")+
      '<div style="font-size:11px;color:var(--text-tertiary);margin:4px 0 8px">Outras rendas</div>'+rendas+
      '<button onclick="enrAddRenda()" style="padding:8px 12px;border-radius:6px;cursor:pointer;border:1px dashed var(--border);background:transparent;color:var(--gold);font-size:12px;font-weight:600;margin-bottom:8px">+ Adicionar renda</button>'+
      '<div style="border-top:1px solid var(--border);margin:8px 0 0;padding-top:8px">'+_enrRow('Renda total familiar',enrBrl(d.rendaPF),'var(--text-primary)')+'</div>'
    )+
    _enrCard(
      '<div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Despesas que saem</div>'+
      _enrNInput('Moradia',s.pfMoradia,"enrSet('pfMoradia',+this.value||0)")+
      _enrNInput('Escola',s.pfEscola,"enrSet('pfEscola',+this.value||0)")+
      _enrNInput('Seguro do carro',s.pfSeguroCarro,"enrSet('pfSeguroCarro',+this.value||0)")+
      _enrNInput('Vestuario',s.pfVestuario,"enrSet('pfVestuario',+this.value||0)")+
      _enrNInput('Cartao - alim. + farmacia',s.pfAlimFarmacia,"enrSet('pfAlimFarmacia',+this.value||0)")+
      _enrNInput('Cartao - demais gastos',s.pfCartaoOutros,"enrSet('pfCartaoOutros',+this.value||0)")+
      _enrNInput('Outras despesas',s.pfOutras,"enrSet('pfOutras',+this.value||0)")+
      '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-tertiary);cursor:pointer;margin-top:4px"><input type="checkbox" '+(s.rotativo?'checked':'')+' onchange="enrSet(\'rotativo\',this.checked)"> Estou no rotativo do cartao</label>'+
      '<div style="border-top:1px solid var(--border);margin:10px 0 0;padding-top:8px">'+
      _enrRow('Despesas PF',enrBrl(d.pfDespesas))+
      _enrRow('Sobra -> investir',enrBrl(d.sobraPF),d.sobraPF>=0?'var(--green)':'var(--red)')+
      _enrRow('Motor de poupanca',enrBrl(d.motor),d.motor>0?'var(--green)':'var(--red)')+'</div>'
    )+'</div>';
}

function enrHtmlInvest(s,d) {
  var itens=d.itens.map(function(pair){
    var it=pair.it, r=pair.r;
    var taxaField=['cdi','ipca','prefixado','fii','acoes','fundo','cripto'].includes(it.tipo)?
      '<label><span style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:4px">'+(it.tipo==='cdi'?'% do CDI':it.tipo==='ipca'?'IPCA +':'Taxa % a.a.')+'</span><input type="number" value="'+it.taxa+'" oninput="enrSetItem(\''+it.id+'\',\'taxa\',+this.value||0)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>':'';
    var tipoOpts=Object.entries(ENR_TIPOS).map(function(e){return '<option value="'+e[0]+'" '+(it.tipo===e[0]?'selected':'')+'>'+e[1]+'</option>';}).join('');
    return _enrCard(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><input value="'+(it.nome||'').replace(/"/g,'')+'" oninput="enrSetItem(\''+it.id+'\',\'nome\',this.value)" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-primary);font-family:var(--font-serif,serif);font-size:15px"><button onclick="enrDelItem(\''+it.id+'\')" style="background:transparent;border:none;cursor:pointer;color:var(--text-tertiary);font-size:16px;padding:0 4px">x</button></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:10px">'+
      '<label><span style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:4px">Tipo</span><select onchange="enrSetItem(\''+it.id+'\',\'tipo\',this.value)" style="width:100%;'+_eS+'">'+tipoOpts+'</select></label>'+
      '<label><span style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:4px">Instituicao</span><input value="'+(it.instituicao||'').replace(/"/g,'')+'" oninput="enrSetItem(\''+it.id+'\',\'instituicao\',this.value)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      '<label><span style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:4px">Valor aplicado</span><input type="number" value="'+it.valor+'" oninput="enrSetItem(\''+it.id+'\',\'valor\',+this.value||0)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      taxaField+
      '<label><span style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:4px">Data aplicacao</span><input type="date" value="'+(it.dataAplic||'')+'" onchange="enrSetItem(\''+it.id+'\',\'dataAplic\',this.value)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-tertiary);align-self:end;padding-bottom:9px;cursor:pointer"><input type="checkbox" '+(it.isento?'checked':'')+' onchange="enrSetItem(\''+it.id+'\',\'isento\',this.checked)"> Isento de IR</label>'+
      '</div>'+
      '<div style="padding:10px;border-radius:8px;background:var(--surface-2);border:1px solid var(--border);display:flex;flex-wrap:wrap;gap:16px">'+
      '<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Rend. bruto 12m</div><div style="font-size:12.5px;color:var(--green);font-weight:600;margin-top:2px">'+r.rAnual.toFixed(1)+'% - '+enrBrl(r.bruto)+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">IR ('+((r.aliq*100).toFixed(1))+'%)</div><div style="font-size:12.5px;color:var(--text-tertiary);font-weight:600;margin-top:2px">'+enrBrl(-r.ir)+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Valor 12m (liq.)</div><div style="font-size:12.5px;color:var(--gold);font-weight:600;margin-top:2px">'+enrBrl(r.valorFinal)+'</div></div>'+
      (r.banda?'<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Faixa</div><div style="font-size:12px;color:var(--text-secondary);font-weight:600;margin-top:2px">'+enrBrl(r.banda.pess)+' - '+enrBrl(r.banda.otim)+'</div></div>':'')+
      '</div>',
    'margin-bottom:10px');
  }).join('');
  return _enrHead('Pessoa Fisica - Patrimonio','var(--gold)','Investimentos','Carteira pessoal e projecao liquida de IR para 12 meses.')+
    '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:16px">'+
    _enrBig('Total aplicado',enrBrl(d.totalAplicadoView))+
    _enrBig('Projecao 12m (liq.)',enrBrl(d.projBase),'var(--gold)')+
    _enrBig('Ganho projetado',enrBrl(d.ganhoBase),d.ganhoBase>=0?'var(--green)':'var(--red)')+
    '</div>'+
    _enrCard(
      '<div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:10px">Premissas macro (edite para testar cenarios)</div>'+
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">'+
      '<label><span style="font-size:10px;color:var(--text-tertiary);display:block;margin-bottom:4px">Selic % a.a.</span><input type="number" value="'+s.selic+'" oninput="enrSet(\'selic\',+this.value||14.5)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      '<label><span style="font-size:10px;color:var(--text-tertiary);display:block;margin-bottom:4px">CDI % a.a.</span><input type="number" value="'+s.cdi+'" oninput="enrSet(\'cdi\',+this.value||14.4)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      '<label><span style="font-size:10px;color:var(--text-tertiary);display:block;margin-bottom:4px">IPCA % a.a.</span><input type="number" value="'+s.ipca+'" oninput="enrSet(\'ipca\',+this.value||4.8)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      '</div>',
    'margin-bottom:12px')+
    itens+
    '<button onclick="enrAddItem()" style="padding:10px 14px;border-radius:6px;cursor:pointer;border:1px dashed var(--border);background:transparent;color:var(--gold);font-size:12.5px;font-weight:600">+ Adicionar ativo</button>';
}

function enrHtmlMetas(s,d) {
  var metasHtml=d.metasCalc.map(function(pair){
    var meta=pair.meta, c=pair.c;
    var invs=(meta.invs||[]).map(function(inv){
      return '<div style="display:grid;grid-template-columns:1.2fr 1.2fr 1fr 1fr 28px;gap:8px;align-items:center;margin-bottom:8px">'+
        '<input value="'+(inv.investimento||'').replace(/"/g,'')+'" placeholder="Fundo Imobiliario" oninput="enrSetInv(\''+meta.id+'\',\''+inv.id+'\',\'investimento\',this.value)" style="'+_eS+'">'+
        '<input value="'+(inv.tipo||'').replace(/"/g,'')+'" placeholder="XPML11" oninput="enrSetInv(\''+meta.id+'\',\''+inv.id+'\',\'tipo\',this.value)" style="'+_eS+'">'+
        '<input type="number" value="'+inv.valor+'" oninput="enrSetInv(\''+meta.id+'\',\''+inv.id+'\',\'valor\',+this.value||0)" style="'+_eS+'">'+
        '<input type="number" value="'+inv.recorrencia+'" oninput="enrSetInv(\''+meta.id+'\',\''+inv.id+'\',\'recorrencia\',+this.value||0)" style="'+_eS+'">'+
        '<button onclick="enrDelInv(\''+meta.id+'\',\''+inv.id+'\')" style="background:transparent;border:none;cursor:pointer;color:var(--text-tertiary);font-size:16px">x</button></div>';
    }).join('');
    var acel=enrAcelerar(meta,c).map(function(t){return '<div style="display:flex;gap:7px;font-size:12px;color:var(--text-tertiary);line-height:1.5;margin-bottom:5px"><span style="flex-shrink:0">-&gt;</span><span>'+t+'</span></div>';}).join('');
    var prog=Math.round(c.prog*100);
    var tempo=c.t.meses===0?'Atingida':c.t.meses?(c.t.meses/12).toFixed(1)+' anos':'+50 anos';
    var cid='enr-chart-'+meta.id;
    var composicao='';
    if(c.doBolso!=null){
      composicao=_enrCard(
        '<div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Composicao ao atingir</div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:8px">'+
        '<div><div style="font-size:10px;color:var(--text-tertiary)">Do seu bolso</div><div style="font-size:12.5px;font-weight:600;color:#5B9BD5">'+enrBrl(c.doBolso)+(c.alvo>0?' - '+((c.doBolso/c.alvo)*100).toFixed(0)+'%':'')+'</div></div>'+
        '<div><div style="font-size:10px;color:var(--text-tertiary)">Juros compostos</div><div style="font-size:12.5px;font-weight:600;color:var(--green)">'+enrBrl(c.juros)+(c.alvo>0?' - '+((c.juros/c.alvo)*100).toFixed(0)+'%':'')+'</div></div>'+
        '</div>'+
        '<div style="display:flex;height:7px;border-radius:5px;overflow:hidden;border:1px solid var(--border)"><div style="width:'+(c.alvo>0?(c.doBolso/c.alvo)*100:0)+'%;background:#5B9BD5"></div><div style="flex:1;background:var(--green)"></div></div>',
      'background:var(--surface-2);margin-bottom:10px');
    }
    return _enrCard(
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;gap:10px">'+
      '<input value="'+(meta.nome||'').replace(/"/g,'')+'" oninput="enrSetMeta(\''+meta.id+'\',\'nome\',this.value)" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-primary);font-family:var(--font-serif,serif);font-size:17px">'+
      '<button onclick="enrDelMeta(\''+meta.id+'\')" style="background:transparent;border:none;cursor:pointer;color:var(--text-tertiary);font-size:16px;padding:0 4px">x</button></div>'+
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:16px">'+
      '<div>'+
      '<label style="display:block;margin-bottom:10px"><span style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">Valor alvo</span><div style="display:flex;align-items:center;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:0 10px"><span style="color:var(--text-tertiary);font-size:12px;margin-right:5px">R$</span><input type="number" value="'+meta.valorAlvo+'" oninput="enrSetMeta(\''+meta.id+'\',\'valorAlvo\',+this.value||0)" style="flex:1;background:transparent;border:none;outline:none;color:var(--text-primary);font-size:13px;padding:9px 0;font-family:var(--font-mono)"></div></label>'+
      '<label style="display:block;margin-bottom:12px"><span style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">Rendimento esperado (% a.a.)</span><input type="number" value="'+meta.taxa+'" oninput="enrSetMeta(\''+meta.id+'\',\'taxa\',+this.value||0)" style="width:100%;box-sizing:border-box;'+_eS+'"></label>'+
      _enrCard(_enrRow('Ja aplicado',enrBrl(c.jaAplicado),'var(--text-primary)')+_enrRow('Aporte mensal',enrBrl(c.aporte)+'/mes',c.aporte>0?'var(--green)':'var(--text-tertiary)'),'background:var(--surface-2)')+
      '</div>'+
      '<div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:12px">'+
      '<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Falta</div><div style="font-size:14px;font-weight:600;color:'+(c.falta>0?'var(--amber)':'var(--green)')+';margin-top:2px">'+enrBrl(c.falta)+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Prazo</div><div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-top:2px">'+tempo+'</div></div>'+
      (c.dataPrev?'<div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase">Previsao</div><div style="font-size:13px;font-weight:600;color:var(--text-tertiary);margin-top:2px">'+c.dataPrev.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})+'</div></div>':'')+
      '</div>'+
      '<div style="height:8px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;margin-bottom:4px"><div style="height:100%;width:'+prog+'%;background:'+(c.prog>=1?'var(--green)':'var(--gold)')+'"></div></div>'+
      '<div style="font-size:10px;color:var(--text-tertiary);margin-bottom:10px">'+prog+'% do caminho</div>'+
      composicao+
      '<canvas id="'+cid+'" height="120" style="width:100%;max-height:120px"></canvas>'+
      '</div></div>'+
      '<div style="margin-top:16px">'+
      '<div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:3px">Investimentos desta meta</div>'+
      ((meta.invs||[]).length>0?'<div style="display:grid;grid-template-columns:1.2fr 1.2fr 1fr 1fr 28px;gap:8px;font-size:10px;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:6px"><span>Investimento</span><span>Tipo</span><span>Valor</span><span>Recorrencia/mes</span><span></span></div>':'')+
      invs+
      ((meta.invs||[]).length===0?'<div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:8px">Nenhum investimento ainda.</div>':'')+
      '<button onclick="enrAddInv(\''+meta.id+'\')" style="padding:8px 12px;border-radius:6px;cursor:pointer;border:1px dashed var(--border);background:transparent;color:var(--gold);font-size:12px;font-weight:600;margin-top:4px">+ Adicionar investimento</button></div>'+
      _enrCard('<div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:8px">Como acelerar</div>'+acel,'background:var(--surface-2)'),
    'margin-bottom:12px');
  }).join('');
  return _enrHead('Metas - Objetivos Financeiros','var(--green)','Metas','Multiplas metas com prazo, grafico de projecao e sugestoes.')+
    '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px">'+
    _enrBig('Soma das metas',enrBrl(d.somaAlvo),'var(--gold)')+
    _enrBig('Ja aplicado',enrBrl(d.somaJa),'var(--text-primary)')+
    _enrBig('Falta total',enrBrl(d.somaFalta),d.somaFalta>0?'var(--amber)':'var(--green)')+
    _enrBig('Aporte/motor',enrBrl(d.aporteAlocado)+' / '+enrBrl(d.motor),d.aporteAlocado<=d.motor?'var(--green)':'var(--red)')+
    '</div>'+
    (d.aporteAlocado>d.motor?'<div style="padding:12px;border-radius:8px;background:rgba(229,84,75,.08);border:1px solid var(--red);margin-bottom:14px;font-size:12.5px;color:var(--red);line-height:1.5">Voce alocou '+enrBrl(d.aporteAlocado)+'/mes em metas, mas seu motor e '+enrBrl(d.motor)+'/mes.</div>':'')+
    metasHtml+
    '<button onclick="enrAddMeta()" style="padding:10px 14px;border-radius:6px;cursor:pointer;border:1px dashed var(--border);background:transparent;color:var(--green);font-size:12.5px;font-weight:600;margin-bottom:16px">+ Nova meta</button>';
}

function enrHtmlAgenda(s) {
  var marcosIR=enrMarcosIR(s.carteira||[]);
  var agenda=[...ENR_EV_FIXOS,...marcosIR,...(s.eventos||[])].map(function(e){return Object.assign({},e,{dias:enrDiasAte(e.date)});}).filter(function(e){return e.dias>=0;}).sort(function(a,b){return a.dias-b.dias;});
  var COR={ipo:'var(--gold)',copom:'#5B9BD5',ipca:'var(--amber)',ir:'var(--green)',aportar:'var(--green)',retirar:'var(--red)',revisar:'var(--text-tertiary)'};
  var LAB={ipo:'IPO',copom:'COPOM',ipca:'IPCA',ir:'IR',aportar:'Aporte',retirar:'Resgate',revisar:'Revisao'};
  var evEd=(s.eventos||[]).map(function(e){
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 0;border-top:1px solid var(--border)">'+
      '<input type="date" value="'+e.date+'" onchange="enrSetEvento(\''+e.id+'\',\'date\',this.value)" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px">'+
      '<input value="'+(e.titulo||'').replace(/"/g,'')+'" onchange="enrSetEvento(\''+e.id+'\',\'titulo\',this.value)" style="flex:1;min-width:120px;'+_eS+'">'+
      '<select onchange="enrSetEvento(\''+e.id+'\',\'tipo\',this.value)" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text-primary);font-size:12px"><option value="aportar" '+(e.tipo==='aportar'?'selected':'')+'>Aporte</option><option value="retirar" '+(e.tipo==='retirar'?'selected':'')+'>Resgate</option><option value="revisar" '+(e.tipo==='revisar'?'selected':'')+'>Revisao</option></select>'+
      '<button onclick="enrDelEvento(\''+e.id+'\')" style="background:transparent;border:none;cursor:pointer;color:var(--text-tertiary);font-size:16px">x</button></div>';
  }).join('');
  var evList=agenda.map(function(e){
    var c=COR[e.tipo]||'var(--text-tertiary)';
    return '<div style="display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:10px;background:var(--surface-1);border:1px solid var(--border);margin-bottom:8px">'+
      '<div style="text-align:center;min-width:46px"><div style="font-family:var(--font-serif,serif);font-size:18px;color:'+(e.dias<=7?'var(--gold)':'var(--text-primary)')+'">'+e.dias+'</div><div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase">'+(e.dias===0?'hoje':e.dias===1?'dia':'dias')+'</div></div>'+
      '<div style="width:1px;align-self:stretch;background:var(--border)"></div>'+
      '<div style="flex:1"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><span style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:'+c+';border:1px solid '+c+';border-radius:4px;padding:2px 6px">'+(LAB[e.tipo]||e.tipo)+'</span><span style="font-size:13px;font-weight:600">'+e.titulo+'</span></div>'+
      '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">'+new Date(e.date+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})+'</div>'+
      (e.desc?'<div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px;line-height:1.5">'+e.desc+'</div>':'')+
      '</div></div>';
  }).join('');
  return _enrHead('Calendario - Agenda Financeira','#5B9BD5','Agenda','Eventos de mercado + marcos de IR + lembretes proprios.')+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button onclick="enrBaixarICS()" style="padding:10px 14px;border-radius:6px;cursor:pointer;border:1px solid var(--gold);background:rgba(184,150,90,.10);color:var(--gold);font-size:12.5px;font-weight:600">Exportar .ics</button><button onclick="enrAddEvento()" style="padding:10px 14px;border-radius:6px;cursor:pointer;border:1px dashed var(--border);background:transparent;color:var(--text-tertiary);font-size:12.5px;font-weight:600">+ Meu lembrete</button></div>'+
    ((s.eventos||[]).length>0?_enrCard('<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:10px">Meus lembretes (editaveis)</div>'+evEd,'margin-bottom:12px'):'')+
    '<div style="font-family:var(--font-serif,serif);font-size:16px;margin:4px 0 12px">Proximos eventos</div>'+
    (evList||'<p style="color:var(--text-tertiary);font-size:12px">Nenhum evento futuro.</p>');
}

function enrHtmlOrienta(s) {
  var hist=(s.historico||[]).map(function(h){
    return _enrCard(
      '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">'+new Date(h.data).toLocaleString('pt-BR')+'</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:10px"><span style="color:var(--gold);font-weight:700;font-size:12px;flex-shrink:0">Voce</span><div style="font-size:13px;color:var(--text-primary);line-height:1.5">'+h.q+'</div></div>'+
      '<div style="display:flex;gap:8px;border-top:1px solid var(--border);padding-top:10px"><span style="color:#5B9BD5;font-weight:700;font-size:12px;flex-shrink:0">IA</span><div style="font-size:13px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap">'+h.a+'</div></div>'+
      '<button onclick="enrDelHistorico(\''+h.id+'\')" style="margin-top:8px;background:transparent;border:none;cursor:pointer;color:var(--text-tertiary);font-size:11px">x remover</button>',
    'margin-bottom:10px');
  }).join('');
  return _enrHead('Mesa de Orientacao - IA','var(--gold)','Orientacao com IA','Seus numeros ja viram contexto automatico — a IA responde sabendo sua situacao.')+
    _enrCard(
      '<textarea id="enr-pergunta" rows="4" placeholder="Ex.: quero investir R$ 20 mil em Tesouro IPCA+ e FIIs. O que voce sugere dado meu perfil?" style="width:100%;box-sizing:border-box;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;color:var(--text-primary);font-size:13px;line-height:1.55;resize:vertical;outline:none;font-family:var(--font-sans)"></textarea>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">'+
      '<button onclick="enrEnviar()" id="enr-btn-enviar" style="padding:10px 16px;border-radius:8px;cursor:pointer;border:none;background:var(--gold);color:#0A0D13;font-size:13px;font-weight:700;font-family:var(--font-sans)">Perguntar</button>'+
      '<button onclick="enrCopiarContexto()" id="enr-btn-copiar" style="padding:10px 14px;border-radius:8px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-tertiary);font-size:13px;font-weight:600;font-family:var(--font-sans)">Copiar contexto + pergunta</button>'+
      '</div><div id="enr-erro" style="display:none;margin-top:10px;padding:10px;border-radius:8px;background:rgba(229,84,75,.08);border:1px solid var(--red);color:var(--red);font-size:12px;line-height:1.5"></div>',
    'margin-bottom:14px')+
    ((s.historico||[]).length>0?'<div style="font-family:var(--font-serif,serif);font-size:16px;margin:4px 0 12px">Historico de orientacoes</div>':'')+
    hist;
}

function enrBaixarICS() {
  var all=[...ENR_EV_FIXOS,...enrMarcosIR(ENR.carteira||[]),...(ENR.eventos||[])];
  var pad=function(n){return String(n).padStart(2,'0');};
  var fmt=function(d){return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate());};
  var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//investAI//ENR//PT-BR'];
  all.forEach(function(e,i){
    var d=new Date(e.date+'T09:00:00');
    lines.push('BEGIN:VEVENT','UID:enr-'+i+'@wnr','DTSTART;VALUE=DATE:'+fmt(d),'SUMMARY:'+(e.titulo||'').replace(/[\n,]/g,' '),'BEGIN:VALARM','TRIGGER:-P'+(e.alarme||1)+'D','ACTION:DISPLAY','DESCRIPTION:InvestAI','END:VALARM','END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  var blob=new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'});
  var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='investai-agenda.ics';a.click();URL.revokeObjectURL(url);
}

function enrSnapshot(s,d) {
  return [
    'Idade: '+s.idade+'.',
    'EMPRESA (PJ): faturamento '+enrBrl(+s.pjReceita)+', custos '+enrBrl(d.pjCustos)+', pro-labore '+enrBrl(+s.proLabore)+', lucro '+enrBrl(d.pjLucroApos)+', margem '+(d.pjMargem*100).toFixed(1)+'%.',
    'Dividas: total '+enrBrl(d.totalDividas)+', parcela '+enrBrl(d.parcelaMensalTotal)+'/mes.',
    'FAMILIA (PF): renda '+enrBrl(d.rendaPF)+' (pro-labore + conjuge '+enrBrl(+s.rendaEsposa)+'), despesas '+enrBrl(d.pfDespesas)+', sobra '+enrBrl(d.sobraPF)+(s.rotativo?' — ATENCAO: no rotativo.':'.'),
    'MOTOR DE POUPANCA: '+enrBrl(d.motor)+'/mes.',
    'CARTEIRA (total '+enrBrl(d.carteiraTotal)+'): '+((s.carteira||[]).map(function(c){return c.nome+' '+enrBrl(c.valor)+' ['+c.tipo+']';}).join('; ')||'vazia')+'.',
    'METAS ('+((s.metas||[]).length)+'): alvo '+enrBrl(d.somaAlvo)+', ja aplicado '+enrBrl(d.somaJa)+', falta '+enrBrl(d.somaFalta)+'. '+d.metasCalc.map(function(x){return x.meta.nome+' (alvo '+enrBrl(x.c.alvo)+', ja '+enrBrl(x.c.jaAplicado)+', aporte '+enrBrl(x.c.aporte)+'/mes, '+(x.c.t.meses?(x.c.t.meses/12).toFixed(1)+' anos':'+50 anos')+')';}).join('; ')+'.',
    'Premissas: Selic '+s.selic+'%, CDI '+s.cdi+'%, IPCA '+s.ipca+'%.',
  ].join('\n');
}

var ENR_PERSONA='Voce e o conselheiro estrategico financeiro do Rafael, empresario brasileiro. Modelo mental: PJ e o motor, PF e o reservatorio — sempre separe os dois bolsos. Seja direto, pratico e honesto, em portugues do Brasil. Voce NAO e consultor licenciado: de informacao e estrutura para ele decidir, explique trade-offs e riscos. Priorize: reserva de emergencia e quitar rotativo antes de risco; depois aportes recorrentes. Respostas concisas (max. 3 paragrafos).';

async function enrEnviar() {
  var ta=document.getElementById('enr-pergunta');
  var btn=document.getElementById('enr-btn-enviar');
  var erroEl=document.getElementById('enr-erro');
  if(!ta||!btn) return;
  var pergunta=ta.value.trim();
  if(!pergunta) return;
  if(erroEl) erroEl.style.display='none';
  btn.disabled=true; btn.textContent='Pensando...';
  try {
    var d=enrCalcDerived(ENR);
    var resp=await API.ask(pergunta,ENR_PERSONA+'\n\nCONTEXTO DO RAFAEL:\n'+enrSnapshot(ENR,d),1000);
    ENR.historico=[{id:enrId(),q:pergunta,a:resp,data:new Date().toISOString()},...(ENR.historico||[])];
    enrSave(); ta.value=''; renderEnriquecimento();
  } catch(e) {
    if(erroEl){erroEl.textContent=e.message||'Erro ao contatar a IA.';erroEl.style.display='block';}
    btn.disabled=false; btn.textContent='Perguntar';
  }
}

async function enrCopiarContexto() {
  var ta=document.getElementById('enr-pergunta');
  var btn=document.getElementById('enr-btn-copiar');
  var pergunta=(ta&&ta.value&&ta.value.trim())||'(escreva sua pergunta aqui)';
  var d=enrCalcDerived(ENR);
  var txt=ENR_PERSONA+'\n\n=== CONTEXTO ===\n'+enrSnapshot(ENR,d)+'\n\n=== PERGUNTA ===\n'+pergunta;
  try {
    await navigator.clipboard.writeText(txt);
    if(btn){btn.textContent='Copiado!';setTimeout(function(){btn.textContent='Copiar contexto + pergunta';},1800);}
  } catch(_) {}
}

function enrInitCharts() {
  if(typeof Chart==='undefined') return;
  var d=enrCalcDerived(ENR);
  d.metasCalc.forEach(function(pair){
    var meta=pair.meta, c=pair.c;
    var canvas=document.getElementById('enr-chart-'+meta.id);
    if(!canvas) return;
    if(_enrCharts[meta.id]){try{_enrCharts[meta.id].destroy();}catch(_){}}
    _enrCharts[meta.id]=new Chart(canvas,{
      type:'line',
      data:{labels:c.serie.map(function(p){return p.ano+'a';}),datasets:[
        {label:'Total',data:c.serie.map(function(p){return p.valor;}),borderColor:'#3FB68B',backgroundColor:'rgba(63,182,139,.12)',borderWidth:2,fill:true,tension:.35,pointRadius:0},
        {label:'Bolso',data:c.serie.map(function(p){return p.bolso;}),borderColor:'#5B9BD5',backgroundColor:'transparent',borderWidth:1.5,borderDash:[4,3],fill:false,tension:.35,pointRadius:0},
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(ctx){return ' '+enrBrl(ctx.raw);}}}},scales:{x:{ticks:{color:'#6B7280',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#6B7280',font:{size:10},callback:function(v){return 'R$'+(v/1000).toFixed(0)+'k';}},grid:{color:'rgba(255,255,255,.04)'}}}}
    });
  });
}

function renderEnriquecimento() {
  var panel=document.getElementById('panel-enriquecimento');
  if(!panel) return;
  Object.values(_enrCharts).forEach(function(ch){try{ch.destroy();}catch(_){}});
  _enrCharts={};
  var s=ENR, d=enrCalcDerived(s);
  var NAV=[['empresa','Empresa','PJ'],['familia','Familia','PF'],['invest','Investimentos','PF'],['metas','Metas',''],['agenda','Agenda',''],['orienta','Orientacao IA','']];
  var nav=NAV.map(function(n){
    var id=n[0],label=n[1],badge=n[2];
    var active=ENR_SEC===id;
    return '<button onclick="enrNav(\''+id+'\')" style="padding:9px 12px;cursor:pointer;font-size:12px;font-weight:600;border-radius:8px;border:1px solid '+(active?'#5B9BD5':'var(--border)')+';background:'+(active?'rgba(91,155,213,.08)':'transparent')+';color:'+(active?'#5B9BD5':'var(--text-tertiary)')+';font-family:var(--font-sans)">'+label+(badge?'<span style="font-size:9px;font-weight:700;border:1px solid currentColor;border-radius:3px;padding:1px 4px;margin-left:3px">'+badge+'</span>':'')+'</button>';
  }).join('');
  var sumCols=[['PJ lucro+labore',enrBrl(d.pjLucroApos+(+s.proLabore)),'#5B9BD5'],['PF renda',enrBrl(d.rendaPF),'var(--gold)'],['Motor',enrBrl(d.motor)+'/mes',d.motor>0?'var(--green)':'var(--red)'],['Metas',enrBrl(d.somaAlvo),'var(--gold)']];
  var sum='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">'+sumCols.map(function(sc,i,a){return '<div style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:5px 10px"><div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase">'+sc[0]+'</div><div style="font-size:13px;color:'+sc[2]+';font-family:var(--font-serif,serif);margin-top:1px">'+sc[1]+'</div></div>'+(i<a.length-1?'<span style="color:var(--text-tertiary)">&#8594;</span>':'');}).join('')+'</div>';
  var sec='';
  if(ENR_SEC==='empresa')  sec=enrHtmlEmpresa(s,d);
  else if(ENR_SEC==='familia') sec=enrHtmlFamilia(s,d);
  else if(ENR_SEC==='invest')  sec=enrHtmlInvest(s,d);
  else if(ENR_SEC==='metas')   sec=enrHtmlMetas(s,d);
  else if(ENR_SEC==='agenda')  sec=enrHtmlAgenda(s);
  else if(ENR_SEC==='orienta') sec=enrHtmlOrienta(s);
  panel.innerHTML='<div style="padding:20px;max-width:1100px;margin:0 auto"><div style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px"><div style="display:flex;align-items:center;gap:8px;color:var(--gold);font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px"><span style="width:22px;height:1px;background:var(--gold)"></span>InvestAI Enriquecimento</div><h1 style="font-family:var(--font-serif,Georgia,serif);font-size:22px;font-weight:600;margin:0">Plano Mestre de Enriquecimento</h1>'+sum+'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">'+nav+'</div></div><div>'+sec+'</div><p style="font-size:10px;color:var(--text-tertiary);margin-top:20px;line-height:1.6">Projecoes sao estimativas — nao garantem retorno. Nao sou consultor de investimentos licenciado.</p></div>';
  setTimeout(enrInitCharts,60);
}

(async function(){await enrLoad();})();
