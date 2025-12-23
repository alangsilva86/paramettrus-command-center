import React, { useEffect, useMemo, useState } from 'react';
import WidgetCard from './WidgetCard';
import {
  createRulesVersion,
  fetchScenarioSnapshot,
  fetchScenarioHistory,
  fetchSnapshotCompare,
  listRulesVersions,
  triggerIngestion
} from '../services/zohoService';
import { DashboardSnapshot, RulesVersionItem, SnapshotCompare, StatusResponse } from '../types';
import { RefreshCw, Play, Save, ShieldCheck, Sparkles } from 'lucide-react';

interface AdminPanelProps {
  monthRef: string;
  status: StatusResponse | null;
  onStatusRefresh: () => Promise<void>;
  onReloadDashboard: () => void;
}

const buildScenarioId = () => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  return `scn_${stamp}`;
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  AUTO: 1.0,
  VIDA: 2.0,
  RESID: 1.8,
  EMP: 1.6,
  COND: 1.2,
  OUTROS: 1.0
};

const DEFAULT_BONUSES = {
  cross_sell: 500,
  combo_breaker: 800,
  salvamento_d5: 600
};

const inputClass =
  'bg-param-bg border border-param-border text-xs text-white px-3 py-2 h-10 rounded-[10px] focus:outline-none focus:border-param-primary focus:ring-2 focus:ring-param-primary/30';

