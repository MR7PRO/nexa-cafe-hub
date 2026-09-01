import { describe, it, expect } from 'vitest';
import {
  canGrantRole,
  canManageCatalog,
  canManageDevices,
  canManageUsers,
  canRefundTicket,
  isSuperAdmin,
  type AppRole,
} from './permissions';

const ROLES: AppRole[] = ['admin', 'manager', 'cashier', 'super_admin'];

describe('permissions', () => {
  it('lets management roles manage catalog, devices and refunds', () => {
    for (const role of ['admin', 'manager', 'super_admin'] as AppRole[]) {
      expect(canManageCatalog(role)).toBe(true);
      expect(canManageDevices(role)).toBe(true);
      expect(canRefundTicket(role)).toBe(true);
    }
  });

  it('keeps cashiers out of management actions', () => {
    expect(canManageCatalog('cashier')).toBe(false);
    expect(canManageDevices('cashier')).toBe(false);
    expect(canRefundTicket('cashier')).toBe(false);
    expect(canManageUsers('cashier')).toBe(false);
  });

  it('treats a missing role as unauthorized', () => {
    for (const check of [canManageCatalog, canManageDevices, canRefundTicket, canManageUsers]) {
      expect(check(null)).toBe(false);
      expect(check(undefined)).toBe(false);
    }
  });

  it('restricts user management to admins and super admins', () => {
    expect(canManageUsers('admin')).toBe(true);
    expect(canManageUsers('super_admin')).toBe(true);
    expect(canManageUsers('manager')).toBe(false);
  });

  it('never allows granting super_admin from the app', () => {
    for (const role of ROLES) {
      expect(canGrantRole(role, 'super_admin')).toBe(false);
    }
  });

  it('allows admins to grant tenant roles only', () => {
    expect(canGrantRole('admin', 'manager')).toBe(true);
    expect(canGrantRole('admin', 'cashier')).toBe(true);
    expect(canGrantRole('manager', 'cashier')).toBe(false);
    expect(canGrantRole('cashier', 'cashier')).toBe(false);
  });

  it('identifies super admins', () => {
    expect(isSuperAdmin('super_admin')).toBe(true);
    expect(isSuperAdmin('admin')).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});
