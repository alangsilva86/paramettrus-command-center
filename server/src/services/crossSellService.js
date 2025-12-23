import { query } from '../db.js';
import { config } from '../config.js';
import { buildStatusFilter } from '../utils/status.js';
import { logInfo, logWarn } from '../utils/logger.js';

export const getCrossSellSummary = async ({ vendorId = null } = {}) => {
  logInfo('cross', 'Calculando resumo de cross-sell');
  let customers;
  if (vendorId) {
    const cpfParams = [vendorId];
    const cpfConditions = ['vendedor_id = $1', 'cpf_cnpj IS NOT NULL'];
    const statusFilter = buildStatusFilter(cpfParams, config.contractStatus);
    if (statusFilter) {
      cpfConditions.push(statusFilter);
    }
    const cpfRows = await query(
      `SELECT DISTINCT cpf_cnpj
       FROM contracts_norm
       WHERE ${cpfConditions.join(' AND ')}`,
      cpfParams
    );
    const cpfList = cpfRows.rows.map((row) => row.cpf_cnpj).filter(Boolean);
    if (cpfList.length === 0) {
      return {
        totalCustomers: 0,
        monoprodutoCount: 0,
        multiProdutoCount: 0,
        monoprodutoPct: 0,
        autoVidaCount: 0,
        autoSemVidaCount: 0,
        autoSemVida: []
      };
    }
    customers = await query('SELECT * FROM customers WHERE cpf_cnpj = ANY($1)', [cpfList]);
  } else {
    customers = await query('SELECT * FROM customers');
  }
  const total = customers.rowCount;
  const mono = customers.rows.filter((c) => c.is_monoproduto).length;
  const multi = Math.max(0, total - mono);
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
    const autoParams = [cpfList];
    const autoConditions = [`ramo = 'AUTO'`, 'cpf_cnpj = ANY($1)'];
    const statusFilter = buildStatusFilter(autoParams, config.contractStatus);
    if (statusFilter) {
      autoConditions.push(statusFilter);
    }
    const result = await query(
      `SELECT cpf_cnpj,
              MAX(segurado_nome) AS segurado_nome,
              SUM(comissao_valor) / 100.0 AS comissao_total,
              SUM(premio) / 100.0 AS premio_total
       FROM contracts_norm
       WHERE ${autoConditions.join(' AND ')}
       GROUP BY cpf_cnpj
       ORDER BY comissao_total DESC, premio_total DESC`,
      autoParams
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
    monoprodutoCount: mono,
    multiProdutoCount: multi,
    monoprodutoPct: total > 0 ? mono / total : 0,
    autoVidaCount: autoVida,
    autoSemVidaCount: autoSemVida.length,
    autoSemVida
  };
};
