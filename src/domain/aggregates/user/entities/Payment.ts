import { PaymentStatus } from '../../../../domain/shared/enums';

export class Payment {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly amount: number,
    public readonly provider: string,
    private _status: PaymentStatus,
    public readonly metadata: Record<string, any> | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get status(): PaymentStatus {
    return this._status;
  }

  get isPending(): boolean {
    return this._status === PaymentStatus.PENDING;
  }

  get isCompleted(): boolean {
    return this._status === PaymentStatus.COMPLETED;
  }

  get isFailed(): boolean {
    return this._status === PaymentStatus.FAILED;
  }

  complete(): void {
    if (this._status !== PaymentStatus.PENDING) {
      throw new Error('Cannot complete a payment that is not pending');
    }

    this._status = PaymentStatus.COMPLETED;
  }

  fail(): void {
    if (this._status !== PaymentStatus.PENDING) {
      throw new Error('Cannot fail a payment that is not pending');
    }

    this._status = PaymentStatus.FAILED;
  }
}
