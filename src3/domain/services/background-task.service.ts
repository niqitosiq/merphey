import { ConversationContext } from '../models/conversation';
import { PsychologistResponse } from '../prompts';

export interface Task {
  id: string;
  type: 'analysis' | 'summarization';
  startTime: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  contextId: string;
  result?: any;
  error?: Error;
}

export class BackgroundTaskManager {
  private tasks: Map<string, Task> = new Map();
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = 5 * 60 * 1000) {
    // 5 minutes default
    this.timeoutMs = timeoutMs;
    this.startCleanupInterval();
  }

  async scheduleTask<T>(
    type: Task['type'],
    contextId: string,
    operation: () => Promise<T>,
  ): Promise<string> {
    const taskId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const task: Task = {
      id: taskId,
      type,
      startTime: Date.now(),
      status: 'pending',
      contextId,
    };

    this.tasks.set(taskId, task);

    // Execute task
    task.status = 'running';
    operation()
      .then((result) => {
        task.status = 'completed';
        task.result = result;
      })
      .catch((error) => {
        task.status = 'failed';
        task.error = error;
        console.error(`Task ${taskId} failed:`, error);
      });

    return taskId;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getTasksForContext(contextId: string): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.contextId === contextId);
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, task] of this.tasks) {
        if (now - task.startTime > this.timeoutMs) {
          if (task.status === 'running' || task.status === 'pending') {
            task.status = 'failed';
            task.error = new Error('Task timed out');
          }
          // Keep completed/failed tasks for a short while for reporting
          if (now - task.startTime > this.timeoutMs * 2) {
            this.tasks.delete(id);
          }
        }
      }
    }, 60000); // Check every minute
  }

  async waitForTask<T>(taskId: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const task = this.getTask(taskId);
        if (!task) {
          clearInterval(checkInterval);
          reject(new Error('Task not found'));
          return;
        }

        if (task.status === 'completed') {
          clearInterval(checkInterval);
          resolve(task.result);
        } else if (task.status === 'failed') {
          clearInterval(checkInterval);
          reject(task.error);
        }
      }, 100);

      // Set timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Task wait timeout'));
      }, this.timeoutMs);
    });
  }
}
