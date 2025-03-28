import { SessionStatus } from "@prisma/client";

export class Session {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly startTime: Date,
    private _endTime: Date | null,
    public readonly duration: number, // in minutes
    private _status: SessionStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get status(): SessionStatus {
    return this._status;
  }

  get endTime(): Date | null {
    return this._endTime;
  }

  get isActive(): boolean {
    return this._status === SessionStatus.ACTIVE;
  }

  get isExpired(): boolean {
    return this._status === SessionStatus.EXPIRED;
  }

  get timeRemaining(): number {
    if (this._endTime) {
      return 0;
    }

    const expirationTime = new Date(this.startTime.getTime() + this.duration * 60 * 1000);

    console.log(`Expiration Time: ${expirationTime}`);
    const now = new Date();
    console.log(`Current Time: ${new Date()}`);
    const remainingMs = expirationTime.getTime() - now.getTime();
    console.log(`Remaining Time in ms: ${remainingMs}`);

    console.log(`Remaining Time in minutes: ${Math.floor(remainingMs / 1000 / 60)}`);

    return Math.max(0, Math.floor(remainingMs / 1000 / 60)); // Remaining time in minutes
  }

  get hasTimeRemaining(): boolean {
    console.log(this.timeRemaining);
    return this.timeRemaining > 0;
  }

  completeSession(): void {
    if (this._status !== SessionStatus.ACTIVE) {
      throw new Error('Cannot complete a session that is not active');
    }

    this._status = SessionStatus.COMPLETED;
    this._endTime = new Date();
  }

  expireSession(): void {
    if (this._status !== SessionStatus.ACTIVE) {
      throw new Error('Cannot expire a session that is not active');
    }

    this._status = SessionStatus.EXPIRED;
    this._endTime = new Date();
  }
}
