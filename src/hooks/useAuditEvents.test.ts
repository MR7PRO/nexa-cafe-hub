import { describe, it, expect } from 'vitest';
import { auditActionLabel, AUDIT_ACTION_LABELS } from './useAuditEvents';

describe('audit action labels', () => {
  it('translates known financial actions to Arabic', () => {
    expect(auditActionLabel('ticket_paid')).toBe('فاتورة مدفوعة');
    expect(auditActionLabel('ticket_voided')).toBe('إلغاء فاتورة');
    expect(auditActionLabel('expense_voided')).toBe('إلغاء مصروف');
  });

  it('falls back to the raw action when unknown', () => {
    expect(auditActionLabel('something_new')).toBe('something_new');
  });

  it('covers every high-value audited event', () => {
    for (const action of [
      'ticket_paid',
      'ticket_voided',
      'ticket_refunded',
      'session_settled',
      'expense_created',
      'expense_updated',
      'expense_voided',
      'shift_opened',
      'shift_closed',
      'setting_changed',
      'role_changed',
    ]) {
      expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    }
  });
});
