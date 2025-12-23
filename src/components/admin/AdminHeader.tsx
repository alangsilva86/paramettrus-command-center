import React from 'react';

interface AdminHeaderProps {
  environmentLabel: string;
  isProd: boolean;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({ environmentLabel, isProd }) => {
  const badgeClass = isProd
    ? 'bg-param-danger/20 border-param-danger/60 text-param-danger'
    : environmentLabel.includes('STAG')
    ? 'bg-param-warning/20 border-param-warning/60 text-param-warning'
    : 'bg-param-success/20 border-param-success/60 text-param-success';

  return (
    <div
      className={`rounded-xl border px-4 py-4 sm:px-5 sm:py-5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
        isProd ? 'border-param-danger/60 bg-param-danger/10' : 'border-param-border bg-param-card'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/60">Console de Gestão</div>
          <div className="text-lg font-bold text-white">
            Regras, processamento e governança comercial
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            Fluxo seguro: simule antes de publicar e acompanhe o impacto.
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-[10px] border ${badgeClass}`}>
          <span className="text-[10px] uppercase tracking-widest">Ambiente</span>
          <span className="font-bold text-sm">{environmentLabel}</span>
        </div>
      </div>
    </div>
  );
};

export default AdminHeader;
