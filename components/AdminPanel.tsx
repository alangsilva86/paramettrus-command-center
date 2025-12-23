import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createRulesVersion,
  fetchDashboardSnapshot,
  fetchMonthStatus,
  fetchScenarioHistory,
  fetchSnapshotCompare,
  fetchZohoHealth,
  reprocessSnapshot,
  simulateScenarioDraft,
  triggerIngestion,
  listRulesVersions
} from '../services/zohoService';
import {
  AdminHealthResponse,
  AdminMonthStatusResponse,
  DashboardSnapshot,
  RulesVersionItem,
  SnapshotCompare,
  StatusResponse,
  DataCoverage
} from '../types';
import AdminHeader from '../src/components/admin/AdminHeader';
import AdminTabs, { AdminTabItem } from '../src/components/admin/AdminTabs';
import OverviewTab from '../src/components/admin/OverviewTab';
import RulesTab from '../src/components/admin/RulesTab';
import ProcessingTab from '../src/components/admin/ProcessingTab';
import AuditTab from '../src/components/admin/AuditTab';
import ToastStack, { ToastMessage } from '../src/components/admin/ToastStack';
import ConfirmModal from '../src/components/admin/ConfirmModal';
import { RulesDraft, RulesValidation } from '../src/components/admin/types';

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

const sortEntries = (entries: Array<[string, string]>) =>
  entries.sort(([a], [b]) => a.localeCompare(b));

const buildPayload = (draft: RulesDraft) => ({
  effective_from: draft.effective_from,
  effective_to: draft.effective_to || null,
  meta_global_comissao: Number(draft.meta_global_comissao || 0),
  dias_uteis: Number(draft.dias_uteis || 0),
  product_weights: Object.fromEntries(
    sortEntries(Object.entries(draft.product_weights)).map(([key, value]) => [key, Number(value || 0)])
  ),
  bonus_events: Object.fromEntries(
    sortEntries(Object.entries(draft.bonus_events)).map(([key, value]) => [key, Number(value || 0)])
  ),
  penalties: { churn_lock_xp: draft.churn_lock_xp },
  audit_note: draft.audit_note || null,
  force: draft.force
});

const validateDraft = (draft: RulesDraft): RulesValidation => {
  const messages: string[] = [];
  const fieldErrors: Record<string, string> = {};

  const meta = Number(draft.meta_global_comissao || 0);
  if (!meta || meta <= 0) {
    messages.push('Meta mensal precisa ser maior que zero.');
    fieldErrors.meta_global_comissao = 'Meta inválida';
  }
  const dias = Number(draft.dias_uteis || 0);
  if (!dias || dias <= 0) {
    messages.push('Dias úteis precisa ser maior que zero.');
    fieldErrors.dias_uteis = 'Dias úteis inválido';
  }

  Object.entries(draft.product_weights || {}).forEach(([key, value]) => {
    const weight = Number(value || 0);
    if (weight < 0) {
      messages.push(`Peso negativo em ${key} não é permitido.`);
      fieldErrors[`weight_${key}`] = 'Peso negativo';
    }
  });

  return {
    isValid: messages.length === 0,
    messages,
    fieldErrors
  };
};

