/**
 * glossario.js — Glossário integrado de produtos financeiros.
 * Abre um popup ao clicar em qualquer badge de tipo de ativo.
 */
const GLOSSARIO = {
  'CDB': {
    nome:   'Certificado de Depósito Bancário',
    risco:  'Baixo',
    liquid: 'Varia (diária a 2+ anos)',
    ir:     'Sim — tabela regressiva (22,5% a 15%)',
    fgc:    'Sim — até R$ 250.000 por CPF por instituição',
    desc:   'Título emitido por bancos para captar recursos. Rende um percentual do CDI (ex: 110% CDI) ou uma taxa prefixada. Muito seguro com proteção do FGC.',
    ideal:  'Reserva de emergência (liquidez diária) ou investimento de curto/médio prazo.',
  },
  'Tesouro Direto': {
    nome:   'Tesouro Direto',
    risco:  'Muito baixo (garantido pelo governo)',
    liquid: 'Diária (venda no mercado secundário) ou no vencimento',
    ir:     'Sim — tabela regressiva (22,5% a 15%)',
    fgc:    'Não necessário — garantia do Tesouro Nacional',
    desc:   'Títulos públicos emitidos pelo Governo Federal. Existem três tipos: Selic (pós-fixado, ideal para reserva), Prefixado (taxa definida na compra) e IPCA+ (protege da inflação + taxa real).',
    ideal:  'Base de qualquer carteira. Tesouro Selic para reserva, IPCA+ para longo prazo.',
  },
  'LCI/LCA': {
    nome:   'Letras de Crédito Imobiliário / do Agronegócio',
    risco:  'Baixo',
    liquid: 'Carência mínima de 9 meses (LCI) ou 90 dias (LCA)',
    ir:     'ISENTO de imposto de renda para pessoa física',
    fgc:    'Sim — até R$ 250.000 por CPF por instituição',
    desc:   'Títulos isentos de IR emitidos por bancos, lastreados no setor imobiliário (LCI) ou agronegócio (LCA). Por serem isentos, uma LCI de 11% pode equivaler a um CDB de 13% para o mesmo prazo.',
    ideal:  'Excelente para investidores que querem rentabilidade líquida superior ao CDB sem pagar IR.',
  },
  'Ações': {
    nome:   'Ações',
    risco:  'Alto — preço oscila diariamente',
    liquid: 'Alta (mercado aberto em dias úteis)',
    ir:     'Sim — 15% sobre ganho de capital (vendas acima de R$ 20k/mês)',
    fgc:    'Não — renda variável não tem garantia',
    desc:   'Representam uma fração do capital social de uma empresa. O investidor se torna sócio e participa dos lucros (dividendos) e da valorização. Sujeitas a alta volatilidade.',
    ideal:  'Longo prazo (5+ anos), carteira diversificada. Para perfis moderado a agressivo.',
  },
  'FII': {
    nome:   'Fundo de Investimento Imobiliário',
    risco:  'Médio — oscila como ações mas com dividendos mensais',
    liquid: 'Alta (negociados na B3)',
    ir:     'Dividendos ISENTOS para PF; ganho de capital = 20%',
    fgc:    'Não — fundo de investimento',
    desc:   'Fundos que investem em imóveis (shoppings, galpões, lajes) ou títulos imobiliários (CRI, LCI). Distribuem pelo menos 95% do lucro como dividendos mensais, geralmente isentos de IR.',
    ideal:  'Renda passiva mensal. Funciona como um "aluguel" sem burocracia de ser proprietário.',
  },
  'ETF': {
    nome:   'Exchange Traded Fund (Fundo de Índice)',
    risco:  'Médio a alto — depende do índice replicado',
    liquid: 'Alta (negociados na B3)',
    ir:     'Sim — 15% sobre ganho de capital',
    fgc:    'Não — fundo de investimento',
    desc:   'Fundo negociado em bolsa que replica um índice (ex: BOVA11 = Ibovespa, IVVB11 = S&P 500). Permite diversificação com baixo custo e simplicidade.',
    ideal:  'Diversificação de baixo custo. Ideal para quem quer exposição ao mercado sem escolher ações individuais.',
  },
  'Cripto': {
    nome:   'Criptoativos (Bitcoin, Ethereum etc.)',
    risco:  'Muito alto — altíssima volatilidade',
    liquid: 'Alta (24h, 7 dias por semana)',
    ir:     'Sim — 15% sobre ganho (vendas acima de R$ 35k/mês)',
    fgc:    'Não — ativo digital descentralizado',
    desc:   'Ativos digitais baseados em blockchain. Bitcoin é o mais consolidado como reserva de valor digital. Alta volatilidade: pode valorizar 100% ou cair 70% em meses. Exige custodia segura.',
    ideal:  'No máximo 5-10% da carteira. Apenas para perfis arrojados com horizonte de longo prazo.',
  },
  'Ouro': {
    nome:   'Ouro',
    risco:  'Médio — hedge contra inflação e crises',
    liquid: 'Média (via ETFs como GOLD11 ou contratos B3)',
    ir:     'Sim — 15% sobre ganho de capital',
    fgc:    'Não',
    desc:   'Ativo real considerado reserva de valor por séculos. Funciona como hedge em crises e períodos de alta inflação. No Brasil, pode ser acessado via ETF (GOLD11) ou contratos futuros.',
    ideal:  'Proteção de carteira contra crises. 5-10% como seguro estratégico.',
  },
  'Fundo': {
    nome:   'Fundo de Investimento',
    risco:  'Depende da categoria (renda fixa, multimercado, ações)',
    liquid: 'Varia — de D+0 a D+30 ou mais',
    ir:     'Come-cotas semestrais + IR no resgate (tabela regressiva)',
    fgc:    'Não — exceto fundos de renda fixa com lastro em CDB',
    desc:   'Veículo que reúne recursos de vários investidores e é gerido por um gestor profissional. Categorias principais: Renda Fixa, Multimercado (hedge funds), Ações e Cambial.',
    ideal:  'Acesso a estratégias sofisticadas. Verifique a taxa de administração — fundos com taxa acima de 1,5% raramente batem o CDI.',
  },
  'Investimento Coletivo': {
    nome:   'Investimento Coletivo / Crowdfunding',
    risco:  'Médio a alto — depende do projeto, garantias e devedor',
    liquid: 'Baixa — normalmente até o vencimento ou cronograma do projeto',
    ir:     'Pode haver IR conforme a estrutura da oferta; valide no informe/prospecto',
    fgc:    'Não — não possui cobertura do FGC',
    desc:   'Modalidade usada por plataformas como INCO para acessar projetos da economia real, como imobiliário, energia, crédito privado, direitos creditórios ou venture capital. Cada oferta tem prazo, taxa, garantias e fluxo próprios.',
    ideal:  'Diversificação de longo prazo com parcela pequena da carteira, aceitando baixa liquidez e risco de crédito/projeto.',
  },
};

