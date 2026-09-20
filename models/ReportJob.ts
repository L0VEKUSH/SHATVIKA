import mongoose, { Schema, type Model } from 'mongoose';
import type { AnalyticsFilterWire, ReportFormat, ReportType } from '@/lib/analytics/contracts';

export interface ReportJobRecord {
  requesterId: string;
  reportType: ReportType;
  format: ReportFormat;
  filters: AnalyticsFilterWire;
  includeCustomerDetails: boolean;
  asOfUtc: Date;
  rowCount: number;
  status: 'ready' | 'generating' | 'completed' | 'failed';
  generatedAt: Date | null;
  downloadedAt: Date | null;
  failedAt: Date | null;
  errorCode: string | null;
  byteLength: number | null;
  checksumSha256: string | null;
  contentType: string;
  filename: string;
  fileData: mongoose.Types.Buffer;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const reportJobSchema = new Schema({
  requesterId: { type: String, required: true, index: true, select: false },
  reportType: {
    type: String,
    enum: [
      'business-summary', 'detailed-orders-tokens', 'sold-items', 'sales-costs-profit', 'expenses',
      'inventory-wastage', 'counter-operations', 'sales-orders', 'products-categories', 'customers',
      'inventory', 'coupons', 'payments-refunds', 'operations', 'reviews', 'consolidated',
    ],
    required: true,
  },
  format: { type: String, enum: ['csv', 'xlsx', 'pdf'], required: true },
  filters: { type: Schema.Types.Mixed, required: true },
  includeCustomerDetails: { type: Boolean, default: false },
  asOfUtc: { type: Date, required: true },
  rowCount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['ready', 'generating', 'completed', 'failed'], default: 'ready', index: true },
  generatedAt: { type: Date, default: null },
  downloadedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  errorCode: { type: String, default: null },
  byteLength: { type: Number, default: null, min: 0 },
  checksumSha256: { type: String, default: null },
  contentType: { type: String, required: true },
  filename: { type: String, required: true },
  // Generated artifacts are private, immutable, and automatically removed with the job TTL.
  fileData: { type: Schema.Types.Buffer, required: true, select: false },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

reportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
reportJobSchema.index({ requesterId: 1, createdAt: -1 });

reportJobSchema.set('toJSON', {
  transform: (_document, returned) => {
    const row = returned as unknown as Record<string, unknown>;
    if (row._id) row.id = String(row._id);
    delete row._id;
    delete row.__v;
    delete row.requesterId;
    delete row.filters;
    delete row.fileData;
    return row;
  },
});

export const ReportJob: Model<ReportJobRecord> =
  (mongoose.models.ReportJob as Model<ReportJobRecord> | undefined) ?? mongoose.model<ReportJobRecord>('ReportJob', reportJobSchema);
