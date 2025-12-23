import React, { useEffect, useMemo, useState } from 'react';
import ZoneGame from './components/ZoneGame';
import ZoneStrategy from './components/ZoneStrategy';
import AdminPanel from './components/AdminPanel';
import CommandBar from './src/components/ops/CommandBar';
import DecisionRow from './src/components/ops/DecisionRow';
import type { AlertItem } from './src/components/ops/AlertCenter';
import DataHealthCard from './src/components/ops/DataHealthCard';
import MonthStatusBadge from './src/components/ops/MonthStatusBadge';
import ExceptionsDrawer from './src/components/ops/ExceptionsDrawer';
import DriversPanel from './src/components/ops/DriversPanel';
import RenewalsPanel from './src/components/ops/RenewalsPanel';
import {
  fetchCrossSellSummary,
  fetchDashboardSnapshot,
  fetchDataQuality,
  fetchExceptionsList,
  fetchRenewalList,
  fetchSnapshotStatus,
  fetchStatus,
  triggerIngestion
} from './services/zohoService';
import { CrossSellSummary, DashboardSnapshot, RenewalListItem, StatusResponse } from './types';
import {
  DataQualityExceptionItem,
  DataQualityResponse,
  QualityStatus,
  SnapshotStatusResponse
} from './src/types/ops';
import { formatCurrencyBRL } from './utils/format';
import { Terminal, ShieldCheck } from 'lucide-react';

const qualityLabelMap: Record<QualityStatus, string> = {
  ok: 'Qualidade OK',
  attention: 'Qualidade em atenção',
  critical: 'Qualidade crítica'
};