const AdminPanel: React.FC<AdminPanelProps> = ({ monthRef, status, onStatusRefresh, onReloadDashboard }) => {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('param_admin_token') || '');
  const [actor, setActor] = useState(() => localStorage.getItem('param_admin_actor') || 'admin-ui');
  const [rules, setRules] = useState<RulesVersionItem[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesMessage, setRulesMessage] = useState('');
  const [rulesError, setRulesError] = useState('');
  const [ingestLoading, setIngestLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioSnapshot, setScenarioSnapshot] = useState<DashboardSnapshot | null>(null);
  const [scenarioCompare, setScenarioCompare] = useState<SnapshotCompare | null>(null);
  const [scenarioHistory, setScenarioHistory] = useState<DashboardSnapshot[]>([]);
  const [scenarioHistoryLoading, setScenarioHistoryLoading] = useState(false);

  const [formTouched, setFormTouched] = useState(false);
  const [formState, setFormState] = useState(() => ({
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    meta_global_comissao: '170000',
    dias_uteis: '22',
    product_weights: Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => [k, String(v)])),
    bonus_events: Object.fromEntries(Object.entries(DEFAULT_BONUSES).map(([k, v]) => [k, String(v)])),
    churn_lock_xp: true,
    audit_note: '',
    force: false
  }));

  const [scenarioMonth, setScenarioMonth] = useState(monthRef);
  const [scenarioId, setScenarioId] = useState(buildScenarioId());
  const [scenarioRulesId, setScenarioRulesId] = useState('');

  const deltaTone = (value: number) => (value >= 0 ? 'text-param-success' : 'text-param-danger');
  const formatDeltaValue = (value: number, isPct = false) => {
    if (isPct) return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
    const formatted = Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    return `${value >= 0 ? '+' : '-'} R$ ${formatted}`;
  };

  useEffect(() => {
    localStorage.setItem('param_admin_token', adminToken);
  }, [adminToken]);

  useEffect(() => {
    localStorage.setItem('param_admin_actor', actor);
  }, [actor]);

  useEffect(() => {
    setScenarioMonth(monthRef);
  }, [monthRef]);

  const latestRule = useMemo(() => (rules.length > 0 ? rules[0] : null), [rules]);

  const loadRules = async () => {
    setRulesLoading(true);
    setRulesError('');
    try {
      const items = await listRulesVersions(adminToken);
      setRules(items);
    } catch (error: any) {
      setRulesError(error.message || 'Falha ao listar rules versions');
    } finally {
      setRulesLoading(false);
    }
  };

  const loadScenarioHistory = async (targetMonth = scenarioMonth) => {
    setScenarioHistoryLoading(true);
    setRulesError('');
    try {
      const items = await fetchScenarioHistory(targetMonth);
      setScenarioHistory(items);
    } catch (error: any) {
      setRulesError(error.message || 'Falha ao carregar histórico de cenários');
    } finally {
      setScenarioHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [adminToken]);

  useEffect(() => {
    loadScenarioHistory();
  }, [scenarioMonth]);

  useEffect(() => {
    if (latestRule && !formTouched) {
      setFormState((prev) => ({
        ...prev,
        effective_from: latestRule.effective_from || prev.effective_from,
        effective_to: latestRule.effective_to || '',
        meta_global_comissao: String(latestRule.meta_global_comissao ?? prev.meta_global_comissao),
        dias_uteis: String(latestRule.dias_uteis ?? prev.dias_uteis),
        product_weights: Object.fromEntries(
          Object.entries(latestRule.product_weights || DEFAULT_WEIGHTS).map(([k, v]) => [k, String(v)])
        ),
        bonus_events: Object.fromEntries(
          Object.entries(latestRule.bonus_events || DEFAULT_BONUSES).map(([k, v]) => [k, String(v)])
        ),
        churn_lock_xp: Boolean(latestRule.penalties?.churn_lock_xp ?? true),
        audit_note: latestRule.audit_note || ''
      }));
    }
  }, [latestRule, formTouched]);

  const handleWeightChange = (key: string, value: string) => {
    setFormTouched(true);
    setFormState((prev) => ({
      ...prev,
      product_weights: { ...prev.product_weights, [key]: value }
    }));
  };

  const handleBonusChange = (key: string, value: string) => {
    setFormTouched(true);
    setFormState((prev) => ({
      ...prev,
      bonus_events: { ...prev.bonus_events, [key]: value }
    }));
  };

  const handleCreateRules = async () => {
    setRulesMessage('');
    setRulesError('');
    try {
      const payload = {
        effective_from: formState.effective_from,
        effective_to: formState.effective_to || null,
        meta_global_comissao: Number(formState.meta_global_comissao || 0),
        dias_uteis: Number(formState.dias_uteis || 0),
        product_weights: Object.fromEntries(
          Object.entries(formState.product_weights).map(([k, v]) => [k, Number(v || 0)])
        ),
        bonus_events: Object.fromEntries(
          Object.entries(formState.bonus_events).map(([k, v]) => [k, Number(v || 0)])
        ),
        penalties: { churn_lock_xp: formState.churn_lock_xp },
        audit_note: formState.audit_note || null,
        force: formState.force
      };

      const result = await createRulesVersion(payload, adminToken, actor);
      setRulesMessage(`Rules version criada: ${result.rules_version_id}`);
      setFormTouched(false);
      await loadRules();
    } catch (error: any) {
      setRulesError(error.message || 'Falha ao criar rules version');
    }
  };

  const handleRunIngestion = async () => {
    setRulesMessage('');
    setRulesError('');
    setIngestLoading(true);
    try {
      await triggerIngestion(adminToken, actor);
      setRulesMessage('Ingestão iniciada. Logs no console.');
      await onStatusRefresh();
      onReloadDashboard();
    } catch (error: any) {
      setRulesError(error.message || 'Falha ao rodar ingestão');
    } finally {
      setIngestLoading(false);
    }
  };

  const handleScenario = async () => {
    setScenarioLoading(true);
    setRulesError('');
    try {
      const snapshot = await fetchScenarioSnapshot(
        scenarioMonth,
        scenarioId,
        scenarioRulesId || undefined
      );
      setScenarioSnapshot(snapshot);
      if (scenarioId) {
        const compare = await fetchSnapshotCompare(scenarioMonth, scenarioId);
        setScenarioCompare(compare);
      } else {
        setScenarioCompare(null);
      }
      await loadScenarioHistory();
    } catch (error: any) {
      setRulesError(error.message || 'Falha ao simular cenário');
    } finally {
      setScenarioLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <WidgetCard title="Admin Ops" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Token Admin</div>
            <input
              type="password"
              className={inputClass}
              value={adminToken}
              placeholder="x-admin-token"
              onChange={(event) => setAdminToken(event.target.value)}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Operador</div>
            <input
              type="text"
              className={inputClass}
              value={actor}
              onChange={(event) => setActor(event.target.value)}
            />
          </div>
          <div className="border-t border-param-border pt-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Ingestão</div>
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2">
              <span>Status</span>
              <span className="flex items-center gap-1 text-gray-300">
                <ShieldCheck className="w-3 h-3 text-param-success" />
                {status?.status || 'UNKNOWN'}
              </span>
            </div>
            <div className="text-[10px] text-gray-600 mb-3">
              Última execução: {status?.last_ingestion_at || '—'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRunIngestion}
                disabled={ingestLoading}
                className="flex-1 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-primary bg-param-primary text-white hover:brightness-110 disabled:opacity-50"
              >
                {ingestLoading ? 'Rodando...' : 'Rodar ingestão'}
              </button>
              <button
                type="button"
                onClick={onReloadDashboard}
                className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-border text-white/80 hover:border-param-primary"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          {(rulesMessage || rulesError) && (
            <div
              className={`text-[10px] mt-2 p-3 rounded-[10px] border ${
                rulesError ? 'border-param-danger text-param-danger' : 'border-param-success text-param-success'
              }`}
            >
              {rulesError || rulesMessage}
            </div>
          )}
        </div>
      </WidgetCard>

      <WidgetCard title="Rules Version (Configuração)" className="lg:col-span-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs text-gray-300">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Efetiva em</div>
                <input
                  type="date"
                  className={inputClass}
                  value={formState.effective_from}
                  onChange={(event) => {
                    setFormTouched(true);
                    setFormState((prev) => ({ ...prev, effective_from: event.target.value }));
                  }}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Meta Global</div>
                <input
                  type="number"
                  className={inputClass}
                  value={formState.meta_global_comissao}
                  onChange={(event) => {
                    setFormTouched(true);
                    setFormState((prev) => ({ ...prev, meta_global_comissao: event.target.value }));
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Dias úteis</div>
                <input
                  type="number"
                  className={inputClass}
                  value={formState.dias_uteis}
                  onChange={(event) => {
                    setFormTouched(true);
                    setFormState((prev) => ({ ...prev, dias_uteis: event.target.value }));
                  }}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Vigência até</div>
                <input
                  type="date"
                  className={inputClass}
                  value={formState.effective_to}
                  onChange={(event) => {
                    setFormTouched(true);
                    setFormState((prev) => ({ ...prev, effective_to: event.target.value }));
                  }}
                />
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Pesos por ramo</div>
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(formState.product_weights).map((key) => (
                  <div key={key}>
                    <div className="text-[10px] text-gray-500 mb-1">{key}</div>
                    <input
                      type="number"
                      step="0.1"
                      className={inputClass}
                      value={formState.product_weights[key]}
                      onChange={(event) => handleWeightChange(key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Bônus</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(formState.bonus_events).map((key) => (
                  <div key={key}>
                    <div className="text-[10px] text-gray-500 mb-1">{key}</div>
                    <input
                      type="number"
                      className={inputClass}
                      value={formState.bonus_events[key]}
                      onChange={(event) => handleBonusChange(key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formState.churn_lock_xp}
                onChange={(event) => {
                  setFormTouched(true);
                  setFormState((prev) => ({ ...prev, churn_lock_xp: event.target.checked }));
                }}
              />
              <span className="text-[10px] text-gray-400">Travar bônus com churn (RN02)</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formState.force}
                onChange={(event) => {
                  setFormTouched(true);
                  setFormState((prev) => ({ ...prev, force: event.target.checked }));
                }}
              />
              <span className="text-[10px] text-gray-400">Permitir efetivo no passado (force)</span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Audit note</div>
              <textarea
                className={`${inputClass} min-h-[72px] h-auto`}
                value={formState.audit_note}
                onChange={(event) => {
                  setFormTouched(true);
                  setFormState((prev) => ({ ...prev, audit_note: event.target.value }));
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateRules}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-primary bg-param-primary text-white hover:brightness-110"
              >
                <Save className="w-4 h-4" />
                Criar rules
              </button>
              <button
                type="button"
                onClick={loadRules}
                className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-border text-white/80 hover:border-param-primary"
              >
                Atualizar lista
              </button>
            </div>
          </div>
        </div>
      </WidgetCard>

      <WidgetCard title="Cenário (Simulação)" className="lg:col-span-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs text-gray-300">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Mês</div>
              <input
                type="month"
                className={inputClass}
                value={scenarioMonth}
                onChange={(event) => setScenarioMonth(event.target.value)}
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Scenario ID</div>
              <input
                type="text"
                className={inputClass}
                value={scenarioId}
                onChange={(event) => setScenarioId(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setScenarioId(buildScenarioId())}
                className="mt-2 text-[10px] uppercase tracking-widest text-gray-500 hover:text-param-primary"
              >
                Gerar novo ID
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Rules version</div>
              <select
                className={inputClass}
                value={scenarioRulesId}
                onChange={(event) => setScenarioRulesId(event.target.value)}
              >
                <option value="">Auto (por data)</option>
                {rules.map((rule) => (
                  <option key={rule.rules_version_id} value={rule.rules_version_id}>
                    {rule.rules_version_id}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleScenario}
              disabled={scenarioLoading}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-accent text-param-accent hover:border-param-primary disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {scenarioLoading ? 'Simulando...' : 'Rodar cenário'}
            </button>
          </div>

          <div className="lg:col-span-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Resumo do cenário</div>
            {scenarioSnapshot ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">Forecast % meta</div>
                  <div className="text-lg font-bold text-param-success">
                    {(scenarioSnapshot.kpis.forecast_pct_meta * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">Gap diário</div>
                  <div className="text-lg font-bold text-param-primary">
                    R$ {scenarioSnapshot.kpis.gap_diario.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">Auto share</div>
                  <div className="text-lg font-bold text-param-danger">
                    {(scenarioSnapshot.kpis.auto_share_comissao * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 border border-param-border rounded-xl">
                  <div className="text-[10px] text-gray-500">XP Leaders</div>
                  <div className="text-lg font-bold text-param-accent">
                    {scenarioSnapshot.leaderboard.length}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-600 italic">Sem cenário rodado ainda.</div>
            )}

            {scenarioCompare && (
              <div className="mt-4 pt-3 border-t border-param-border">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Delta vs Atual</div>
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
                          {formatDeltaValue(value)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Mudanças de Ranking</div>
                  <div className="space-y-2">
                    {scenarioCompare.delta.ranking.map((item) => (
                      <div key={item.vendedor_id} className="flex items-center justify-between text-[10px] text-gray-400">
                        <span className="text-white font-bold">{item.vendedor_id}</span>
                        <span>
                          {item.base_rank ?? '—'} → {item.scenario_rank ?? '—'} (
                          <span className={deltaTone(item.rank_delta || 0)}>
                            {item.rank_delta !== null ? `${item.rank_delta >= 0 ? '+' : ''}${item.rank_delta}` : '—'}
                          </span>
                          )
                        </span>
                      </div>
                    ))}
                    {scenarioCompare.delta.ranking.length === 0 && (
                      <div className="text-gray-600 italic">Sem variações relevantes.</div>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Mix (Δ share)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {scenarioCompare.delta.mix.slice(0, 6).map((item) => (
                      <div key={item.ramo} className="flex items-center justify-between text-[10px] text-gray-400">
                        <span className="text-white font-bold">{item.ramo}</span>
                        <span className={deltaTone(item.share_delta)}>
                          {item.share_delta >= 0 ? '+' : ''}
                          {(item.share_delta * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                    {scenarioCompare.delta.mix.length === 0 && (
                      <div className="text-gray-600 italic">Sem variações de mix.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </WidgetCard>

      <WidgetCard title="Histórico de Rules Versions" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          {rulesLoading && <div className="text-gray-600 italic">Carregando rules...</div>}
          {!rulesLoading && rules.length === 0 && (
            <div className="text-gray-600 italic">Nenhuma rules version encontrada.</div>
          )}
          {!rulesLoading &&
            rules.slice(0, 6).map((rule) => (
              <div key={rule.rules_version_id} className="border border-param-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{rule.rules_version_id}</span>
                  <span className="text-[10px] text-gray-500">{rule.effective_from}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Meta: R$ {Number(rule.meta_global_comissao || 0).toLocaleString('pt-BR')}
                </div>
                <div className="text-[10px] text-gray-500">
                  Dias úteis: {rule.dias_uteis}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-2">
                  <Sparkles className="w-3 h-3 text-param-primary" />
                  {rule.audit_note || 'Sem audit note'}
                </div>
              </div>
            ))}
        </div>
      </WidgetCard>

      <WidgetCard title="Histórico de Cenários" className="lg:col-span-2">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          {scenarioHistoryLoading && <div className="text-gray-600 italic">Carregando cenários...</div>}
          {!scenarioHistoryLoading && scenarioHistory.length === 0 && (
            <div className="text-gray-600 italic">Nenhum cenário encontrado.</div>
          )}
          {!scenarioHistoryLoading &&
            scenarioHistory.slice(0, 6).map((scenario) => (
              <div key={scenario.scenario_id || scenario.month} className="border border-param-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{scenario.scenario_id || 'SCN'}</span>
                  <span className="text-[10px] text-gray-500">
                    {scenario.created_at ? new Date(scenario.created_at).toLocaleString('pt-BR') : '—'}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Forecast: {(scenario.kpis.forecast_pct_meta * 100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-gray-500">
                  Gap diário: R$ {scenario.kpis.gap_diario.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
        </div>
      </WidgetCard>
    </div>
  );
};

export default AdminPanel;
