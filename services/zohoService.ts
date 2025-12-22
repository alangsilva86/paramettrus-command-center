import { ContractNorm, DashboardSnapshot, LeaderboardEntry, RadarProductBubble, RulesVersion, XpLedgerEntry } from '../types';

// --- CONFIGURATION & RULES (RN 2.4.4) ---
const CURRENT_DATE = '2025-12-22'; // Fixed as per PRD
const CURRENT_MONTH_PREFIX = '2025-12';

const RULES: RulesVersion = {
  rules_version_id: 'v2025_12_01_001',
  effective_from: '2025-12-01',
  meta_global_comissao: 170000.00,
  dias_uteis: 22,
  product_weights: {
    'AUTO': 1.0,
    'VIDA': 2.5, // Strategic Focus
    'RESID': 1.5,
    'EMP': 1.8,
    'OUTROS': 1.0
  },
  bonus_events: {
    cross_sell: 500,
    combo_breaker: 800,
    salvamento_d5: 600
  }
};

// --- MOCK DATABASE (Simulating Middleware Storage) ---

// 1. Helpers for hash and dates
const generateHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
};

const getDaysDiff = (target: string, now: string) => {
  const t = new Date(target).getTime();
  const n = new Date(now).getTime();
  return Math.ceil((t - n) / (1000 * 3600 * 24));
};

// 2. Data Generator to match Smoke Tests (Section 2.9)
const generateMockDB = (): ContractNorm[] => {
  const db: ContractNorm[] = [];
  
  // -- A. Specific Renewal Risks (RN02) --
  // D-7: 6 contracts, ~2k risk
  for(let i=0; i<6; i++) {
    db.push({
      contract_id: `risk_d7_${i}`,
      cpf_cnpj: `cpf_risk_d7_${i}`,
      segurado_nome: `Cliente Risco 7-${i}`,
      vendedor_id: 'system',
      produto: 'Auto',
      ramo: 'AUTO',
      seguradora: 'HDI',
      data_efetivacao: '2024-12-25', // Old sale
      inicio: '2024-12-25',
      termino: '2025-12-25', // Expiring in 3 days from 22/12
      status: 'vigente',
      premio: 2000,
      comissao_pct: 0.16,
      comissao_valor: 333.39, // 6 * 333.39 ~= 2000.36
      is_monoproduto: true,
      row_hash: 'hash_d7'
    });
  }

  // D-15: 8 contracts (total 14 with D7), ~3.3k risk (total 5.3k)
  for(let i=0; i<8; i++) {
    db.push({
      contract_id: `risk_d15_${i}`,
      cpf_cnpj: `cpf_risk_d15_${i}`,
      segurado_nome: `Cliente Risco 15-${i}`,
      vendedor_id: 'system',
      produto: 'Auto',
      ramo: 'AUTO',
      seguradora: 'Porto',
      data_efetivacao: '2024-12-30',
      inicio: '2024-12-30',
      termino: '2026-01-02', // ~11 days
      status: 'vigente',
      premio: 2500,
      comissao_pct: 0.16,
      comissao_valor: 421.78,
      is_monoproduto: true,
      row_hash: 'hash_d15'
    });
  }

  // -- B. Current Month Production (For Commission MTD & Forecast) --
  // We need ~32k Commission MTD
  // Alan (High Performer, Vida focus)
  db.push({ contract_id: 'alan_1', cpf_cnpj: 'cli_1', segurado_nome: 'João Top', vendedor_id: 'Alan', produto: 'Vida', ramo: 'VIDA', seguradora: 'Prudential', data_efetivacao: '2025-12-05', inicio: '2025-12-05', termino: '2026-12-05', status: 'vigente', premio: 12000, comissao_pct: 0.40, comissao_valor: 4800, is_monoproduto: false, row_hash: 'h1' });
  db.push({ contract_id: 'alan_2', cpf_cnpj: 'cli_1', segurado_nome: 'João Top', vendedor_id: 'Alan', produto: 'Auto', ramo: 'AUTO', seguradora: 'Porto', data_efetivacao: '2025-12-05', inicio: '2025-12-05', termino: '2026-12-05', status: 'vigente', premio: 5000, comissao_pct: 0.15, comissao_valor: 750, is_monoproduto: false, row_hash: 'h2' }); // Combo Breaker
  db.push({ contract_id: 'alan_3', cpf_cnpj: 'cli_2', segurado_nome: 'Maria Corp', vendedor_id: 'Alan', produto: 'Empresarial', ramo: 'EMP', seguradora: 'Tokio', data_efetivacao: '2025-12-10', inicio: '2025-12-10', termino: '2026-12-10', status: 'vigente', premio: 25000, comissao_pct: 0.20, comissao_valor: 5000, is_monoproduto: true, row_hash: 'h3' });

  // Beatriz (Auto Volume)
  for(let k=0; k<15; k++) {
    db.push({ contract_id: `bea_${k}`, cpf_cnpj: `cli_b_${k}`, segurado_nome: `Cliente B${k}`, vendedor_id: 'Beatriz', produto: 'Auto', ramo: 'AUTO', seguradora: 'Allianz', data_efetivacao: '2025-12-12', inicio: '2025-12-12', termino: '2026-12-12', status: 'vigente', premio: 4000, comissao_pct: 0.12, comissao_valor: 480, is_monoproduto: true, row_hash: `hb${k}` });
  }

  // Carlos (Mixed)
  db.push({ contract_id: 'carlos_1', cpf_cnpj: 'cli_c1', segurado_nome: 'Carlos Client', vendedor_id: 'Carlos', produto: 'Residencial', ramo: 'RESID', seguradora: 'Porto', data_efetivacao: '2025-12-15', inicio: '2025-12-15', termino: '2026-12-15', status: 'vigente', premio: 800, comissao_pct: 0.25, comissao_valor: 200, is_monoproduto: true, row_hash: 'hc1' });
  
  // Fillers to hit ~32k MTD
  // Current sum above: 4800 + 750 + 5000 + (15*480 = 7200) + 200 = 17,950
  // Need ~14k more
  db.push({ contract_id: 'fill_1', cpf_cnpj: 'cli_f1', segurado_nome: 'Mega Corp', vendedor_id: 'Beatriz', produto: 'Empresarial', ramo: 'EMP', seguradora: 'Mapfre', data_efetivacao: '2025-12-02', inicio: '2025-12-02', termino: '2026-12-02', status: 'vigente', premio: 70000, comissao_pct: 0.20, comissao_valor: 14000, is_monoproduto: true, row_hash: 'hf1' });

  // -- C. Historical Data (for Bubble Chart context) --
  // Generate bulk Auto data
  for(let j=0; j<50; j++) {
     db.push({ contract_id: `hist_auto_${j}`, cpf_cnpj: `old_${j}`, segurado_nome: 'Old', vendedor_id: 'System', produto: 'Auto', ramo: 'AUTO', seguradora: 'Porto', data_efetivacao: '2025-06-01', inicio: '2025-06-01', termino: '2026-06-01', status: 'vigente', premio: 3000, comissao_pct: 0.12, comissao_valor: 360, is_monoproduto: true, row_hash: `hha${j}` });
  }

  return db;
};

