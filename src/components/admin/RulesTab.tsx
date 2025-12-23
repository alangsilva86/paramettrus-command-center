import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import WidgetCard from '../../../components/WidgetCard';
import { RulesVersionItem } from '../../../types';
import { formatCurrencyBRL, parseLocalizedNumber } from '../../../utils/format';
import { RulesDraft, RulesValidation } from './types';

interface RulesTabProps {
  draft: RulesDraft;
  validation: RulesValidation;
  products: string[];
  publishedRule: RulesVersionItem | null;
  draftTouched: boolean;
  onDraftFieldChange: (field: keyof RulesDraft, value: string | boolean) => void;
  onWeightChange: (product: string, value: string) => void;
  onBonusChange: (bonusKey: string, value: string) => void;
  onResetDraft: () => void;
}

const inputClass =
  'bg-param-bg border border-param-border text-xs text-white px-3 py-2 h-10 rounded-[10px] focus:outline-none focus:border-param-primary focus:ring-2 focus:ring-param-primary/30 w-full';

const sanitizeIntegerInput = (value: string) => value.replace(/\D/g, '');

const sanitizeDecimalInput = (value: string, allowNegative = false) => {
  let cleaned = value.replace(',', '.').replace(/[^\d.-]/g, '');
  if (allowNegative) {
    cleaned = cleaned.replace(/(?!^)-/g, '');
  } else {
    cleaned = cleaned.replace(/-/g, '');
  }
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = `${parts.shift()}.${parts.join('')}`;
  }
  return cleaned;
};

const parseDecimalValue = (value: string) => {
  const cleaned = sanitizeDecimalInput(value, true);
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDecimalOnBlur = (value: string, min = 0, maxDecimals = 2) => {
  if (!value || value.trim() === '') return '';
  const parsed = parseDecimalValue(value);
  if (parsed === null) return '';
  const clamped = Math.max(min, parsed);
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round(clamped * factor) / factor;
  return String(rounded);
};

const CurrencyInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [rawValue, setRawValue] = useState('');

  useEffect(() => {
    if (!isEditing) {
      setRawValue(value || '');
    }
  }, [value, isEditing]);

  const displayValue = isEditing ? rawValue : value ? formatCurrencyBRL(value) : '';

  return (
    <input
      type="text"
      inputMode="decimal"
      className={inputClass}
      value={displayValue}
      placeholder={placeholder}
      onFocus={() => {
        setIsEditing(true);
        setRawValue(value || '');
      }}
      onBlur={() => {
        setIsEditing(false);
        if (!rawValue || rawValue.trim() === '' || !/\d/.test(rawValue)) {
          onChange('');
          return;
        }
        const parsed = parseLocalizedNumber(rawValue);
        onChange(String(parsed));
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setRawValue(nextValue);
        if (!nextValue || nextValue.trim() === '' || !/\d/.test(nextValue)) {
          onChange('');
          return;
        }
        const parsed = parseLocalizedNumber(nextValue);
        if (Number.isFinite(parsed)) {
          onChange(String(parsed));
        }
      }}
    />
  );
};

const Stepper: React.FC<{
  value: string;
  onChange: (value: string) => void;
  step?: number;
  min?: number;
}> = ({ value, onChange, step = 0.1, min = 0 }) => {
  const numeric = Number(value || 0);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(String(Math.max(min, Number((safeValue - step).toFixed(2)))))}
        className="w-8 h-8 rounded-full border border-param-border text-white/70 hover:border-param-primary"
      >
        -
      </button>
      <input
        type="number"
        step={step}
        min={min}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(sanitizeDecimalInput(event.target.value))}
        onBlur={(event) => {
          const nextValue = normalizeDecimalOnBlur(event.target.value, min, 2);
          if (nextValue !== value) onChange(nextValue);
        }}
      />
      <button
        type="button"
        onClick={() => onChange(String(Number((safeValue + step).toFixed(2))))}
        className="w-8 h-8 rounded-full border border-param-border text-white/70 hover:border-param-primary"
      >
        +
      </button>
    </div>
  );
};

