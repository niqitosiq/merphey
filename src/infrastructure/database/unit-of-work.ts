export interface IUnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
}

export interface IRepository<T> {
  add(entity: T): Promise<void>;
  update(entity: T): Promise<void>;
  delete(entity: T): Promise<void>;
  registerNew(entity: T): void;
  registerDirty(entity: T): void;
  registerRemoved(entity: T): void;
}

export class UnitOfWork implements IUnitOfWork {
  private repositories: Map<string, IRepository<any>> = new Map();
  private newEntities: Set<any> = new Set();
  private dirtyEntities: Set<any> = new Set();
  private removedEntities: Set<any> = new Set();
  private isTransaction: boolean = false;

  registerRepository(name: string, repository: IRepository<any>): void {
    this.repositories.set(name, repository);
  }

  async begin(): Promise<void> {
    if (this.isTransaction) {
      throw new Error('Transaction already in progress');
    }
    this.isTransaction = true;
    // Start database transaction here
  }

  async commit(): Promise<void> {
    if (!this.isTransaction) {
      throw new Error('No transaction in progress');
    }

    try {
      // Persist new entities
      for (const entity of this.newEntities) {
        await this.getRepositoryForEntity(entity).add(entity);
      }

      // Update dirty entities
      for (const entity of this.dirtyEntities) {
        await this.getRepositoryForEntity(entity).update(entity);
      }

      // Delete removed entities
      for (const entity of this.removedEntities) {
        await this.getRepositoryForEntity(entity).delete(entity);
      }

      // Commit database transaction here

      this.clear();
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  async rollback(): Promise<void> {
    if (!this.isTransaction) {
      throw new Error('No transaction in progress');
    }

    // Rollback database transaction here
    this.clear();
  }

  isActive(): boolean {
    return this.isTransaction;
  }

  registerNew(entity: any): void {
    if (!this.isTransaction) {
      throw new Error('No transaction in progress');
    }
    this.newEntities.add(entity);
  }

  registerDirty(entity: any): void {
    if (!this.isTransaction) {
      throw new Error('No transaction in progress');
    }
    this.dirtyEntities.add(entity);
  }

  registerRemoved(entity: any): void {
    if (!this.isTransaction) {
      throw new Error('No transaction in progress');
    }
    this.removedEntities.add(entity);
  }

  private getRepositoryForEntity(entity: any): IRepository<any> {
    const repositoryName = entity.constructor.name.toLowerCase();
    const repository = this.repositories.get(repositoryName);
    if (!repository) {
      throw new Error(`No repository found for entity type: ${repositoryName}`);
    }
    return repository;
  }

  private clear(): void {
    this.isTransaction = false;
    this.newEntities.clear();
    this.dirtyEntities.clear();
    this.removedEntities.clear();
  }
}