const AdminPanel: React.FC<AdminPanelProps> = ({
  monthRef,
  status,
  onStatusRefresh,
  onReloadDashboard
}) => {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('param_admin_token') || '');
  const [actor, setActor] = useState(() => localStorage.getItem('param_admin_actor') || 'gestor');
  type AdminTabId = 'overview' | 'rules' | 'processing' | 'audit';
  const [activeTab, setActiveTab] = useState<AdminTabId>('overview');

  const [rules, setRules] = useState<RulesVersionItem[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  const [health, setHealth] = useState<AdminHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [dataCoverage, setDataCoverage] = useState<DataCoverage | null>(null);
  const [dataCoverageLoading, setDataCoverageLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<string[]>([]);

  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestProgress, setIngestProgress] = useState(0);
  const ingestTimer = useRef<NodeJS.Timeout | null>(null);

  const [scenarioMonth, setScenarioMonth] = useState(monthRef);
  const [scenarioSnapshot, setScenarioSnapshot] = useState<DashboardSnapshot | null>(null);
  const [scenarioCompare, setScenarioCompare] = useState<SnapshotCompare | null>(null);
  const [scenarioHistory, setScenarioHistory] = useState<DashboardSnapshot[]>([]);
  const [scenarioHistoryLoading, setScenarioHistoryLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  const [monthStatus, setMonthStatus] = useState<AdminMonthStatusResponse | null>(null);

  const [publishLoading, setPublishLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [lastSimulatedHash, setLastSimulatedHash] = useState<string | null>(null);
  const [lastSimulatedAt, setLastSimulatedAt] = useState<string | null>(null);

  const [draftTouched, setDraftTouched] = useState(false);
  const [draft, setDraft] = useState<RulesDraft>(() => ({
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

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const envLabel = (status?.environment || 'unknown').toUpperCase();
  const isProdEnv = envLabel.includes('PROD');

  const latestRule = useMemo(() => (rules.length > 0 ? rules[0] : null), [rules]);
  const draftPayload = useMemo(() => buildPayload(draft), [draft]);
  const draftHash = useMemo(() => JSON.stringify(draftPayload), [draftPayload]);
  const validation = useMemo(() => validateDraft(draft), [draft]);

  const draftStatusLabel = !draftTouched
    ? 'Sem alterações pendentes'
    : lastSimulatedHash && lastSimulatedHash === draftHash
    ? 'Simulação pronta para publicar'
    : 'Rascunho alterado (precisa simular)';

  const publishBlockedReason = useMemo(() => {
    if (monthStatus?.is_closed) return 'Mês fechado: publicação bloqueada.';
    if (!validation.isValid) return 'Corrija os campos inválidos antes de publicar.';
    if (!lastSimulatedHash) return 'Simule o cenário antes de publicar.';
    if (lastSimulatedHash !== draftHash) return 'Rascunho mudou após a última simulação.';
    return '';
  }, [monthStatus, validation.isValid, lastSimulatedHash, draftHash]);

  const canSimulate = validation.isValid && !monthStatus?.is_closed;
  const canPublish = validation.isValid && !!lastSimulatedHash && lastSimulatedHash === draftHash && !monthStatus?.is_closed;

  const pushToast = (type: ToastMessage['type'], message: string) => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4500);
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

  useEffect(() => {
    setScenarioSnapshot(null);
    setScenarioCompare(null);
    setLastSimulatedHash(null);
    setLastSimulatedAt(null);
  }, [scenarioMonth]);

  useEffect(() => {
    if (latestRule && !draftTouched) {
      setDraft((prev) => ({
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
  }, [latestRule, draftTouched]);

  useEffect(() => {
    const loadRules = async () => {
      setRulesLoading(true);
      try {
        const items = await listRulesVersions(adminToken);
        setRules(items);
      } catch (error: any) {
        pushToast('error', error.message || 'Falha ao carregar regras');
      } finally {
        setRulesLoading(false);
      }
    };
    loadRules();
  }, [adminToken]);

  useEffect(() => {
    const loadHealth = async () => {
      setHealthLoading(true);
      try {
        const payload = await fetchZohoHealth(adminToken, actor);
        setHealth(payload);
      } catch (error: any) {
        setHealth({ status: 'error', error: error.message });
        pushToast('error', error.message || 'Falha ao testar conexões');
      } finally {
        setHealthLoading(false);
      }
    };
    loadHealth();
  }, [adminToken, actor]);

  useEffect(() => {
    const loadDataCoverage = async () => {
      setDataCoverageLoading(true);
      try {
        const snapshot = await fetchDashboardSnapshot(monthRef);
        setDataCoverage(snapshot.data_coverage);
        setProductOptions(snapshot.filters?.ramos || []);
      } catch (error: any) {
        pushToast('error', error.message || 'Falha ao carregar qualidade dos dados');
      } finally {
        setDataCoverageLoading(false);
      }
    };
    loadDataCoverage();
  }, [monthRef]);

  useEffect(() => {
    const loadScenarioHistory = async () => {
      setScenarioHistoryLoading(true);
      try {
        const items = await fetchScenarioHistory(scenarioMonth);
        setScenarioHistory(items);
      } catch (error: any) {
        pushToast('error', error.message || 'Falha ao carregar histórico de cenários');
      } finally {
        setScenarioHistoryLoading(false);
      }
    };
    loadScenarioHistory();
  }, [scenarioMonth]);

  useEffect(() => {
    const loadMonthStatus = async () => {
      try {
        const payload = await fetchMonthStatus(scenarioMonth, adminToken);
        setMonthStatus(payload);
      } catch (error: any) {
        pushToast('error', error.message || 'Falha ao consultar bloqueio do mês');
      }
    };
    loadMonthStatus();
  }, [scenarioMonth, adminToken]);

  useEffect(() => {
    return () => {
      if (ingestTimer.current) {
        clearInterval(ingestTimer.current);
      }
    };
  }, []);

  const startIngestProgress = () => {
    if (ingestTimer.current) clearInterval(ingestTimer.current);
    setIngestProgress(8);
    ingestTimer.current = setInterval(() => {
      setIngestProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.random() * 6 + 2;
      });
    }, 700);
  };

  const stopIngestProgress = (success: boolean) => {
    if (ingestTimer.current) clearInterval(ingestTimer.current);
    setIngestProgress(success ? 100 : 0);
    setTimeout(() => setIngestProgress(0), 1200);
  };

  const handleDraftFieldChange = (field: keyof RulesDraft, value: string | boolean) => {
    setDraftTouched(true);
    setDraft((prev) => ({ ...prev, [field]: value } as RulesDraft));
  };

  const handleWeightChange = (product: string, value: string) => {
    setDraftTouched(true);
    setDraft((prev) => ({
      ...prev,
      product_weights: { ...prev.product_weights, [product]: value }
    }));
  };

  const handleBonusChange = (bonusKey: string, value: string) => {
    setDraftTouched(true);
    setDraft((prev) => ({
      ...prev,
      bonus_events: { ...prev.bonus_events, [bonusKey]: value }
    }));
  };

  const handleResetDraft = () => {
    if (!latestRule) return;
    setDraftTouched(false);
    setDraft((prev) => ({
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
    pushToast('info', 'Rascunho revertido para a regra vigente.');
  };

  const handleRunIngestion = async () => {
    setIngestLoading(true);
    startIngestProgress();
    try {
      await triggerIngestion(adminToken, actor);
      pushToast('success', 'Sincronização iniciada. Você verá os dados atualizados em instantes.');
      await onStatusRefresh();
      onReloadDashboard();
      stopIngestProgress(true);
    } catch (error: any) {
      stopIngestProgress(false);
      pushToast('error', error.message || 'Falha ao sincronizar dados');
    } finally {
      setIngestLoading(false);
    }
  };

  const handleSimulate = async () => {
    setScenarioLoading(true);
    try {
      const scenarioId = buildScenarioId();
      const snapshot = await simulateScenarioDraft(
        scenarioMonth,
        scenarioId,
        buildPayload(draft),
        adminToken,
        actor
      );
      setScenarioSnapshot(snapshot);
      try {
        const compare = await fetchSnapshotCompare(scenarioMonth, scenarioId);
        setScenarioCompare(compare);
      } catch (error: any) {
        setScenarioCompare(null);
        pushToast('warning', error.message || 'Falha ao comparar cenário com o atual.');
      }
      setLastSimulatedHash(draftHash);
      setLastSimulatedAt(new Date().toISOString());
      pushToast('success', 'Simulação concluída. Confira o impacto no ranking.');
      const history = await fetchScenarioHistory(scenarioMonth);
      setScenarioHistory(history);
    } catch (error: any) {
      pushToast('error', error.message || 'Falha ao simular cenário');
    } finally {
      setScenarioLoading(false);
    }
  };

  const handlePublish = async () => {
    setPublishLoading(true);
    try {
      const payload = buildPayload(draft);
      const result = await createRulesVersion(payload, adminToken, actor);
      await reprocessSnapshot(scenarioMonth, result.rules_version_id);
      pushToast('success', 'Regras oficializadas e mês reprocessado.');
      setDraftTouched(false);
      setLastSimulatedHash(null);
      const items = await listRulesVersions(adminToken);
      setRules(items);
      await onStatusRefresh();
      onReloadDashboard();
    } catch (error: any) {
      pushToast('error', error.message || 'Falha ao publicar regras');
    } finally {
      setConfirmOpen(false);
      setPublishLoading(false);
    }
  };

  const tabs: AdminTabItem[] = [
    {
      id: 'overview',
      label: 'Visão Geral & Conexões',
      hint: 'Saúde das integrações e sincronização'
    },
    {
      id: 'rules',
      label: 'Regras do Jogo',
      hint: 'Defina metas, pesos e bônus',
      alert: draftTouched
    },
    {
      id: 'processing',
      label: 'Fechamento & Simulação',
      hint: 'Simule antes de publicar e processe o mês'
    },
    {
      id: 'audit',
      label: 'Auditoria',
      hint: 'Histórico de alterações e simulações',
      badge: scenarioHistory.length
    }
  ];

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader environmentLabel={envLabel} isProd={isProdEnv} />

      <AdminTabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as AdminTabId)} />

      {activeTab === 'overview' && (
        <OverviewTab
          adminToken={adminToken}
          actor={actor}
          status={status}
          health={health}
          healthLoading={healthLoading}
          ingestLoading={ingestLoading}
          ingestProgress={ingestProgress}
          dataCoverage={dataCoverage}
          dataCoverageLoading={dataCoverageLoading}
          environmentLabel={envLabel}
          onAdminTokenChange={setAdminToken}
          onActorChange={setActor}
          onRefreshHealth={async () => {
            try {
              setHealthLoading(true);
              const payload = await fetchZohoHealth(adminToken, actor);
              setHealth(payload);
              pushToast('success', 'Conexões verificadas com sucesso.');
            } catch (error: any) {
              setHealth({ status: 'error', error: error.message });
              pushToast('error', error.message || 'Falha ao testar conexões');
            } finally {
              setHealthLoading(false);
            }
          }}
          onRefreshStatus={onStatusRefresh}
          onRunIngestion={handleRunIngestion}
          onReloadDashboard={onReloadDashboard}
          onShowQualityIssues={() => pushToast('info', 'Filtro detalhado em construção.')}
        />
      )}

      {activeTab === 'rules' && (
        <RulesTab
          draft={draft}
          validation={validation}
          products={productOptions}
          publishedRule={latestRule}
          draftTouched={draftTouched}
          onDraftFieldChange={handleDraftFieldChange}
          onWeightChange={handleWeightChange}
          onBonusChange={handleBonusChange}
          onResetDraft={handleResetDraft}
        />
      )}

      {activeTab === 'processing' && (
        <ProcessingTab
          scenarioMonth={scenarioMonth}
          onScenarioMonthChange={setScenarioMonth}
          scenarioSnapshot={scenarioSnapshot}
          scenarioCompare={scenarioCompare}
          scenarioLoading={scenarioLoading}
          publishLoading={publishLoading}
          canSimulate={canSimulate}
          canPublish={canPublish}
          publishBlockedReason={publishBlockedReason}
          monthStatus={monthStatus}
          lastSimulatedAt={lastSimulatedAt}
          draftStatusLabel={draftStatusLabel}
          onSimulate={handleSimulate}
          onPublish={() => setConfirmOpen(true)}
        />
      )}

      {activeTab === 'audit' && (
        <AuditTab
          rules={rules}
          rulesLoading={rulesLoading}
          scenarioHistory={scenarioHistory}
          scenarioHistoryLoading={scenarioHistoryLoading}
        />
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Reprocessar mês inteiro"
        description="Você está prestes a oficializar as regras e recalcular todo o mês selecionado. Essa ação impacta o painel de vendas e pode demorar alguns minutos."
        confirmLabel="Oficializar e recalcular"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handlePublish}
        loading={publishLoading}
      />

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))}
      />
    </div>
  );
};

export default AdminPanel;
