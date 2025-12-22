import { query } from '../db.js';
import { logInfo, logWarn } from '../utils/logger.js';

export const getCrossSellSummary = async () => {
  logInfo('cross', 'Calculando resumo de cross-sell');
  const customers = await query('SELECT * FROM customers');
  const total = customers.rowCount;
  const mono = customers.rows.filter((c) => c.is_monoproduto).length;
  const autoVida = customers.rows.filter((c) => {
    const products = c.active_products || [];
    return products.includes('AUTO') && products.includes('VIDA');
  }).length;

  const autoOnlyCustomers = customers.rows.filter((c) => {
    const products = c.active_products || [];
    return products.includes('AUTO') && !products.includes('VIDA');
  });

  const cpfList = autoOnlyCustomers.map((c) => c.cpf_cnpj).filter(Boolean);
  let autoSemVida = [];

  if (cpfList.length > 0) {
    const result = await query(
      `SELECT cpf_cnpj,
              MAX(segurado_nome) AS segurado_nome,
              SUM(comissao_valor) AS comissao_total,
              SUM(premio) AS premio_total
       FROM contracts_norm
       WHERE ramo = 'AUTO'
         AND cpf_cnpj = ANY($1)
       GROUP BY cpf_cnpj
       ORDER BY SUM(comissao_valor) DESC, SUM(premio) DESC`,
      [cpfList]
    );
    autoSemVida = result.rows;
  }

  if (total === 0) {
    logWarn('cross', 'Sem clientes na base para cross-sell');
  }

  logInfo('cross', 'Resumo cross-sell pronto', {
    total_customers: total,
    monoproduto_pct: total > 0 ? Number((mono / total).toFixed(4)) : 0,
    auto_vida: autoVida,
    auto_sem_vida: autoSemVida.length
  });

  return {
    totalCustomers: total,
    monoprodutoPct: total > 0 ? mono / total : 0,
    autoVidaCount: autoVida,
    autoSemVidaCount: autoSemVida.length,
    autoSemVida
  };
};
