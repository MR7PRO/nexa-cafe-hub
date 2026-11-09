import { Fragment } from 'react';
import { describe, expect, it } from 'vitest';
import Index from '@/pages/Index';
import { HomeRoute } from './HomeRoute';

describe('homepage access', () => {
  it('shows public content without exposing the staff dashboard to visitors', () => {
    const dashboard = <div />;
    const result = HomeRoute({ authenticated: false, children: dashboard });
    expect(result.type).toBe(Index);
    expect(result.props.children).toBeUndefined();
  });

  it('preserves the dashboard for signed-in staff at the same address', () => {
    const dashboard = <div />;
    const result = HomeRoute({ authenticated: true, children: dashboard });
    expect(result.type).toBe(Fragment);
    expect(result.props.children).toBe(dashboard);
  });
});