let _glossModal = null;

function showGlossario(tipo) {
  const info = GLOSSARIO[tipo];
  if (!info) return;

  if (_glossModal) _glossModal.remove();

  _glossModal = document.createElement('div');
  _glossModal.id = 'gloss-modal';
  _glossModal.innerHTML = `
    <div class="gloss-backdrop" onclick="closeGlossario()"></div>
    <div class="gloss-box">
      <div class="gloss-hd">
        <div>
          <div class="gloss-title">${info.nome}</div>
          <div class="gloss-sub">${tipo}</div>
        </div>
        <button class="gloss-close" onclick="closeGlossario()">✕</button>
      </div>
      <div class="gloss-body">
        <p class="gloss-desc">${info.desc}</p>
        <div class="gloss-grid">
          <div class="gloss-item"><span class="gloss-lbl">Risco</span><span>${info.risco}</span></div>
          <div class="gloss-item"><span class="gloss-lbl">Liquidez</span><span>${info.liquid}</span></div>
          <div class="gloss-item"><span class="gloss-lbl">Imposto de Renda</span><span>${info.ir}</span></div>
          <div class="gloss-item"><span class="gloss-lbl">FGC</span><span>${info.fgc}</span></div>
        </div>
        <div class="gloss-ideal"><strong>Ideal para:</strong> ${info.ideal}</div>
      </div>
    </div>`;
  document.body.appendChild(_glossModal);
  setTimeout(() => _glossModal?.classList.add('gloss-visible'), 10);
}

function closeGlossario() {
  if (_glossModal) {
    _glossModal.classList.remove('gloss-visible');
    setTimeout(() => { _glossModal?.remove(); _glossModal = null; }, 250);
  }
}

// Patch: torna todos os badges clicáveis — chamado após render
function patchBadges() {
  document.querySelectorAll('.ia-badge').forEach(b => {
    const tipo = b.textContent.trim();
    if (GLOSSARIO[tipo]) {
      b.style.cursor = 'pointer';
      b.title        = 'Clique para saber mais';
      b.onclick      = () => showGlossario(tipo);
    }
  });
}
