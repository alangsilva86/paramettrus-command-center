import { normalizeText } from './normalize.js';

const buildAliasMap = (mapping) => {
  const map = {};
  for (const [alias, canonical] of Object.entries(mapping)) {
    const key = normalizeText(alias);
    if (key) map[key] = canonical;
  }
  return map;
};

export const aliasMaps = {
  seguradora: buildAliasMap({
    Axa: 'Axa',
    Azul: 'Azul',
    Allianz: 'Allianz',
    Aliro: 'Aliro',
    Bradesco: 'Bradesco Seguros',
    'Bradesco Seguros': 'Bradesco Seguros',
    'BP Seguradora': 'BP Seguradora',
    Centauro: 'Centauro-On',
    'Centauro-On': 'Centauro-On',
    Chubb: 'Chubb',
    Ezze: 'Ezze',
    'Fair Fax': 'Fair Fax',
    HDI: 'HDI',
    Itau: 'Itau',
    Mapfre: 'Mapfre',
    Mitsui: 'Mitsui Seguros',
    'Mitsui Seguros': 'Mitsui Seguros',
    Porto: 'Porto Seguro',
    'Porto Seguro': 'Porto Seguro',
    Prudential: 'PRUDENTIAL',
    Sancor: 'Sancor Seguros',
    'Sancor Seguros': 'Sancor Seguros',
    Sompo: 'Sompo',
    Suhai: 'Suhai Seguros',
    'Suhai Seguros': 'Suhai Seguros',
    'Tokio Marine': 'Tokio Marine',
    Tokio: 'Tokio Marine',
    Ituran: 'Ituran',
    Vital: 'VITAL CARD',
    'Vital Card': 'VITAL CARD',
    Zurich: 'Zurich Seguros',
    'Zurich Seguros': 'Zurich Seguros',
    'Yellum Seguradora': 'Yellum Seguradora',
    'Pottencial Seguradora': 'Pottencial Seguradora',
    'Akad Seguros': 'Akad Seguros'
  }),
  produto: buildAliasMap({
    Auto: 'Automovel',
    Automovel: 'Automovel',
    'Seguro Auto': 'Automovel',
    Veiculo: 'Automovel',
    Residencial: 'Residencial',
    Empresarial: 'Empresarial',
    'Seguro Viagem': 'Seguro Viagem',
    Viagem: 'Seguro Viagem',
    'Seguro de Vida': 'Vida',
    Vida: 'Vida',
    Condominio: 'Condominio',
    'Placa Solar': 'Placa Solar',
    Equipamentos: 'Equipamentos',
    Eventos: 'Eventos',
    Celular: 'Celular',
    Bike: 'Bike',
    'Responsabilidade Civil Profissional': 'Responsabilidade Civil Profissional',
    'Risco de Engenharia': 'Risco de Engenharia'
  })
};

export const applyAlias = (value, aliasMap) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const key = normalizeText(raw);
  return (key && aliasMap[key]) || raw;
};
