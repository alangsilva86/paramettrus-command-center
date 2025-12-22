import React, { useEffect, useState } from 'react';
import ZoneHud from './components/ZoneHud';
import ZoneGame from './components/ZoneGame';
import ZoneStrategy from './components/ZoneStrategy';
import { fetchDashboardSnapshot } from './services/zohoService';
import { DashboardSnapshot } from './types';
import { Terminal, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const snapshot = await fetchDashboardSnapshot();
        setData(snapshot);
      } catch (e) {
        console.error("Failed to load dashboard snapshot", e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-param-bg text-param-text font-sans p-4 md:p-6 lg:p-8 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-param-border">
        <div className="flex items-center gap-3">
          <div className="bg-param-primary p-2 rounded-sm text-black shadow-[0_0_10px_rgba(255,107,6,0.5)]">
            <Terminal size={24} strokeWidth={3} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wider text-white leading-none">
              Paramettrus <span className="text-param-primary">OPS</span>
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mt-1 flex items-center gap-1">
              Command Center v2.1 <span className="text-gray-700">|</span> GROWTH EDITION
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
           <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 rounded border border-gray-800">
            <ShieldCheck className="w-3 h-3 text-param-success" />
            <span className="text-gray-400">MIDDLEWARE: ACTIVE</span>
          </div>
          <div className="text-gray-600 font-mono">
            Cycle: 2025-12
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <div className="w-16 h-16 border-4 border-param-border border-t-param-primary rounded-full animate-spin"></div>
          <div className="text-param-primary font-mono text-sm animate-pulse tracking-widest">CALCULATING XP LEDGER...</div>
        </div>
      ) : (
        <main className="flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          
          {/* ZONA 1: HUD Tático (25% visual weight) */}
          <section className="flex-shrink-0 min-h-[180px]">
            <ZoneHud data={data} />
          </section>

          {/* ZONA 2: Arena Gamificada (40% visual weight) */}
          <section className="flex-grow min-h-[300px]">
            <ZoneGame leaderboard={data?.leaderboard || []} />
          </section>

          {/* ZONA 3: Inteligência Estratégica (35% visual weight) */}
          <section className="flex-shrink-0 min-h-[250px]">
            <ZoneStrategy data={data} />
          </section>

        </main>
      )}
      
      <footer className="mt-8 text-center text-[10px] text-gray-600 font-mono flex justify-center gap-4">
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