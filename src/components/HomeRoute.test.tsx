import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/pages/Index', () => ({ default: () => <div data-testid="public-home" /> }));
import { HomeRoute } from './HomeRoute';

afterEach(cleanup);

describe('homepage access', () => {
  it('shows public content without exposing the staff dashboard to visitors', () => {
    render(<HomeRoute authenticated={false}><div data-testid="staff-dashboard" /></HomeRoute>);
    expect(screen.getByTestId('public-home')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-dashboard')).not.toBeInTheDocument();
  });

  it('preserves the dashboard for signed-in staff at the same address', () => {
    render(<HomeRoute authenticated><div data-testid="staff-dashboard" /></HomeRoute>);
    expect(screen.getByTestId('staff-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('public-home')).not.toBeInTheDocument();
  });
});