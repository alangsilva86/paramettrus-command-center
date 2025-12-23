import React, { useMemo } from 'react';
import { History } from 'lucide-react';
import WidgetCard from '../../../components/WidgetCard';
import { DashboardSnapshot, RulesVersionItem } from '../../../types';
import { formatCurrencyBRL } from '../../../utils/format';

interface AuditTabProps {
  rules: RulesVersionItem[];
  rulesLoading: boolean;
  scenarioHistory: DashboardSnapshot[];
  scenarioHistoryLoading: boolean;
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const describeRuleChange = (current: RulesVersionItem, previous?: RulesVersionItem | null) => {
  if (!previous) return 'Nova regra publicada.';

  if (current.meta_global_comissao !== previous.meta_global_comissao) {
    return `Meta mensal: ${formatCurrencyBRL(previous.meta_global_comissao)} → ${formatCurrencyBRL(
      current.meta_global_comissao
    )}.`;
  }
  if (current.dias_uteis !== previous.dias_uteis) {
    return `Dias úteis: ${previous.dias_uteis} → ${current.dias_uteis}.`;
  }

  const weightKeys = new Set([
    ...Object.keys(current.product_weights || {}),
    ...Object.keys(previous.product_weights || {})
  ]);
  for (const key of weightKeys) {
    const curr = current.product_weights?.[key] ?? 0;
    const prev = previous.product_weights?.[key] ?? 0;
    if (curr !== prev) {
      return `Peso ${key}: ${prev} → ${curr}.`;
    }
  }

  const bonusKeys = new Set([
    ...Object.keys(current.bonus_events || {}),
    ...Object.keys(previous.bonus_events || {})
  ]);
  for (const key of bonusKeys) {
    const curr = current.bonus_events?.[key] ?? 0;
    const prev = previous.bonus_events?.[key] ?? 0;
    if (curr !== prev) {
      return `Bônus ${key}: ${prev} → ${curr}.`;
    }
  }

  return 'Atualização de regra sem mudanças críticas.';
};

const AuditTab: React.FC<AuditTabProps> = ({
  rules,
  rulesLoading,
  scenarioHistory,
  scenarioHistoryLoading
}) => {
  const ruleTimeline = useMemo(() => {
    return rules.map((rule, index) => ({
      id: rule.rules_version_id,
      date: rule.created_at || rule.effective_from,
      actor: rule.created_by || 'Sistema',
      note: rule.audit_note,
      change: describeRuleChange(rule, rules[index + 1])
    }));
  }, [rules]);

  const scenarioTimeline = useMemo(() => {
    return scenarioHistory.map((scenario) => ({
      id: scenario.scenario_id || scenario.month,
      date: scenario.created_at,
      forecast: scenario.kpis?.forecast_pct_meta,
      gap: scenario.kpis?.gap_diario,
      month: scenario.month
    }));
  }, [scenarioHistory]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <WidgetCard title="Histórico de Regras">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          {rulesLoading && <div className="text-gray-600 italic">Carregando regras...</div>}
          {!rulesLoading && ruleTimeline.length === 0 && (
            <div className="text-gray-600 italic">Nenhuma regra cadastrada.</div>
          )}
          {!rulesLoading &&
            ruleTimeline.slice(0, 8).map((entry) => (
              <div key={entry.id} className="border border-param-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{formatDate(entry.date)}</span>
                  <span className="text-[10px] text-gray-500">{entry.actor}</span>
                </div>
                <div className="text-[11px] text-white/80 mt-2">{entry.change}</div>
                {entry.note && <div className="text-[10px] text-gray-500 mt-1">{entry.note}</div>}
              </div>
            ))}
        </div>
      </WidgetCard>

      <WidgetCard title="Histórico de Simulações">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          {scenarioHistoryLoading && <div className="text-gray-600 italic">Carregando simulações...</div>}
          {!scenarioHistoryLoading && scenarioTimeline.length === 0 && (
            <div className="text-gray-600 italic">Nenhuma simulação registrada.</div>
          )}
          {!scenarioHistoryLoading &&
            scenarioTimeline.slice(0, 8).map((entry) => (
              <div key={entry.id} className="border border-param-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{formatDate(entry.date)}</span>
                  <span className="text-[10px] text-gray-500">Mês {entry.month}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Forecast: {entry.forecast ? `${(entry.forecast * 100).toFixed(1)}%` : '—'}
                </div>
                <div className="text-[10px] text-gray-500">Gap diário: {formatCurrencyBRL(entry.gap || 0)}</div>
              </div>
            ))}
          {!scenarioHistoryLoading && scenarioTimeline.length > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-2">
              <History className="w-3 h-3" />
              Guardamos os últimos cenários simulados para auditoria.
            </div>
          )}
        </div>
      </WidgetCard>
    </div>
  );
};

export default AuditTab;
