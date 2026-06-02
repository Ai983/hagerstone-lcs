/** Mirrors public.employees in the Hub Supabase project. */
export interface Employee {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  designation: string | null;
  employee_code: string | null;
  is_active: boolean | null;
}

/** LCS module id used in public.employee_module_access / roles.default_modules. */
export const LCS_MODULE_ID = "lcs" as const;

/** Roles that get LCS by default (PRD §6.1 / §7). */
export type LcsRole =
  | "site_engineer"
  | "project_manager"
  | "procurement"
  | "finance"
  | "management"
  | "founder"
  | "admin"
  | "ai";

// ---- Phase 2 masters ----
export type ContractorType = "agency" | "labour";
export type WorkOrderTrack = "measured" | "attendance";
/** For type='labour': B = thekedar (paid as a group) · C = direct (we pay each worker). */
export type LabourEngagement = "thekedar" | "direct";

export interface ContractorProfile {
  id: string;
  supplier_ref: string | null;
  type: ContractorType;
  labour_engagement: LabourEngagement | null;
  name: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder_name: string | null;
  bank_ifsc: string | null;
  kyc_status: "pending" | "verified" | "rejected";
  bank_verified: boolean;
  default_retention_pct: number;
  performance_score: number | null;
  status: "active" | "inactive" | "blacklisted";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** lcs.v_contractors — contractor_profiles LEFT JOIN cps.cps_suppliers. */
export interface ContractorView extends ContractorProfile {
  display_name: string | null;
  supplier_name: string | null;
  supplier_gstin: string | null;
  supplier_pan: string | null;
  supplier_bank_name: string | null;
  supplier_bank_ifsc: string | null;
  supplier_bank_last4: string | null;
  supplier_categories: string[] | null;
}

/** lcs.v_cps_suppliers — read-only supplier directory for the link picker. */
export interface SupplierOption {
  id: string;
  name: string | null;
  gstin: string | null;
  pan: string | null;
  bank_name: string | null;
  bank_account_last4: string | null;
  bank_ifsc: string | null;
  categories: string[] | null;
  status: string | null;
  city: string | null;
  state: string | null;
}

export interface Project {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  budget: number | null;
  design_pm_employee_id: string | null;
  project_head_employee_id: string | null;
  status: "active" | "on_hold" | "closed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  wo_no: string;
  contractor_profile_id: string;
  project_id: string;
  track: WorkOrderTrack;
  scope: string | null;
  wo_value: number;
  payment_terms: string | null;
  retention_pct: number;
  advance_pct: number;
  ld_clause: string | null;
  dlp_months: number;
  status: "draft" | "active" | "on_hold" | "closed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoqItem {
  id?: string;
  work_order_id?: string;
  description: string;
  unit: string | null;
  agreed_rate: number;
  total_qty: number;
}

/** Roles allowed to manage each master (mirrors lcs RLS write policies). */
export interface Worker {
  id: string;
  contractor_profile_id: string;
  name: string;
  phone: string | null;
  skill: string | null;
  day_rate: number;
  aadhaar_last4: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** lcs.v_cps_projects — read-only CPS project directory for the import picker. */
export interface CpsProject {
  id: string;
  name: string;
  code: string | null;
  site_address: string | null;
  site_incharge_name: string | null;
  active: boolean;
}

export const OPS_ROLES = ["procurement", "admin", "ai", "management", "founder"] as const;
export const PROJECT_ADMIN_ROLES = ["admin", "ai", "management", "founder"] as const;
export const canManageOps = (role: string | null) => !!role && (OPS_ROLES as readonly string[]).includes(role);
export const canManageProjects = (role: string | null) => !!role && (PROJECT_ADMIN_ROLES as readonly string[]).includes(role);
