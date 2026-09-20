import mongoose, { Schema, type Model } from 'mongoose';

const auditEventSchema = new Schema(
  {
    actorType: { type: String, enum: ['admin', 'customer', 'system'], required: true },
    actorId: { type: String, default: null, index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: null },
    correlationId: { type: String, default: null, index: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    // Metadata must describe scope only; never place secrets, credentials, or
    // report/customer contents here.
    metadata: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, required: true, index: true },
  },
  { timestamps: false },
);

auditEventSchema.index({ occurredAt: -1, action: 1 });

export const AuditEvent: Model<any> =
  (mongoose.models.AuditEvent as Model<any> | undefined) ??
  mongoose.model('AuditEvent', auditEventSchema);
