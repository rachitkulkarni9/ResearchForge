export type PaperStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PaperSummary {
  id: string;
  workspace_id: string;
  title: string;
  filename: string;
  status: PaperStatus;
  created_at: string;
  updated_at: string;
}

export interface StructuredOutput {
  summary: string;
  sections: { title: string; summary: string }[];
  key_insights: string[];
  novel_contributions: string[];
  limitations: string[];
  math_explanations: { concept: string; formula: string; variable_notes: string[]; explanation: string; importance: string }[];
  implementation_steps: { step: string; detail: string }[];
  sandbox_tasks: { title: string; objective: string }[];
  starter_code: string;
  qa_ready: boolean;
  fallback_mode?: boolean;
}

export interface QAResponse {
  status: 'stated' | 'inferred' | 'not_stated' | 'insufficient_evidence';
  question_type: 'direct_fact' | 'synthesis' | 'inference' | 'missing_info';
  answer: string;
  evidence: { source: string; passage: string }[];
  confidence: number;
  citations: string[];
}

export interface PaperDetail {
  paper: PaperSummary;
  output: StructuredOutput | null;
  sandbox: {
    current_code: string;
    starter_code: string;
    last_run_output: { stdout: string; stderr: string; success: boolean };
  } | null;
}