const Toggle: React.FC<{ enabled: boolean; onToggle: () => void }> = ({ enabled, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`relative w-11 h-6 rounded-full transition-colors ${
      enabled ? 'bg-param-primary' : 'bg-white/10'
    }`}
  >
    <span
      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
        enabled ? 'translate-x-5' : 'translate-x-0.5'
      }`}
    />
  </button>
);

const AccordionSection: React.FC<{
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, description, open, onToggle, children }) => (
  <div className="border border-param-border rounded-xl">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3"
    >
      <div className="text-left">
        <div className="text-xs font-bold text-white">{title}</div>
        <div className="text-[10px] text-white/50">{description}</div>
      </div>
      {open ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
    </button>
    {open && <div className="px-4 pb-4">{children}</div>}
  </div>
);

const RulesTab: React.FC<RulesTabProps> = ({
  draft,
  validation,
  products,
  publishedRule,
  draftTouched,
  onDraftFieldChange,
  onWeightChange,
  onBonusChange,
  onResetDraft
}) => {
  const [openSection, setOpenSection] = useState<'global' | 'weights' | 'bonus' | null>('global');
  const [bonusMemory, setBonusMemory] = useState<Record<string, string>>({});

  const orderedProducts = useMemo(() => {
    const unique = new Set([...(products || []), ...Object.keys(draft.product_weights || {})]);
    return Array.from(unique.values()).sort();
  }, [products, draft.product_weights]);

  const bonusConfig = [
    {
      key: 'cross_sell',
      title: 'Cross-sell (clientes com mais de um produto)',
      description: 'Recompensa ao vender mais de um ramo para o mesmo cliente.',
      defaultValue: 500
    },
    {
      key: 'combo_breaker',
      title: 'Combo Breaker (AUTO + VIDA)',
      description: 'Bônus especial para combinação Auto + Vida.',
      defaultValue: 800
    },
    {
      key: 'salvamento_d5',
      title: 'Salvamento D5',
      description: 'Reconhece renovações recuperadas em 5 dias.',
      defaultValue: 600
    }
  ];

  useEffect(() => {
    setBonusMemory((prev) => {
      const next = { ...prev };
      Object.entries(draft.bonus_events || {}).forEach(([key, value]) => {
        const numeric = parseDecimalValue(String(value ?? ''));
        if (numeric !== null && numeric > 0) {
          next[key] = String(value);
        }
      });
      return next;
    });
  }, [draft.bonus_events]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <WidgetCard title="Regra Vigente" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Meta mensal</div>
            <div className="text-lg font-bold text-white">
              {publishedRule ? formatCurrencyBRL(publishedRule.meta_global_comissao || 0) : '—'}
            </div>
          </div>
          <div className="text-[10px] text-gray-500">
            Vigente desde {publishedRule?.effective_from || '—'} | Dias úteis: {publishedRule?.dias_uteis ?? '—'}
          </div>
          <div className="text-[10px] text-gray-500">
            Última revisão: {publishedRule?.created_at ? new Date(publishedRule.created_at).toLocaleDateString('pt-BR') : '—'}
          </div>
          <div className="text-[10px] text-gray-400 border-t border-param-border pt-3">
            {publishedRule?.audit_note || 'Sem anotações da última mudança.'}
          </div>
          <button
            type="button"
            onClick={onResetDraft}
            className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-2 h-10 rounded-[10px] border border-param-border text-white/70 hover:border-param-primary"
          >
            <RotateCcw className="w-4 h-4" />
            Reverter para vigente
          </button>
          <div className={`text-[10px] uppercase tracking-widest ${draftTouched ? 'text-param-warning' : 'text-param-success'}`}>
            {draftTouched ? 'Rascunho com alterações' : 'Sem alterações pendentes'}
          </div>
        </div>
      </WidgetCard>

      <WidgetCard title="Configuração da Regra" className="lg:col-span-2">
        <div className="flex flex-col gap-4 text-xs text-gray-300">
          {!validation.isValid && (
            <div className="border border-param-danger/60 bg-param-danger/10 text-param-danger px-3 py-2 rounded-[10px] text-[10px]">
              {validation.messages.join(' ')}
            </div>
          )}

          <AccordionSection
            title="Parâmetros Globais"
            description="Defina o alvo mensal e o ritmo do time"
            open={openSection === 'global'}
            onToggle={() => setOpenSection(openSection === 'global' ? null : 'global')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Meta mensal</div>
                <CurrencyInput
                  value={draft.meta_global_comissao}
                  onChange={(value) => onDraftFieldChange('meta_global_comissao', value)}
                  placeholder="R$ 0,00"
                />
                <div className="text-[10px] text-gray-500 mt-1">
                  Qual o alvo de comissão para o time este mês?
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Dias úteis</div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={inputClass}
                  value={draft.dias_uteis}
                  onChange={(event) =>
                    onDraftFieldChange('dias_uteis', sanitizeIntegerInput(event.target.value))
                  }
                />
                <div className="text-[10px] text-gray-500 mt-1">
                  Usado para calcular o ritmo diário necessário.
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Vigência a partir de</div>
                <input
                  type="date"
                  className={inputClass}
                  value={draft.effective_from}
                  onChange={(event) => onDraftFieldChange('effective_from', event.target.value)}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Vigência até (opcional)</div>
                <input
                  type="date"
                  className={inputClass}
                  value={draft.effective_to}
                  onChange={(event) => onDraftFieldChange('effective_to', event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Toggle
                  enabled={draft.churn_lock_xp}
                  onToggle={() => onDraftFieldChange('churn_lock_xp', !draft.churn_lock_xp)}
                />
                <span className="text-[10px] text-gray-400">Bloquear bônus em casos de churn</span>
              </div>
              <div className="flex items-center gap-2">
                <Toggle enabled={draft.force} onToggle={() => onDraftFieldChange('force', !draft.force)} />
                <span className="text-[10px] text-gray-400">Permitir vigência retroativa</span>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Pesos de Produtos"
            description="Multiplicadores de XP por ramo"
            open={openSection === 'weights'}
            onToggle={() => setOpenSection(openSection === 'weights' ? null : 'weights')}
          >
            <div className="grid grid-cols-1 gap-3">
              {orderedProducts.map((product) => (
                <div key={product} className="flex flex-col md:flex-row md:items-center gap-2">
                  <div className="md:w-1/3 text-[11px] font-bold text-white">{product}</div>
                  <div className="md:flex-1">
                    <Stepper
                      value={draft.product_weights[product] ?? '1'}
                      onChange={(value) => onWeightChange(product, value)}
                      step={0.1}
                      min={0}
                    />
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>

          <AccordionSection
            title="Bônus Especiais"
            description="Ative recompensas extras por comportamento"
            open={openSection === 'bonus'}
            onToggle={() => setOpenSection(openSection === 'bonus' ? null : 'bonus')}
          >
            <div className="grid grid-cols-1 gap-3">
              {bonusConfig.map((bonus) => {
                const value = draft.bonus_events[bonus.key] ?? '0';
                const isEnabled = Number(value) > 0;
                return (
                  <div key={bonus.key} className="border border-param-border rounded-xl p-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-white">{bonus.title}</div>
                        <div className="text-[10px] text-white/50">{bonus.description}</div>
                      </div>
                      <Toggle
                        enabled={isEnabled}
                        onToggle={() =>
                          onBonusChange(
                            bonus.key,
                            isEnabled
                              ? '0'
                              : String(bonusMemory[bonus.key] ?? String(bonus.defaultValue))
                          )
                        }
                      />
                    </div>
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Valor do bônus</div>
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} ${!isEnabled ? 'opacity-60' : ''}`}
                        value={value}
                        disabled={!isEnabled}
                        onChange={(event) =>
                          onBonusChange(bonus.key, sanitizeDecimalInput(event.target.value))
                        }
                        onBlur={(event) => {
                          const nextValue = normalizeDecimalOnBlur(event.target.value, 0, 2);
                          if (nextValue !== value) onBonusChange(bonus.key, nextValue);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionSection>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Motivo da alteração</div>
            <textarea
              className={`${inputClass} min-h-[80px] h-auto`}
              value={draft.audit_note}
              onChange={(event) => onDraftFieldChange('audit_note', event.target.value)}
              placeholder="Descreva o objetivo desta mudança"
            />
          </div>
        </div>
      </WidgetCard>
    </div>
  );
};

export default RulesTab;
