/**
 * Donation service interface
 * Defines the contract for donation management operations
 */

import { IService } from './IService';

export interface IDonationService extends IService {
  /**
   * Create a new donation
   * @param donationData - Donation details
   * @returns Created donation with ID
   */
  createDonation(donationData: DonationCreateData): Promise<Donation>;

  /**
   * Get user's donations with filtering
   * @param filters - Optional filters and pagination
   * @returns List of donations with metadata
   */
  getDonations(filters?: DonationFilters): Promise<DonationListResult>;

  /**
   * Get a specific donation by ID
   * @param donationId - Donation identifier
   * @returns Donation details or null if not found
   */
  getDonation(donationId: string): Promise<Donation | null>;

  /**
   * Update an existing donation
   * @param donationId - Donation identifier
   * @param updates - Fields to update
   * @returns Updated donation
   */
  updateDonation(donationId: string, updates: Partial<DonationCreateData>): Promise<Donation>;

  /**
   * Delete a donation
   * @param donationId - Donation identifier
   * @returns Deletion success status
   */
  deleteDonation(donationId: string): Promise<void>;

  /**
   * Get donation summary for tax reporting
   * @param year - Tax year (optional, defaults to current year)
   * @returns Tax summary with totals by type
   */
  getDonationSummary(year?: number): Promise<DonationSummary>;

  /**
   * Check if user can create more donations (freemium limit)
   * @param userId - User identifier
   * @returns Whether user can create donations
   */
  canCreateDonation(userId: string): Promise<DonationLimitResult>;

  /**
   * Validate donation data before creation
   * @param donationData - Donation data to validate
   * @returns Validation result with errors
   */
  validateDonation(donationData: DonationCreateData): Promise<ValidationResult>;

  /**
   * Import donations from external source
   * @param importData - Import data and format
   * @returns Import result with success/error counts
   */
  importDonations(importData: DonationImportData): Promise<ImportResult>;
}

/**
 * Donation types supported by the system
 */
export type DonationType = 'money' | 'items' | 'mileage' | 'stock' | 'crypto';

/**
 * Donation creation data
 */
export interface DonationCreateData {
  charity_id: string;
  type: DonationType;
  date: string; // ISO date string
  tax_deductible_amount: number;
  fair_market_value?: number;
  cost_basis?: number;
  description?: string;
  metadata: DonationMetadata;
  receipt_files?: FileUpload[];
}

/**
 * Complete donation record
 */
export interface Donation extends DonationCreateData {
  id: string;
  user_id: string;
  charity_name?: string;
  charity_ein?: string;
  capital_gains_avoided?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Type-specific metadata for donations
 */
export type DonationMetadata =
  | MoneyDonationMetadata
  | ItemsDonationMetadata
  | MileageDonationMetadata
  | StockDonationMetadata
  | CryptoDonationMetadata;

/**
 * Money donation metadata
 */
export interface MoneyDonationMetadata {
  method: 'Cash' | 'Check' | 'Credit Card' | 'Bank Transfer' | 'Other';
  check_number?: string;
  transaction_id?: string;
}

/**
 * Items donation metadata
 */
export interface ItemsDonationMetadata {
  items: DonatedItem[];
  total_items: number;
  pickup_date?: string;
}

export interface DonatedItem {
  category: string;
  type: string;
  condition: 'Good' | 'Fair' | 'Excellent';
  quantity: number;
  unitValue: number;
  description?: string;
  notes?: string;
}

/**
 * Mileage donation metadata
 */
export interface MileageDonationMetadata {
  miles: number;
  rate: number; // IRS rate per mile
  purpose: string;
  start_location?: string;
  end_location?: string;
}

/**
 * Stock donation metadata
 */
export interface StockDonationMetadata {
  symbol: string;
  shares: number;
  securityType: 'Common Stock' | 'Bond' | 'Mutual Fund' | 'ETF' | 'Other Security';
  transfer_date: string;
  broker?: string;
}

/**
 * Cryptocurrency donation metadata
 */
export interface CryptoDonationMetadata {
  symbol: 'BTC' | 'ETH' | 'ADA' | 'SOL' | 'XRP' | 'DOT' | 'AVAX' | 'MATIC' | 'LTC' | 'OTHER';
  amount: number;
  pricePerUnit: number;
  transactionHash?: string;
  walletAddress?: string;
  exchange?: string;
}

/**
 * Donation filters for queries
 */
export interface DonationFilters {
  type?: DonationType;
  year?: number;
  charity_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'date' | 'amount' | 'charity' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Donation list result with pagination
 */
export interface DonationListResult {
  donations: Donation[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

/**
 * Donation summary for tax reporting
 */
export interface DonationSummary {
  year: number;
  summary: DonationTypeSummary[];
  totals: {
    total_donations: number;
    total_deductible: number;
    total_capital_gains_avoided: number;
    estimated_tax_savings: number;
  };
}

/**
 * Summary by donation type
 */
export interface DonationTypeSummary {
  type: DonationType;
  count: number;
  total_deductible: number;
  total_capital_gains_avoided: number;
}

/**
 * Donation limit check result
 */
export interface DonationLimitResult {
  canCreate: boolean;
  currentCount: number;
  limit: number;
  isUnlimited: boolean;
  upgradeRequired: boolean;
  message?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * File upload data
 */
export interface FileUpload {
  name: string;
  type: string;
  size: number;
  data: string; // base64 or blob URL
}

/**
 * Import data structure
 */
export interface DonationImportData {
  format: 'csv' | 'json' | 'excel';
  data: string | object[];
  mapping?: Record<string, string>;
  options?: {
    skipErrors: boolean;
    dryRun: boolean;
  };
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  totalRecords: number;
  successfulImports: number;
  failedImports: number;
  errors: ImportError[];
  createdDonations: Donation[];
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  data?: any;
}