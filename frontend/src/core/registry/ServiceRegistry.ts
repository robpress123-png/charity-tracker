/**
 * Service Registry - Dependency Injection Container
 * Manages service lifecycle, health monitoring, and hot-swapping
 */

import { IService, ServiceHealthStatus } from '../interfaces/IService';
import { ServiceError } from '../errors/ServiceError';

/**
 * Service registration metadata
 */
interface ServiceRegistration<T extends IService = IService> {
  token: string;
  implementation: new (...args: any[]) => T;
  instance?: T;
  dependencies?: string[];
  config?: Record<string, any>;
  singleton: boolean;
  createdAt: Date;
  lastHealthCheck?: Date;
}

/**
 * Service registry health summary
 */
interface ServiceHealthSummary {
  isHealthy: boolean;
  totalServices: number;
  healthyServices: number;
  unhealthyServices: number;
  services: Record<string, ServiceHealthStatus>;
  lastChecked: Date;
}

/**
 * Service registry for dependency injection and lifecycle management
 */
export class ServiceRegistry {
  private services = new Map<string, ServiceRegistration>();
  private initializationOrder: string[] = [];
  private isShuttingDown = false;

  /**
   * Register a service implementation
   * @param token - Unique service identifier
   * @param implementation - Service class constructor
   * @param options - Registration options
   */
  register<T extends IService>(
    token: string,
    implementation: new (...args: any[]) => T,
    options: {
      dependencies?: string[];
      config?: Record<string, any>;
      singleton?: boolean;
    } = {}
  ): void {
    if (this.services.has(token)) {
      throw new ServiceError(
        `Service ${token} is already registered`,
        'SERVICE_ALREADY_REGISTERED',
        'medium',
        false,
        'ServiceRegistry'
      );
    }

    this.services.set(token, {
      token,
      implementation,
      dependencies: options.dependencies || [],
      config: options.config || {},
      singleton: options.singleton !== false, // Default to singleton
      createdAt: new Date()
    });

    console.log(`✅ Service registered: ${token}`);
  }

  /**
   * Get service instance with lazy initialization
   * @param token - Service identifier
   * @returns Service instance
   */
  async get<T extends IService>(token: string): Promise<T> {
    const registration = this.services.get(token);

    if (!registration) {
      throw new ServiceError(
        `Service ${token} not found`,
        'SERVICE_NOT_FOUND',
        'high',
        false,
        'ServiceRegistry'
      );
    }

    // Return existing singleton instance
    if (registration.singleton && registration.instance) {
      return registration.instance as T;
    }

    // Create new instance
    const instance = await this.createInstance<T>(registration);

    // Store singleton instance
    if (registration.singleton) {
      registration.instance = instance;
    }

    return instance;
  }

  /**
   * Replace service implementation (hot-swap)
   * @param token - Service identifier
   * @param newImplementation - New service implementation
   * @param config - Optional new configuration
   */
  async replace<T extends IService>(
    token: string,
    newImplementation: new (...args: any[]) => T,
    config?: Record<string, any>
  ): Promise<void> {
    const registration = this.services.get(token);

    if (!registration) {
      throw new ServiceError(
        `Cannot replace non-existent service: ${token}`,
        'SERVICE_NOT_FOUND',
        'high',
        false,
        'ServiceRegistry'
      );
    }

    try {
      // Create test instance to validate
      const testInstance = new newImplementation();
      await testInstance.initialize(config || registration.config);

      if (!(await testInstance.isHealthy())) {
        throw new Error('New implementation failed health check');
      }

      // Gracefully shutdown old instance
      if (registration.instance) {
        await registration.instance.shutdown();
      }

      // Update registration
      registration.implementation = newImplementation;
      if (config) {
        registration.config = config;
      }
      registration.instance = undefined; // Force recreation

      console.log(`🔄 Service replaced: ${token}`);

      // Notify dependent services
      await this.notifyDependents(token);

    } catch (error) {
      throw new ServiceError(
        `Failed to replace service ${token}: ${error.message}`,
        'SERVICE_REPLACEMENT_FAILED',
        'critical',
        false,
        'ServiceRegistry'
      );
    }
  }

  /**
   * Initialize all registered services in dependency order
   */
  async initializeAll(): Promise<void> {
    console.log('🚀 Initializing services...');

    // Resolve dependency order
    const order = this.resolveDependencyOrder();
    this.initializationOrder = order;

    // Initialize services in order
    for (const token of order) {
      try {
        const service = await this.get(token);
        console.log(`✅ Service initialized: ${token}`);
      } catch (error) {
        console.error(`❌ Service initialization failed: ${token}`, error);

        // Decide if this is a critical failure
        if (this.isCriticalService(token)) {
          throw new ServiceError(
            `Critical service initialization failed: ${token}`,
            'CRITICAL_SERVICE_INIT_FAILED',
            'critical',
            false,
            'ServiceRegistry'
          );
        }
      }
    }

    console.log('✅ Service initialization complete');
  }

