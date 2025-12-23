import React from 'react';
import { Lock, Play, Sparkles } from 'lucide-react';
import WidgetCard from '../../../components/WidgetCard';
import { AdminMonthStatusResponse, DashboardSnapshot, SnapshotCompare } from '../../../types';
import { formatCurrencyBRL, formatSignedCurrencyBRL } from '../../../utils/format';

interface ProcessingTabProps {
  scenarioMonth: string;
  onScenarioMonthChange: (value: string) => void;
  scenarioSnapshot: DashboardSnapshot | null;
  scenarioCompare: SnapshotCompare | null;
  scenarioLoading: boolean;
  publishLoading: boolean;
  canSimulate: boolean;
  canPublish: boolean;
  publishBlockedReason?: string;
  monthStatus: AdminMonthStatusResponse | null;
  lastSimulatedAt?: string | null;
  draftStatusLabel: string;
  onSimulate: () => void;
  onPublish: () => void;
}

const inputClass =
  'bg-param-bg border border-param-border text-xs text-white px-3 py-2 h-10 rounded-[10px] focus:outline-none focus:border-param-primary focus:ring-2 focus:ring-param-primary/30 w-full';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

const deltaTone = (value: number) => (value >= 0 ? 'text-param-success' : 'text-param-danger');

const ProcessingTab: React.FC<ProcessingTabProps> = ({
  scenarioMonth,
  onScenarioMonthChange,
  scenarioSnapshot,
  scenarioCompare,
  scenarioLoading,
  publishLoading,
  canSimulate,
  canPublish,
  publishBlockedReason,
  monthStatus,
  lastSimulatedAt,
  draftStatusLabel,
  onSimulate,
  onPublish
}) => {
  const filteredLeaderboard = (scenarioSnapshot?.leaderboard || []).filter(
    (row) => row.vendedor_id && row.vendedor_id.toLowerCase() !== 'unknown'
  );
  const topRank = filteredLeaderboard[0];
  const secondRank = filteredLeaderboard[1];
  const rankingSummary = topRank
    ? `1º ${topRank.vendedor_id}${secondRank ? `, 2º ${secondRank.vendedor_id}` : ''}`
    : 'Sem ranking disponível';

  const impactRanking = scenarioCompare?.delta?.ranking?.[0];
  const impactMessage = impactRanking
    ? impactRanking.rank_delta === null
      ? 'Sem mudança relevante no ranking.'
      : `${impactRanking.vendedor_id} ${impactRanking.rank_delta > 0 ? 'sobe' : 'cai'} ${Math.abs(
          impactRanking.rank_delta
        )} posição(ões).`
    : 'Simule para visualizar impactos no ranking.';

  const monthLocked = monthStatus?.is_closed;
  const deltaValues = scenarioCompare
    ? [
        Number(scenarioCompare.delta.kpis.comissao_mtd || 0),
        Number(scenarioCompare.delta.kpis.premio_mtd || 0),
        Number(scenarioCompare.delta.kpis.forecast_comissao || 0),
        Number(scenarioCompare.delta.kpis.gap_diario || 0)
      ]
    : [];
  const hasMeaningfulDelta = deltaValues.some((value) => Math.abs(value) > 0.01);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <WidgetCard title="Controle do Mês" className="lg:col-span-1">
        <div className="flex flex-col gap-4 text-xs text-gray-300">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Mês de fechamento</div>
            <input
              type="month"
              className={inputClass}
              value={scenarioMonth}
              onChange={(event) => onScenarioMonthChange(event.target.value)}
            />
          </div>

          <div className={`border rounded-[10px] px-3 py-2 ${monthLocked ? 'border-param-danger/60 bg-param-danger/10' : 'border-param-border bg-param-bg'}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500">
              <Lock className="w-3 h-3" />
              Status do mês
            </div>
            <div className={`text-sm font-bold ${monthLocked ? 'text-param-danger' : 'text-param-success'}`}>
              {monthLocked ? 'Fechado para alterações' : 'Aberto para simulação'}
            </div>
            <div className="text-[10px] text-white/50 mt-1">
              {monthStatus?.message || 'Confirme antes de publicar regras oficiais.'}
            </div>
          </div>

          <div className="border border-param-border rounded-[10px] px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Rascunho</div>
            <div className="text-sm font-bold text-white">{draftStatusLabel}</div>
            <div className="text-[10px] text-white/40 mt-1">
              Última simulação: {formatDateTime(lastSimulatedAt)}
            </div>
            <div className="text-[10px] text-white/50 mt-2">
              A simulação usa o rascunho apenas como prévia. O Ops só muda após “Oficializar”.
            </div>
          </div>

          <button
            type="button"
            onClick={onSimulate}
            disabled={!canSimulate || scenarioLoading || monthLocked}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-accent text-param-accent hover:border-param-primary disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {scenarioLoading ? 'Simulando...' : 'Simular cenário'}
          </button>

          <button
            type="button"
            onClick={onPublish}
            disabled={!canPublish || publishLoading || monthLocked}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-danger bg-param-danger text-white hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {publishLoading ? 'Publicando...' : 'Oficializar regras e processar mês'}
          </button>
          {publishBlockedReason && (
            <div className="text-[10px] text-white/50">{publishBlockedReason}</div>
          )}
        </div>
      </WidgetCard>

      <WidgetCard title="Resultado da Simulação" className="lg:col-span-2">
        <div className="flex flex-col gap-4 text-xs text-gray-300">
          {!scenarioSnapshot && <div className="text-gray-600 italic">Rode uma simulação para visualizar o impacto.</div>}
          {scenarioSnapshot && (
            <>
              <div className="border border-param-border rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Ranking previsto</div>
                <div className="text-lg font-bold text-white">{rankingSummary}</div>
                <div className="text-[10px] text-white/50 mt-1">{impactMessage}</div>
                {!hasMeaningfulDelta && (
                  <div className="text-[10px] text-white/50 mt-2">
                    Nenhuma mudança detectada nos KPIs principais. Alterações apenas de meta afetam ritmo e gap.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">Comissão MTD</div>
                  <div className="text-sm font-bold text-white">
                    {formatCurrencyBRL(scenarioSnapshot.kpis.comissao_mtd)}
                  </div>
                  <div className="text-[10px] text-white/40">Receita da corretora</div>
                </div>
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">Prêmio MTD</div>
                  <div className="text-sm font-bold text-white">
                    {formatCurrencyBRL(scenarioSnapshot.kpis.premio_mtd)}
                  </div>
                  <div className="text-[10px] text-white/40">Valor total segurado</div>
                </div>
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">Forecast de comissão</div>
                  <div className="text-sm font-bold text-white">
                    {formatCurrencyBRL(scenarioSnapshot.kpis.forecast_comissao)}
                  </div>
                </div>
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">Gap diário</div>
                  <div className="text-sm font-bold text-white">
                    {formatCurrencyBRL(scenarioSnapshot.kpis.gap_diario)}
                  </div>
                </div>
              </div>

              {scenarioCompare && (
                <div className="border-t border-param-border pt-4">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Delta vs atual</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'comissao_mtd', label: 'Comissão MTD' },
                      { key: 'premio_mtd', label: 'Prêmio MTD' },
                      { key: 'forecast_comissao', label: 'Forecast' },
                      { key: 'gap_diario', label: 'Gap Diário' }
                    ].map((item) => {
                      const value = Number(scenarioCompare.delta.kpis[item.key] || 0);
                      return (
                        <div key={item.key} className="p-3 border border-param-border rounded-xl">
                          <div className="text-[10px] text-gray-500">{item.label}</div>
                          <div className={`text-sm font-bold ${deltaTone(value)}`}>
                            {formatSignedCurrencyBRL(value)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </WidgetCard>
    </div>
  );
};

export default ProcessingTab;
