import { scoped, Lifecycle, injectable, autoInjectable } from 'tsyringe';
import { EventType } from './EventTypes';

/**
 * Event bus for system-wide events
 * Allows decoupled communication between components
 */

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class EventBus {
  private listeners: Map<string, Array<(data?: any) => void>> = new Map();

  /**
   * Subscribe to an event
   * @param eventName - Name of the event to subscribe to
   * @param callback - Function to call when the event is published
   * @returns Function to unsubscribe from the event
   */
  public subscribe(eventName: string, callback: (data?: any) => void): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }

    this.listeners.get(eventName)!.push(callback);

    // Return unsubscribe function
    return () => {
      const eventListeners = this.listeners.get(eventName);
      if (eventListeners) {
        const index = eventListeners.indexOf(callback);
        if (index !== -1) {
          eventListeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Publish an event
   * @param eventName - Name of the event to publish
   * @param data - Optional data to pass to subscribers
   */
  public publish(eventName: EventType, data?: any): void {
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      // Create a copy of the listeners array to avoid issues if callbacks modify the array
      [...eventListeners].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for "${eventName}":`, error);
        }
      });
    }
  }

  /**
   * Check if an event has subscribers
   * @param eventName - Name of the event to check
   * @returns Boolean indicating if the event has subscribers
   */
  public hasListeners(eventName: string): boolean {
    const listeners = this.listeners.get(eventName);
    return Boolean(listeners && listeners.length > 0);
  }
}
