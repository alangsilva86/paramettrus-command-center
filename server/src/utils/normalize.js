const stripAccents = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normalizeText = (value) => {
  if (!value) return '';
  return stripAccents(String(value)).trim().toUpperCase();
};

export const normalizeCpfCnpj = (value) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) return null;
  return digits;
};

export const normalizeMoney = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return Number(value);
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

export const normalizeRamo = (produtoRaw) => {
  const normalized = normalizeText(produtoRaw);
  if (!normalized) return { produto: null, ramo: null };

  if (['AUTO', 'AUTOMOVEL', 'AUTOMOVEL', 'AUTOMÓVEL', 'VEICULO', 'VEICULO'].includes(normalized)) {
    return { produto: 'Automovel', ramo: 'AUTO' };
  }
  if (normalized.includes('VIDA')) {
    return { produto: 'Vida', ramo: 'VIDA' };
  }
  if (normalized.includes('RESID')) {
    return { produto: 'Residencial', ramo: 'RESID' };
  }
  if (normalized.includes('EMP')) {
    return { produto: 'Empresarial', ramo: 'EMP' };
  }
  if (normalized.includes('COND')) {
    return { produto: 'Condominio', ramo: 'COND' };
  }

  return { produto: 'Outros', ramo: 'OUTROS' };
};