  /**
   * Health check all services
   * @returns Overall health summary
   */
  async healthCheck(): Promise<ServiceHealthSummary> {
    const summary: ServiceHealthSummary = {
      isHealthy: true,
      totalServices: this.services.size,
      healthyServices: 0,
      unhealthyServices: 0,
      services: {},
      lastChecked: new Date()
    };

    // Check each initialized service
    for (const [token, registration] of this.services.entries()) {
      if (!registration.instance) continue;

      try {
        const healthStatus = await registration.instance.getHealthStatus();
        summary.services[token] = healthStatus;

        if (healthStatus.isHealthy) {
          summary.healthyServices++;
        } else {
          summary.unhealthyServices++;

          // System is unhealthy if any critical service is down
          if (this.isCriticalService(token)) {
            summary.isHealthy = false;
          }
        }

        registration.lastHealthCheck = new Date();

      } catch (error) {
        summary.unhealthyServices++;
        summary.isHealthy = false;
        summary.services[token] = {
          isHealthy: false,
          lastChecked: new Date(),
          checkDuration: 0,
          uptime: 0,
          status: 'unhealthy',
          details: { errors: [error.message] }
        };
      }
    }

    return summary;
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    console.log('🛑 Shutting down services...');

    // Shutdown in reverse initialization order
    const shutdownOrder = [...this.initializationOrder].reverse();

    for (const token of shutdownOrder) {
      const registration = this.services.get(token);

      if (registration?.instance) {
        try {
          await registration.instance.shutdown();
          console.log(`✅ Service shutdown: ${token}`);
        } catch (error) {
          console.error(`❌ Service shutdown error: ${token}`, error);
        }
      }
    }

    console.log('✅ Service shutdown complete');
  }

  /**
   * Get service registration metadata
   * @param token - Service identifier
   * @returns Registration metadata or null
   */
  getServiceInfo(token: string): ServiceRegistration | null {
    return this.services.get(token) || null;
  }

  /**
   * List all registered services
   * @returns Array of service tokens
   */
  listServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Create service instance with dependency injection
   */
  private async createInstance<T extends IService>(
    registration: ServiceRegistration<T>
  ): Promise<T> {
    try {
      // Resolve dependencies
      const dependencies: Record<string, any> = {};

      for (const depToken of registration.dependencies || []) {
        dependencies[depToken] = await this.get(depToken);
      }

      // Create instance
      const instance = new registration.implementation();

      // Initialize with dependencies and config
      await instance.initialize({
        ...dependencies,
        config: registration.config
      });

      return instance;

    } catch (error) {
      throw new ServiceError(
        `Failed to create service instance: ${registration.token}`,
        'SERVICE_CREATION_FAILED',
        'high',
        true,
        'ServiceRegistry'
      );
    }
  }

  /**
   * Resolve dependency order using topological sort
   */
  private resolveDependencyOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (token: string) => {
      if (visited.has(token)) return;
      if (visiting.has(token)) {
        throw new ServiceError(
          `Circular dependency detected: ${token}`,
          'CIRCULAR_DEPENDENCY',
          'critical',
          false,
          'ServiceRegistry'
        );
      }

      visiting.add(token);

      const registration = this.services.get(token);
      if (registration) {
        for (const dep of registration.dependencies || []) {
          visit(dep);
        }
      }

      visiting.delete(token);
      visited.add(token);
      order.push(token);
    };

    // Visit all services
    for (const token of this.services.keys()) {
      visit(token);
    }

    return order;
  }

  /**
   * Notify services that depend on the given service
   */
  private async notifyDependents(token: string): Promise<void> {
    // Find services that depend on this one
    const dependents: string[] = [];

    for (const [serviceToken, registration] of this.services.entries()) {
      if (registration.dependencies?.includes(token)) {
        dependents.push(serviceToken);
      }
    }

    // Reinitialize dependent services
    for (const dependent of dependents) {
      try {
        const registration = this.services.get(dependent);
        if (registration?.instance) {
          // Shutdown and recreate
          await registration.instance.shutdown();
          registration.instance = undefined;
          await this.get(dependent); // Recreate
        }
      } catch (error) {
        console.error(`Failed to reinitialize dependent service: ${dependent}`, error);
      }
    }
  }

  /**
   * Check if a service is critical for system operation
   */
  private isCriticalService(token: string): boolean {
    // Define critical services that must be healthy for system operation
    const criticalServices = ['AUTH_SERVICE', 'CONFIG_SERVICE', 'ERROR_HANDLER'];
    return criticalServices.includes(token);
  }
}

/**
 * Global service registry instance
 */
export const serviceRegistry = new ServiceRegistry();