const exceptionActionHints: Record<string, string> = {
  unknown_seller: 'Abra o Admin para atribuir vendedor e evitar distorções no ranking.',
  missing_product: 'Atualize o ramo dos contratos no Admin para garantir mix confiável.',
  missing_value: 'Informe prêmio/comissão no Admin para liberar previsões seguras.'
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [renewalsD7, setRenewalsD7] = useState<RenewalListItem[]>([]);
  const [renewalsD15, setRenewalsD15] = useState<RenewalListItem[]>([]);
  const [renewalsD30, setRenewalsD30] = useState<RenewalListItem[]>([]);
  const [crossSell, setCrossSell] = useState<CrossSellSummary | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityResponse | null>(null);
  const [dataQualityLoading, setDataQualityLoading] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatusResponse | null>(null);
  const [snapshotStatusLoading, setSnapshotStatusLoading] = useState(false);
  const [opsError, setOpsError] = useState('');
  const [opsHint, setOpsHint] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [exceptionsType, setExceptionsType] = useState<string | null>(null);
  const [exceptionsItems, setExceptionsItems] = useState<DataQualityExceptionItem[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [exceptionsOffset, setExceptionsOffset] = useState(0);
  const [exceptionsHasMore, setExceptionsHasMore] = useState(false);
  const [exceptionsSearch, setExceptionsSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'ops' | 'admin'>('ops');

  const inputClass =
    'bg-param-bg border border-param-border text-xs text-white px-3 py-2 h-10 rounded-[10px] focus:outline-none focus:border-param-primary focus:ring-2 focus:ring-param-primary/30 w-full';

  const [monthRef, setMonthRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [vendorFilter, setVendorFilter] = useState('');
  const [ramoFilter, setRamoFilter] = useState('');

  const activeFilters = {
    vendorId: vendorFilter || undefined,
    ramo: ramoFilter || undefined
  };

  useEffect(() => {
    const loadOpsData = async () => {
      setLoading(true);
      setOpsError('');
      setDataQualityLoading(true);
      setSnapshotStatusLoading(true);
      setDataQuality(null);
      setSnapshotStatus(null);
      try {
        const results = await Promise.allSettled([
          fetchDashboardSnapshot(monthRef, activeFilters),
          fetchRenewalList(7, activeFilters),
          fetchRenewalList(15, activeFilters),
          fetchRenewalList(30, activeFilters),
          fetchCrossSellSummary(activeFilters),
          fetchStatus(),
          fetchDataQuality(monthRef),
          fetchSnapshotStatus(monthRef)
        ]);

        const errors: string[] = [];
        if (results[0].status === 'fulfilled') setData(results[0].value);
        else errors.push('Falha ao carregar o painel principal.');

        if (results[1].status === 'fulfilled') setRenewalsD7(results[1].value);
        if (results[2].status === 'fulfilled') setRenewalsD15(results[2].value);
        if (results[3].status === 'fulfilled') setRenewalsD30(results[3].value);
        if (results[4].status === 'fulfilled') setCrossSell(results[4].value);
        if (results[5].status === 'fulfilled') setStatus(results[5].value);
        if (results[6].status === 'fulfilled') setDataQuality(results[6].value);
        else errors.push('Qualidade de dados indisponível.');
        if (results[7].status === 'fulfilled') setSnapshotStatus(results[7].value);

        if (errors.length > 0) {
          setOpsError(errors[0]);
        }
      } catch (e) {
        console.error('Failed to load dashboard snapshot', e);
        setOpsError('Falha ao carregar o painel.');
      } finally {
        setLoading(false);
        setDataQualityLoading(false);
        setSnapshotStatusLoading(false);
      }
    };

    const loadStatusOnly = async () => {
      setLoading(false);
      try {
        const statusResponse = await fetchStatus();
        setStatus(statusResponse);
      } catch (e) {
        console.error("Failed to load status", e);
      }
    };

    if (activeTab === 'ops') {
      loadOpsData();
    } else {
      loadStatusOnly();
    }
  }, [monthRef, vendorFilter, ramoFilter, reloadKey, activeTab]);

  const refreshStatus = async () => {
    const statusResponse = await fetchStatus();
    setStatus(statusResponse);
  };

  const reloadDashboard = () => {
    setReloadKey((prev) => prev + 1);
  };

  const handleSyncNow = async () => {
    const adminToken = localStorage.getItem('param_admin_token') || '';
    const adminActor = localStorage.getItem('param_admin_actor') || 'gestor';
    if (!adminToken) {
      setOpsError('Token admin necessário para sincronizar dados.');
      return;
    }
    setSyncLoading(true);
    try {
      await triggerIngestion(adminToken, adminActor);
      reloadDashboard();
    } catch (error: any) {
      setOpsError(error.message || 'Falha ao sincronizar dados.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const payload = {
      month_ref: monthRef,
      generated_at: new Date().toISOString(),
      filters: activeFilters,
      snapshot: data,
      data_quality: dataQuality,
      month_status: snapshotStatus
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `paramettrus_ops_${monthRef}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenExceptions = (preferredType?: string) => {
    const defaultType =
      preferredType ||
      dataQuality?.exceptions.find((item) => item.count > 0)?.type ||
      'unknown_seller';
    setExceptionsType(defaultType);
    setExceptionsOpen(true);
  };

  const handleExceptionAction = (type: string) => {
    setExceptionsOpen(false);
    setActiveTab('admin');
    setOpsHint(exceptionActionHints[type] || 'Abra o painel Admin para corrigir esta exceção.');
  };

  const loadExceptions = async (type: string, offset = 0, append = false) => {
    setExceptionsLoading(true);
    try {
      const response = await fetchExceptionsList(monthRef, type, 20, offset);
      setExceptionsItems((prev) => (append ? [...prev, ...response.items] : response.items));
      setExceptionsOffset(offset + response.items.length);
      setExceptionsHasMore(offset + response.items.length < response.total);
    } catch (error: any) {
      setOpsError(error.message || 'Falha ao carregar exceções.');
    } finally {
      setExceptionsLoading(false);
    }
  };

  useEffect(() => {
    if (!exceptionsOpen || !exceptionsType) return;
    loadExceptions(exceptionsType, 0, false);
    setExceptionsSearch('');
  }, [exceptionsOpen, exceptionsType, monthRef]);

  useEffect(() => {
    setExceptionsOpen(false);
    setExceptionsItems([]);
    setExceptionsOffset(0);
  }, [monthRef]);

  useEffect(() => {
    if (!opsHint) return;
    const timer = setTimeout(() => setOpsHint(''), 7000);
    return () => clearTimeout(timer);
  }, [opsHint]);

  const filterOptions = useMemo(() => {
    const vendors = data?.filters?.vendors || [];
    const ramos = data?.filters?.ramos || [];
    return {
      vendors: vendors.filter((vendor) => vendor && vendor.toLowerCase() !== 'unknown'),
      ramos
    };
  }, [data]);
  const envLabel = (status?.environment || 'unknown').toUpperCase();
  const envBadgeClass = envLabel.includes('PROD')
    ? 'bg-param-danger/20 border-param-danger/60 text-param-danger'
    : envLabel.includes('STAG')
    ? 'bg-param-warning/20 border-param-warning/60 text-param-warning'
    : 'bg-param-success/20 border-param-success/60 text-param-success';

  const qualityInfo = useMemo(() => {
    if (dataQuality) {
      const statusValue = dataQuality.quality_status;
      return {
        status: statusValue,
        label: qualityLabelMap[statusValue],
        reason:
          dataQuality.quality_reason ||
          'Qualidade validada. Acompanhe as exceções listadas.'
      };
    }
    const fallbackStatus: QualityStatus = status?.stale_data ? 'critical' : 'attention';
    const fallbackLabel = qualityLabelMap[fallbackStatus];
    const fallbackReason = status?.stale_data
      ? 'Middleware reportou dados desatualizados; sincronize antes de decidir.'
      : status?.status
      ? `Último status da ingestão: ${status.status}.`
      : 'Qualidade indisponível; revise as conexões.';
    return {
      status: fallbackStatus,
      label: fallbackLabel,
      reason: fallbackReason
    };
  }, [dataQuality, status]);
  const qualityStatus = qualityInfo.status;
  const qualityLabel = qualityInfo.label;
  const qualityReason = qualityInfo.reason;
  const exceptionsCount = dataQuality?.exceptions.reduce((sum, item) => sum + item.count, 0) || 0;

  const lastUpdateLabel = dataQuality?.freshness_minutes !== undefined && dataQuality?.freshness_minutes !== null
    ? `Atualizado há ${dataQuality.freshness_minutes} min`
    : status?.last_ingestion_at
    ? new Date(status.last_ingestion_at).toLocaleString('pt-BR')
    : 'Sem atualização recente';

  const pacePct = data?.kpis?.forecast_pct_meta ? data.kpis.forecast_pct_meta - 1 : 0;
  const gapTotal = data ? Math.max(0, data.kpis.meta_comissao - data.kpis.comissao_mtd) : 0;
  const diasRestantes =
    data && data.kpis.gap_diario > 0 ? Math.max(1, Math.round(gapTotal / data.kpis.gap_diario)) : null;
  const metaValue = data?.kpis?.meta_comissao || 0;
  const realizedValue = data?.kpis?.comissao_mtd || 0;
  const forecastValue = data?.kpis?.forecast_comissao || 0;
  const forecastPct = data?.kpis?.forecast_pct_meta || 0;
  const gapDiario = data?.kpis?.gap_diario || 0;
  const hasAdminToken = Boolean(localStorage.getItem('param_admin_token'));
  const staleForecast = Boolean(status?.stale_data);

  const filteredLeaderboard = useMemo(() => {
    const list = data?.leaderboard || [];
    return list.filter((item) => item.vendedor_id && item.vendedor_id.toLowerCase() !== 'unknown');
  }, [data]);

  const filteredVendorStats = useMemo(() => {
    const list = data?.vendor_stats || [];
    return list.filter((item) => item.vendedor_id && item.vendedor_id.toLowerCase() !== 'unknown');
  }, [data]);

  const alertItems = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    if (status?.stale_data) {
      items.push({
        id: 'stale_data',
        severity: 'critical' as const,
        title: 'Dados desatualizados',
        description: 'Atualize a ingestão para evitar decisões com informação defasada.',
        actionLabel: 'Sincronizar agora',
        onAction: handleSyncNow
      });
    }
    const unknownException = dataQuality?.exceptions.find((item) => item.type === 'unknown_seller');
    if (unknownException && unknownException.count > 0) {
      items.push({
        id: 'unknown_seller',
        severity: 'critical' as const,
        title: 'Contratos sem vendedor',
        description: `${unknownException.count} contratos distorcem o ranking de performance.`,
        impactLabel: `Impacto ${formatCurrencyBRL(unknownException.impact)}`,
        actionLabel: 'Corrigir agora',
        onAction: () => handleOpenExceptions('unknown_seller')
      });
    }
    if (data?.renewals?.d7?.count > 0) {
      items.push({
        id: 'renewals_d7',
        severity: 'critical' as const,
        title: 'Renovações D-7 em risco',
        description: `${data.renewals.d7.count} contas precisam de ação imediata.`,
        impactLabel: `Impacto ${formatCurrencyBRL(data.renewals.d7.comissao_risco)}`,
        actionLabel: 'Ver lista',
        onAction: () => {
          const element = document.getElementById('ops-renewals');
          element?.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
    const missingValue = dataQuality?.exceptions.find((item) => item.type === 'missing_value');
    if (missingValue && missingValue.count > 0) {
      items.push({
        id: 'missing_value',
        severity: 'attention' as const,
        title: 'Contratos sem valor',
        description: `${missingValue.count} registros sem prêmio/comissão.`,
        actionLabel: 'Revisar',
        onAction: () => handleOpenExceptions('missing_value')
      });
    }
    const missingProduct = dataQuality?.exceptions.find((item) => item.type === 'missing_product');
    if (missingProduct && missingProduct.count > 0) {
      items.push({
        id: 'missing_product',
        severity: 'attention' as const,
        title: 'Contratos sem produto',
        description: `${missingProduct.count} registros sem ramo informado.`,
        actionLabel: 'Corrigir',
        onAction: () => handleOpenExceptions('missing_product')
      });
    }

    if (items.length === 0 && data) {
      items.push({
        id: 'pace_check',
        severity: 'info' as const,
        title: 'Ritmo sob controle',
        description: data.kpis.forecast_pct_meta >= 1 ? 'Mês projetado acima da meta.' : 'Acompanhe o ritmo diário.',
        actionLabel: 'Ver drivers',
        onAction: () => {
          const element = document.getElementById('ops-drivers');
          element?.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
    return items.slice(0, 3);
  }, [data, dataQuality, status, handleSyncNow, handleOpenExceptions]);

  return (
    <div className="min-h-screen bg-param-bg text-param-text font-sans p-4 md:p-6 lg:p-8 overflow-x-hidden flex flex-col">
      {/* Header */}
      <header className="flex flex-wrap gap-4 justify-between items-center mb-6 px-4 py-4 rounded-xl bg-param-accent text-white shadow-[0_6px_18px_rgba(0,0,0,0.25)]">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-[10px] text-white">
            <Terminal size={24} strokeWidth={3} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wider text-white leading-none">
              Paramettrus <span className="text-white/70">OPS</span>
            </h1>
            <p className="text-[10px] text-white/70 uppercase tracking-[0.2em] mt-1 flex items-center gap-1">
              Command Center v2.1 <span className="text-white/30">|</span> Growth Edition
            </p>
          </div>
        </div>
          <div className="flex items-center gap-4 text-xs">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-[10px] border ${envBadgeClass}`}>
              <span className="text-white/80">ENV:</span>
              <span className="font-bold">{envLabel}</span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-[10px] border ${status?.stale_data ? 'bg-param-danger/20 border-param-danger/60' : 'bg-white/10 border-white/10'}`}>
              <ShieldCheck className={`w-3 h-3 ${status?.stale_data ? 'text-param-danger' : 'text-param-success'}`} />
              <span className="text-white/80">
                {status?.stale_data ? 'MIDDLEWARE: STALE' : 'MIDDLEWARE: ACTIVE'}
              </span>
            </div>
            <div className="text-white/70 font-mono">
              Cycle: {monthRef}
            </div>
          </div>
      </header>

      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center bg-param-card border border-param-border rounded-xl p-1">
          <button
            type="button"
            onClick={() => setActiveTab('ops')}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-[10px] transition-colors ${
              activeTab === 'ops' ? 'bg-param-primary text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Operações
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-[10px] transition-colors ${
              activeTab === 'admin' ? 'bg-param-danger text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Admin & Config
          </button>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-white/60">
          {activeTab === 'ops' ? 'Foco: operação e performance' : 'Foco: controle e governança'}
        </div>
      </nav>

      {opsHint && (
        <div className="mb-3 px-4 py-2 text-[10px] text-white/80 border border-param-success/40 bg-param-success/10 rounded-[10px]">
          {opsHint}
        </div>
      )}

      {activeTab === 'ops' && (
        <>
          <CommandBar
            meta={metaValue}
            realized={realizedValue}
            pacePct={pacePct}
            lastUpdateLabel={lastUpdateLabel}
            qualityLabel={qualityLabel}
            qualityStatus={qualityStatus}
            qualityReason={qualityReason}
            exceptionsCount={exceptionsCount}
            onSync={handleSyncNow}
            onOpenExceptions={() => handleOpenExceptions()}
            onExport={handleExport}
            syncLoading={syncLoading}
            syncDisabled={!hasAdminToken}
            exportDisabled={!data}
          />

          {opsError && (
            <div className="mt-4 text-[10px] p-3 rounded-[10px] border border-param-danger text-param-danger">
              {opsError}
            </div>
          )}

          {/* Filtros globais */}
          <section className="mb-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-param-card border border-param-border p-4 rounded-xl">
                <div className="text-[10px] uppercase tracking-widest text-white/60 mb-2">Mês</div>
                <input
                  type="month"
                  className={inputClass}
                  value={monthRef}
                  onChange={(event) => setMonthRef(event.target.value)}
                />
              </div>
              <div className="bg-param-card border border-param-border p-4 rounded-xl">
                <div className="text-[10px] uppercase tracking-widest text-white/60 mb-2">Equipe / Vendedor</div>
                <select
                  className={inputClass}
                  value={vendorFilter}
                  onChange={(event) => setVendorFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  {filterOptions.vendors.map((vendor) => (
                    <option key={vendor} value={vendor}>
                      {vendor}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-param-card border border-param-border p-4 rounded-xl">
                <div className="text-[10px] uppercase tracking-widest text-white/60 mb-2">Produto</div>
                <select
                  className={inputClass}
                  value={ramoFilter}
                  onChange={(event) => setRamoFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  {filterOptions.ramos.map((ramo) => (
                    <option key={ramo} value={ramo}>
                      {ramo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-param-card border border-param-border p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/60 mb-2">Escopo ativo</div>
                  <div className="text-xs text-white/80">
                    {vendorFilter || ramoFilter ? 'Filtrado' : 'Global'}
                  </div>
                  <div className="text-[10px] text-white/60 mt-1">
                    {vendorFilter && <span>Vendedor: {vendorFilter}</span>}
                    {!vendorFilter && ramoFilter && <span>Produto: {ramoFilter}</span>}
                  </div>
                </div>
                {(vendorFilter || ramoFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setVendorFilter('');
                      setRamoFilter('');
                    }}
                    className="mt-2 text-[10px] font-bold uppercase tracking-widest px-3 py-2 h-10 rounded-[10px] border border-param-border text-gray-200 hover:border-param-primary"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          </section>

          {loading ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
                <div className="absolute inset-2 rounded-full border-2 border-param-primary border-t-transparent animate-spin"></div>
              </div>
              <div className="text-param-primary font-mono text-sm animate-pulse tracking-widest">CARREGANDO PAINEL DE OPERAÇÕES...</div>
            </div>
          ) : (
            <main className="flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full">
              {!data ? (
                <div className="border border-param-border rounded-xl p-6 text-xs text-gray-400">
                  Sem dados suficientes para montar o painel. Verifique filtros ou tente sincronizar.
                </div>
              ) : (
                <>
                  <section className="flex-shrink-0">
                    <DecisionRow
                      meta={metaValue}
                      realized={realizedValue}
                      forecast={forecastValue}
                      forecastPct={forecastPct}
                      gapDiario={gapDiario}
                      gapTotal={gapTotal}
                      diasRestantes={diasRestantes}
                      staleForecast={staleForecast}
                      alertItems={alertItems}
                    />
                  </section>

                  <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DataHealthCard data={dataQuality} loading={dataQualityLoading} onOpenExceptions={handleOpenExceptions} />
                    <MonthStatusBadge data={snapshotStatus} loading={snapshotStatusLoading} />
                  </section>

                  <section id="ops-drivers" className="flex-shrink-0">
                    <DriversPanel snapshot={data} />
                  </section>

                  <section className="flex-shrink-0">
                    <details className="group rounded-xl border border-param-border bg-param-card p-4">
                      <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-white/60 group-open:text-white">
                        Simulação rápida (opcional)
                      </summary>
                      <div className="mt-3 text-xs text-white/70">
                        Para testar cenários sem risco, use o fluxo completo em Admin & Config.
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('admin')}
                        className="mt-3 text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-[10px] border border-param-border text-white/70 hover:border-param-primary"
                      >
                        Abrir simulação oficial
                      </button>
                    </details>
                  </section>

                  <section id="ops-renewals" className="flex-shrink-0">
                    <RenewalsPanel renewalsD7={renewalsD7} renewalsD15={renewalsD15} renewalsD30={renewalsD30} />
                  </section>

                  <section className="flex-grow min-h-[280px]">
                    <ZoneGame leaderboard={filteredLeaderboard} vendorStats={filteredVendorStats} />
                  </section>

                  <section className="flex-shrink-0">
                    <details className="group rounded-xl border border-param-border bg-param-card p-4">
                      <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-white/60 group-open:text-white">
                        Estratégia (Mix, Matriz, Cross-sell)
                      </summary>
                      <div className="mt-4">
                        <ZoneStrategy data={data} crossSell={crossSell} />
                      </div>
                    </details>
                  </section>
                </>
              )}
            </main>
          )}

          <ExceptionsDrawer
            open={exceptionsOpen}
            onClose={() => setExceptionsOpen(false)}
            summary={dataQuality?.exceptions || []}
            selectedType={exceptionsType}
            onSelectType={(type) => {
              setExceptionsType(type);
              setExceptionsOffset(0);
            }}
            items={exceptionsItems}
            itemsLoading={exceptionsLoading}
            hasMore={exceptionsHasMore}
            onLoadMore={() => {
              if (exceptionsType) loadExceptions(exceptionsType, exceptionsOffset, true);
            }}
            searchTerm={exceptionsSearch}
            onSearchTermChange={setExceptionsSearch}
            onActionClick={handleExceptionAction}
          />
        </>
      )}

      {activeTab === 'admin' && (
        <main className="flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          <AdminPanel
            monthRef={monthRef}
            status={status}
            onStatusRefresh={refreshStatus}
            onReloadDashboard={reloadDashboard}
          />
        </main>
      )}
      
      <footer className="mt-8 text-center text-[10px] text-white/50 font-mono flex justify-center gap-4">
        <span>PARAMETTRUS SYSTEM ID: 1000.C0EA</span>
        <span>//</span>
        <span>RN: v2.1 (Anti-Panic)</span>
        <span>//</span>
        <span>SECURE</span>
      </footer>
    </div>
  );
};

export default App;
