export interface RulesDraft {
  effective_from: string;
  effective_to: string;
  meta_global_comissao: string;
  dias_uteis: string;
  product_weights: Record<string, string>;
  bonus_events: Record<string, string>;
  churn_lock_xp: boolean;
  audit_note: string;
  force: boolean;
}

export interface RulesValidation {
  isValid: boolean;
  messages: string[];
  fieldErrors: Record<string, string>;
}
