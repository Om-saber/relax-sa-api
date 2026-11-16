import { applyCompletionCommission, computeCommission } from './booking-commission';

function mockTx(rate: number | null) {
  return {
    staffProfile: {
      findUnique: jest.fn().mockResolvedValue(rate === null ? null : { id: 'staff-1', commissionRate: rate }),
    },
    booking: { update: jest.fn().mockResolvedValue({}) },
    commission: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

describe('computeCommission', () => {
  it('is total × rate%, rounded to halalas', () => {
    expect(computeCommission(249, 20)).toBe(49.8);
    expect(computeCommission(199, 20)).toBe(39.8);
    expect(computeCommission(349, 22)).toBe(76.78);
    expect(computeCommission('333.33', 17.5)).toBe(58.33);
  });
});

describe('applyCompletionCommission (M1)', () => {
  it('snapshots rate/amount on the booking and upserts one commission row', async () => {
    const tx = mockTx(20);
    const res = await applyCompletionCommission(tx as any, { id: 'b1', totalPrice: 349, specialistId: 'staff-1' });

    expect(res).toEqual({ rate: 20, amount: 69.8 });
    expect(tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { commissionRateSnapshot: 20, commissionAmount: 69.8 },
    });
    expect(tx.commission.upsert).toHaveBeenCalledWith({
      where: { bookingId: 'b1' },
      update: { staffId: 'staff-1', rate: 20, amount: 69.8 },
      create: { bookingId: 'b1', staffId: 'staff-1', rate: 20, amount: 69.8, status: 'PENDING' },
    });
  });

  it('does nothing when the booking has no specialist', async () => {
    const tx = mockTx(20);
    expect(await applyCompletionCommission(tx as any, { id: 'b1', totalPrice: 349, specialistId: null })).toBeNull();
    expect(tx.staffProfile.findUnique).not.toHaveBeenCalled();
    expect(tx.commission.upsert).not.toHaveBeenCalled();
  });

  it('does nothing when the specialist profile no longer exists', async () => {
    const tx = mockTx(null);
    expect(await applyCompletionCommission(tx as any, { id: 'b1', totalPrice: 349, specialistId: 'gone' })).toBeNull();
    expect(tx.commission.upsert).not.toHaveBeenCalled();
  });
});
