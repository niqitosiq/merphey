import { Logger } from './logger';

interface Metric {
  timestamp: number;
  value: number;
  tags: Record<string, string>;
}

interface Timer {
  start: number;
  metric: string;
  tags: Record<string, string>;
}

export class MetricsService {
  private static instance: MetricsService;
  private metrics: Record<string, Metric[]> = {};
  private activeTimers: Map<string, Timer> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  // Record a single metric value
  recordMetric(name: string, value: number, tags: Record<string, string> = {}): void {
    if (!this.metrics[name]) {
      this.metrics[name] = [];
    }

    this.metrics[name].push({
      timestamp: Date.now(),
      value,
      tags,
    });

    this.logger.debug('Metric recorded', { name, value, tags });
  }

  // Start timing an operation
  startTimer(metric: string, tags: Record<string, string> = {}): string {
    const timerId = `${metric}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeTimers.set(timerId, {
      start: Date.now(),
      metric,
      tags,
    });
    return timerId;
  }

  // End timing an operation and record the duration
  endTimer(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      this.logger.warn('Timer not found', { timerId });
      return;
    }

    const duration = Date.now() - timer.start;
    this.recordMetric(timer.metric, duration, timer.tags);
    this.activeTimers.delete(timerId);
  }

  // Get metrics for a specific name and time range
  getMetrics(name: string, startTime?: number, endTime?: number): Metric[] {
    const metrics = this.metrics[name] || [];
    if (!startTime && !endTime) {
      return metrics;
    }

    return metrics.filter((metric) => {
      if (startTime && metric.timestamp < startTime) return false;
      if (endTime && metric.timestamp > endTime) return false;
      return true;
    });
  }

  // Calculate average for a metric over a time range
  calculateAverage(name: string, startTime?: number, endTime?: number): number {
    const metrics = this.getMetrics(name, startTime, endTime);
    if (metrics.length === 0) return 0;

    const sum = metrics.reduce((acc, metric) => acc + metric.value, 0);
    return sum / metrics.length;
  }

  // Get the 95th percentile for a metric
  calculatePercentile(name: string, percentile: number = 95, startTime?: number, endTime?: number): number {
    const metrics = this.getMetrics(name, startTime, endTime);
    if (metrics.length === 0) return 0;

    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[index];
  }

  // Record conversation metrics
  recordConversationMetrics(userId: string, data: {
    duration?: number;
    questionsAsked?: number;
    responseTime?: number;
    completionStatus?: 'success' | 'incomplete' | 'error';
  }): void {
    const tags = { userId };

    if (data.duration) {
      this.recordMetric('conversation_duration', data.duration, tags);
    }
    if (data.questionsAsked) {
      this.recordMetric('questions_asked', data.questionsAsked, tags);
    }
    if (data.responseTime) {
      this.recordMetric('response_time', data.responseTime, tags);
    }
    if (data.completionStatus) {
      this.recordMetric(`completion_${data.completionStatus}`, 1, tags);
    }
  }

  // Get a summary of all metrics
  getSummary(startTime?: number, endTime?: number): Record<string, {
    count: number;
    average: number;
    p95: number;
  }> {
    const summary: Record<string, any> = {};

    for (const [name, _] of Object.entries(this.metrics)) {
      summary[name] = {
        count: this.getMetrics(name, startTime, endTime).length,
        average: this.calculateAverage(name, startTime, endTime),
        p95: this.calculatePercentile(name, 95, startTime, endTime),
      };
    }

    return summary;
  }
}