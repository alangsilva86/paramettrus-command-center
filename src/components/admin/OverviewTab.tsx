import React from 'react';
import { Activity, Database, PlugZap, RefreshCw } from 'lucide-react';
import WidgetCard from '../../../components/WidgetCard';
import { AdminHealthResponse, DataCoverage, StatusResponse } from '../../../types';

interface OverviewTabProps {
  adminToken: string;
  actor: string;
  status: StatusResponse | null;
  health: AdminHealthResponse | null;
  healthLoading: boolean;
  ingestLoading: boolean;
  ingestProgress: number;
  dataCoverage: DataCoverage | null;
  dataCoverageLoading: boolean;
  environmentLabel: string;
  onAdminTokenChange: (value: string) => void;
  onActorChange: (value: string) => void;
  onRefreshHealth: () => void;
  onRefreshStatus: () => void;
  onRunIngestion: () => void;
  onReloadDashboard: () => void;
  onShowQualityIssues: () => void;
}

const inputClass =
  'bg-param-bg border border-param-border text-xs text-white px-3 py-2 h-10 rounded-[10px] focus:outline-none focus:border-param-primary focus:ring-2 focus:ring-param-primary/30';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

const statusTone = (variant: 'ok' | 'warn' | 'error' | 'unknown') => {
  if (variant === 'ok') return 'bg-param-success';
  if (variant === 'warn') return 'bg-param-warning';
  if (variant === 'error') return 'bg-param-danger';
  return 'bg-white/30';
};

const OverviewTab: React.FC<OverviewTabProps> = ({
  adminToken,
  actor,
  status,
  health,
  healthLoading,
  ingestLoading,
  ingestProgress,
  dataCoverage,
  dataCoverageLoading,
  environmentLabel,
  onAdminTokenChange,
  onActorChange,
  onRefreshHealth,
  onRefreshStatus,
  onRunIngestion,
  onReloadDashboard,
  onShowQualityIssues
}) => {
  const zohoStatus = health?.zoho?.status === 'ok' ? 'ok' : health?.status === 'error' ? 'error' : 'unknown';
  const dbStatus = health?.db?.status === 'ok' ? 'ok' : health?.status === 'error' ? 'error' : 'unknown';
  const lastSyncStatus = status?.stale_data
    ? 'warn'
    : status?.status === 'FAILED'
    ? 'error'
    : status?.status
    ? 'ok'
    : 'unknown';

  const validPct = dataCoverage?.valid_pct ?? 0;
  const validPercentLabel = `${Math.round(validPct * 100)}%`;
  const totalContracts = dataCoverage?.contracts_total ?? 0;
  const invalidContracts = dataCoverage?.contracts_invalid ?? 0;
  const incompleteContracts = dataCoverage?.contracts_incomplete ?? 0;
  const issuesCount = invalidContracts + incompleteContracts;
  const processedContracts = totalContracts || dataCoverage?.contracts_valid || 0;
  const processedLabel = dataCoverageLoading ? '—' : `${processedContracts} contratos processados`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <WidgetCard title="Acesso & Operador" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Token Admin</div>
            <input
              type="password"
              className={inputClass}
              value={adminToken}
              placeholder="x-admin-token"
              onChange={(event) => onAdminTokenChange(event.target.value)}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Responsável</div>
            <input
              type="text"
              className={inputClass}
              value={actor}
              onChange={(event) => onActorChange(event.target.value)}
            />
          </div>
          <div className="border-t border-param-border pt-3 text-[10px] text-gray-500">
            Ambiente atual: <span className="text-white/80 font-bold">{environmentLabel}</span>
            <div className="text-gray-600 mt-1">Tokens ficam salvos apenas neste navegador.</div>
          </div>
        </div>
      </WidgetCard>

      <WidgetCard
        title="Status de Conexões"
        className="lg:col-span-2"
        action={
          <button
            type="button"
            onClick={onRefreshHealth}
            disabled={healthLoading}
            className="text-[10px] uppercase tracking-widest text-white/60 hover:text-param-primary"
          >
            {healthLoading ? 'Testando...' : 'Testar Conexão'}
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-300">
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-2 w-2 rounded-full ${statusTone(zohoStatus)}`} />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500">API Zoho</div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <PlugZap className="w-4 h-4 text-param-primary" />
                {health?.zoho?.status === 'ok' ? 'Conectado' : health?.error || 'Sem resposta'}
              </div>
              <div className="text-[10px] text-gray-600 mt-1">
                Último teste: {health?.last_ingestion_at ? formatDateTime(health.last_ingestion_at) : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-2 w-2 rounded-full ${statusTone(dbStatus)}`} />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Database</div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-param-primary" />
                {health?.db?.status === 'ok' ? 'Estável' : health?.error || 'Sem resposta'}
              </div>
              <div className="text-[10px] text-gray-600 mt-1">Latência monitorada pelo middleware.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className={`mt-1 h-2 w-2 rounded-full ${statusTone(lastSyncStatus)} `} />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Última sincronização</div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-param-primary" />
                {formatDateTime(status?.last_ingestion_at)}
              </div>
              <button
                type="button"
                onClick={onRefreshStatus}
                className="mt-2 text-[10px] uppercase tracking-widest text-white/60 hover:text-param-primary"
              >
                Atualizar status
              </button>
            </div>
          </div>
        </div>
      </WidgetCard>

      <WidgetCard title="Sincronização de Dados" className="lg:col-span-2">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRunIngestion}
              disabled={ingestLoading}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-primary bg-param-primary text-white hover:brightness-110 disabled:opacity-50"
            >
              {ingestLoading ? 'Sincronizando...' : 'Sincronizar Dados Agora'}
            </button>
            <button
              type="button"
              onClick={onReloadDashboard}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-border text-white/70 hover:border-param-primary"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar painel
            </button>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-param-primary transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, ingestProgress))}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-500">
            Última atualização: {formatDateTime(status?.last_ingestion_at)} | {processedLabel}
          </div>
        </div>
      </WidgetCard>

      <WidgetCard title="Qualidade dos Dados" className="lg:col-span-1">
        <div className="flex flex-col items-center text-center gap-3 text-xs text-gray-300">
          <div className="relative w-20 h-20">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#FF6B06 ${validPct * 100}%, rgba(255,255,255,0.08) 0)`
              }}
            />
            <div className="absolute inset-2 rounded-full bg-param-card flex items-center justify-center">
              <span className="text-sm font-bold text-white">{dataCoverageLoading ? '—' : validPercentLabel}</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-gray-500">Contratos válidos</div>
            <div className="text-sm font-bold text-white">
              {dataCoverageLoading ? 'Carregando...' : `${totalContracts - invalidContracts} / ${totalContracts}`}
            </div>
          </div>
          <div className="text-[10px] text-gray-500">
            Falhas: {incompleteContracts} incompletos | {invalidContracts} inválidos
          </div>
          <button
            type="button"
            onClick={onShowQualityIssues}
            className="text-[10px] uppercase tracking-widest text-param-primary hover:text-white disabled:text-white/30"
            disabled={issuesCount === 0}
          >
            {issuesCount > 0 ? `Ver ${issuesCount} contratos com erro` : 'Sem erros críticos'}
          </button>
        </div>
      </WidgetCard>
    </div>
  );
};

export default OverviewTab;