// 3. LOGIC ENGINE (RN00 - RN04)

export const fetchDashboardSnapshot = async (): Promise<DashboardSnapshot> => {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 600));

  const db = generateMockDB();

  // --- RN00: Deduplication (Implicit in data gen, but theoretically here) ---
  // In a real app, we would check hashes against existing DB.

  // --- Filter Current Month (Snapshot Scope) ---
  const mtdData = db.filter(c => c.data_efetivacao.startsWith(CURRENT_MONTH_PREFIX));

  // --- KPI Calculation ---
  const comissao_mtd = mtdData.reduce((acc, c) => acc + c.comissao_valor, 0);

  // --- RN01: Weighted Forecast (Anti-Panic) ---
  // Assuming Dec 22nd. Share expected curve ~0.70 (Day 22/31 is linear, but sales are backloaded). 
  // Let's use a simple curve proxy.
  // Day 22 usually represents ~75% of production in insurance.
  const share_esperado = 0.75; 
  // If we had a 'month_curve' table, we would lookup: curve['22'].cum_share
  
  // Forecast formula: Realized / Share
  // If comissao_mtd is 0, avoid Infinity
  const forecast_comissao = share_esperado > 0 ? comissao_mtd / share_esperado : 0;
  
  const remainingDays = 6; // Approx working days left in Dec from 22nd
  const gap = RULES.meta_global_comissao - comissao_mtd;
  const gap_diario = remainingDays > 0 ? Math.max(0, gap / remainingDays) : 0;

  // --- RN02: Renewal Traffic Light ---
  const d7: ContractNorm[] = [];
  const d15: ContractNorm[] = [];
  let blackListCount = 0;
  
  // Look at ALL DB (not just MTD) for renewals
  db.forEach(c => {
    const days = getDaysDiff(c.termino, CURRENT_DATE);
    if (days >= 0 && days <= 7) d7.push(c);
    else if (days > 7 && days <= 15) d15.push(c);
    else if (days < 0) blackListCount++;
  });

  const d7_risk = d7.reduce((acc, c) => acc + c.comissao_valor, 0);
  const d15_risk = d15.reduce((acc, c) => acc + c.comissao_valor, 0);

  // --- RN03 & RN04: XP Engine & Cross-sell ---
  const xpLedger: XpLedgerEntry[] = [];
  const clientProducts = new Map<string, Set<string>>();

  // Build Customer Profile for Cross-sell
  db.forEach(c => {
    if (!clientProducts.has(c.cpf_cnpj)) clientProducts.set(c.cpf_cnpj, new Set());
    clientProducts.get(c.cpf_cnpj)?.add(c.ramo);
  });

  mtdData.forEach(c => {
    let xp = 0;
    const reasons: string[] = [];
    
    // 1. Base XP
    const weight = RULES.product_weights[c.ramo] || 1.0;
    const base = (c.comissao_valor / 10) * weight; // R$ 10 comm = 1 XP * weight
    xp += base;

    // 2. Cross-sell Bonus (RN03)
    const products = clientProducts.get(c.cpf_cnpj);
    // Logic: If customer has > 1 distinct product type, and this sale contributed to it.
    // Simplified: If customer is multi-product, apply bonus to this sale.
    if (products && products.size > 1) {
      xp += RULES.bonus_events.cross_sell;
      reasons.push('CROSS_SELL');
    }

    // 3. Combo Breaker
    // Simplified: If this contract is AUTO and user also has VIDA (or vice versa)
    if ((c.ramo === 'AUTO' && products?.has('VIDA')) || (c.ramo === 'VIDA' && products?.has('AUTO'))) {
      xp += RULES.bonus_events.combo_breaker;
      reasons.push('COMBO');
    }

    xpLedger.push({
      ledger_id: `lx_${c.contract_id}`,
      contract_id: c.contract_id,
      vendedor_id: c.vendedor_id,
      rules_version_id: RULES.rules_version_id,
      xp_base: base,
      xp_bonus: xp - base,
      xp_total: xp,
      reasons,
      calculated_at: new Date().toISOString()
    });
  });

  // --- Aggregation for Leaderboard ---
  const sellerMap = new Map<string, LeaderboardEntry>();
  xpLedger.forEach(entry => {
    if (!sellerMap.has(entry.vendedor_id)) {
      sellerMap.set(entry.vendedor_id, { 
        vendedor_id: entry.vendedor_id, 
        xp: 0, 
        comissao: 0, 
        sales_count: 0, 
        badges: [] 
      });
    }
    const s = sellerMap.get(entry.vendedor_id)!;
    s.xp += entry.xp_total;
    // Find commission from MTD data
    const contract = mtdData.find(c => c.contract_id === entry.contract_id);
    if (contract) s.comissao += contract.comissao_valor;
    s.sales_count += 1;
    
    if (entry.reasons.includes('COMBO') && !s.badges.includes('COMBO')) s.badges.push('COMBO');
    if (entry.reasons.includes('CROSS_SELL') && !s.badges.includes('HUNTER')) s.badges.push('HUNTER');
  });

  const leaderboard = Array.from(sellerMap.values()).sort((a, b) => b.xp - a.xp);

  // --- Radar / Strategy Data ---
  // Group full DB by Ramo
  const ramoStats = new Map<string, { comm: number, prem: number, count: number }>();
  db.forEach(c => {
    if (!ramoStats.has(c.ramo)) ramoStats.set(c.ramo, { comm: 0, prem: 0, count: 0 });
    const r = ramoStats.get(c.ramo)!;
    r.comm += c.comissao_valor;
    r.prem += c.premio;
    r.count++;
  });

  const bubble_products: RadarProductBubble[] = Array.from(ramoStats.entries()).map(([ramo, stat]) => ({
    ramo,
    comissao_total: stat.comm,
    premio_total: stat.prem,
    comissao_pct_avg: (stat.comm / stat.prem) * 100,
    retencao_proxy: 0.85 // Mocked retention for now
  }));

  const totalCommAll = db.reduce((acc, c) => acc + c.comissao_valor, 0);
  const autoCommAll = db.filter(c => c.ramo === 'AUTO').reduce((acc, c) => acc + c.comissao_valor, 0);
  const auto_share = totalCommAll > 0 ? autoCommAll / totalCommAll : 0;
  
  // Monoproduto global
  const singleProductClients = Array.from(clientProducts.values()).filter(set => set.size === 1).length;
  const mono_pct = clientProducts.size > 0 ? singleProductClients / clientProducts.size : 0;

  return {
    month: CURRENT_MONTH_PREFIX,
    kpis: {
      meta_comissao: RULES.meta_global_comissao,
      comissao_mtd,
      pct_meta: comissao_mtd / RULES.meta_global_comissao,
      forecast_comissao,
      forecast_pct_meta: forecast_comissao / RULES.meta_global_comissao,
      gap_diario,
      auto_share_comissao: auto_share,
      monoproduto_pct: mono_pct
    },
    renewals: {
      d7: { count: d7.length, comissao_risco: d7_risk },
      d15: { count: d15.length, comissao_risco: d15_risk },
      black_list_count: blackListCount
    },
    leaderboard,
    radar: {
      bubble_products,
      top_insurer_share: 0.42 // Mocked Pareto
    }
  };
};
