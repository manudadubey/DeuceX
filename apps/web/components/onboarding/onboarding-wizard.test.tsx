import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from './onboarding-wizard';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}));

function fillStep1Basics() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Arya Dubey' } });
  fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '2010-01-01' } });
  fireEvent.change(screen.getByLabelText(/ATP player ID/i), { target: { value: 'B0AH' } });
}

describe('OnboardingWizard — guardian gate (M-ID-3, OB-6)', () => {
  it('blocks a minor from advancing past step 1 with no guardian email', async () => {
    const onFinish = vi.fn();
    const lookupRankingFn = vi.fn().mockResolvedValue({ status: 'unverified' });
    render(
      <OnboardingWizard
        email="player@example.com"
        existingPlayer={null}
        onFinish={onFinish}
        lookupRankingFn={lookupRankingFn}
      />,
    );

    fillStep1Basics();
    fireEvent.click(screen.getByRole('button', { name: /look up and continue/i }));

    await waitFor(() => expect(lookupRankingFn).toHaveBeenCalledTimes(1));
    await screen.findByText('Unverified');

    // Still on step 1: the guardian-required message is shown, not step 2's heading.
    expect(
      screen.getByText('A guardian email is required for players under 18.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('What does this season look like?')).not.toBeInTheDocument();
  });

  it('lets a minor continue once a guardian email is entered', async () => {
    const onFinish = vi.fn();
    const lookupRankingFn = vi.fn().mockResolvedValue({ status: 'unverified' });
    render(
      <OnboardingWizard
        email="player@example.com"
        existingPlayer={null}
        onFinish={onFinish}
        lookupRankingFn={lookupRankingFn}
      />,
    );

    fillStep1Basics();
    fireEvent.click(screen.getByRole('button', { name: /look up and continue/i }));
    await screen.findByText('Unverified');

    fireEvent.change(screen.getByLabelText(/Guardian email/i), {
      target: { value: 'guardian@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await screen.findByText('What does this season look like?');
  });

  it('does not require a guardian email for an adult', async () => {
    const onFinish = vi.fn();
    const lookupRankingFn = vi.fn().mockResolvedValue({ status: 'unverified' });
    render(
      <OnboardingWizard
        email="player@example.com"
        existingPlayer={null}
        onFinish={onFinish}
        lookupRankingFn={lookupRankingFn}
      />,
    );

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Arya Dubey' } });
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1998-02-14' } });
    fireEvent.change(screen.getByLabelText(/ATP player ID/i), { target: { value: 'B0AH' } });
    expect(screen.queryByLabelText(/Guardian email/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /look up and continue/i }));
    await screen.findByText('Unverified');
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await screen.findByText('What does this season look like?');
  });
});

describe('OnboardingWizard — ambiguous match (M-ID-2, decisions worksheet 2)', () => {
  it('shows the candidate chooser and resolves verified once one is picked', async () => {
    const onFinish = vi.fn();
    const lookupRankingFn = vi.fn().mockResolvedValue({
      status: 'ambiguous',
      candidates: [
        { id: 'c1', name: 'Arya Dubey', country: 'AUT', tourRank: 487, itfRank: null },
        { id: 'c2', name: 'Arya Dubey', country: 'IND', tourRank: null, itfRank: 340 },
      ],
    });
    render(
      <OnboardingWizard
        email="player@example.com"
        existingPlayer={null}
        onFinish={onFinish}
        lookupRankingFn={lookupRankingFn}
      />,
    );

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Arya Dubey' } });
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1998-02-14' } });
    fireEvent.change(screen.getByLabelText(/ATP player ID/i), { target: { value: 'B0AH' } });
    fireEvent.click(screen.getByRole('button', { name: /look up and continue/i }));

    await screen.findByText('More than one match. Which one is you?');
    fireEvent.click(screen.getByRole('button', { name: /AUT/i }));

    await waitFor(() => expect(screen.getByText('Verified')).toBeInTheDocument());
  });
});
