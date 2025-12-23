import React, { useEffect, useState } from 'react';
import ZoneHud from './components/ZoneHud';
import ZoneGame from './components/ZoneGame';
import ZoneStrategy from './components/ZoneStrategy';
import AdminPanel from './components/AdminPanel';
import { fetchCrossSellSummary, fetchDashboardSnapshot, fetchRenewalList, fetchStatus } from './services/zohoService';
import { CrossSellSummary, DashboardSnapshot, RenewalListItem, StatusResponse } from './types';
import { Terminal, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [renewalsD5, setRenewalsD5] = useState<RenewalListItem[]>([]);
  const [renewalsD15, setRenewalsD15] = useState<RenewalListItem[]>([]);
  const [renewalsD30, setRenewalsD30] = useState<RenewalListItem[]>([]);
  const [crossSell, setCrossSell] = useState<CrossSellSummary | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
    const loadData = async () => {
      setLoading(true);
      try {
        const [snapshot, d5List, d15List, d30List, crossSellSummary, statusResponse] = await Promise.all([
          fetchDashboardSnapshot(monthRef, activeFilters),
          fetchRenewalList(5, activeFilters),
          fetchRenewalList(15, activeFilters),
          fetchRenewalList(30, activeFilters),
          fetchCrossSellSummary(activeFilters),
          fetchStatus()
        ]);
        setData(snapshot);
        setRenewalsD5(d5List);
        setRenewalsD15(d15List);
        setRenewalsD30(d30List);
        setCrossSell(crossSellSummary);
        setStatus(statusResponse);
      } catch (e) {
        console.error("Failed to load dashboard snapshot", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [monthRef, vendorFilter, ramoFilter, reloadKey]);

  const refreshStatus = async () => {
    const statusResponse = await fetchStatus();
    setStatus(statusResponse);
  };

  const reloadDashboard = () => {
    setReloadKey((prev) => prev + 1);
  };

  const filterOptions = data?.filters || { vendors: [], ramos: [] };

  return (
    <div className="min-h-screen bg-param-bg text-param-text font-sans p-4 md:p-6 lg:p-8 overflow-hidden flex flex-col">
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

      {/* Filtros globais */}
      <section className="mb-6">
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
          <div className="text-param-primary font-mono text-sm animate-pulse tracking-widest">CALCULATING XP LEDGER...</div>
        </div>
      ) : (
        <main className="flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          
          {/* ZONA 1: HUD Tático (25% visual weight) */}
          <section className="flex-shrink-0 min-h-[180px]">
            <ZoneHud data={data} renewalsD5={renewalsD5} renewalsD15={renewalsD15} renewalsD30={renewalsD30} />
          </section>

          {/* ZONA 2: Arena Gamificada (40% visual weight) */}
          <section className="flex-grow min-h-[300px]">
            <ZoneGame leaderboard={data?.leaderboard || []} vendorStats={data?.vendor_stats || []} />
          </section>

          {/* ZONA 3: Inteligência Estratégica (35% visual weight) */}
          <section className="flex-shrink-0 min-h-[250px]">
            <ZoneStrategy data={data} crossSell={crossSell} />
          </section>

          {/* ZONA 4: Admin Ops */}
          <section className="flex-shrink-0 min-h-[280px]">
            <AdminPanel
              monthRef={monthRef}
              status={status}
              onStatusRefresh={refreshStatus}
              onReloadDashboard={reloadDashboard}
            />
          </section>

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
