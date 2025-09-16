# 🧪 Modular Testing Framework

## Overview

This testing framework ensures that each module can be tested in isolation, preventing changes in one area from breaking tests in another. The framework supports unit, integration, and contract testing with comprehensive mocking strategies.

## 🎯 Testing Principles

### 1. **Isolation**
- Each module is tested independently
- No shared state between test suites
- Mock external dependencies completely

### 2. **Contract-Based Testing**
- Services are tested against their interfaces
- Implementation changes don't break tests
- Easy to swap implementations

### 3. **Realistic Mocking**
- Mocks behave like real services
- Error scenarios are thoroughly tested
- Network conditions are simulated

### 4. **Fast Feedback**
- Tests run quickly and in parallel
- Clear failure messages
- Automatic retry for flaky tests

---

## 📁 Test Structure

```
src/__tests__/
├── unit/                    # Isolated unit tests
│   ├── services/           # Service-specific tests
│   ├── components/         # Component tests
│   └── utils/              # Utility function tests
├── integration/            # Module interaction tests
│   ├── auth-donation/      # Auth + donation integration
│   ├── payment-upgrade/    # Payment + license upgrade
│   └── api-error-handling/ # Error boundary integration
├── contract/               # Interface compliance tests
│   ├── IAuthService/       # Auth service contract tests
│   ├── IDonationService/   # Donation service contract tests
│   └── IPaymentService/    # Payment service contract tests
├── e2e/                    # End-to-end user journeys
├── mocks/                  # Reusable mock implementations
│   ├── services/           # Mock services
│   ├── api/               # Mock API responses
│   └── data/              # Test data fixtures
└── utils/                  # Testing utilities
    ├── testServiceRegistry.ts
    ├── mockFactory.ts
    └── testHelpers.ts
```

---

## 🔧 Test Setup Example

### Service Contract Testing

```typescript
// contract/IAuthService.test.ts
import { IAuthService, LoginCredentials } from '../../../core/interfaces/IAuthService';
import { CloudflareAuthService } from '../../../services/auth/CloudflareAuthService';
import { MockAuthService } from '../../mocks/services/MockAuthService';

describe('IAuthService Contract', () => {
  // Test all implementations
  const implementations: { name: string; factory: () => IAuthService }[] = [
    {
      name: 'CloudflareAuthService',
      factory: () => new CloudflareAuthService()
    },
    {
      name: 'MockAuthService',
      factory: () => new MockAuthService()
    }
  ];

  implementations.forEach(({ name, factory }) => {
    describe(`${name} Implementation`, () => {
      let authService: IAuthService;

      beforeEach(async () => {
        authService = factory();
        await authService.initialize({
          httpClient: createMockHttpClient(),
          config: getTestConfig()
        });
      });

      afterEach(async () => {
        await authService.shutdown();
      });

      describe('Login Contract', () => {
        test('should return success with valid credentials', async () => {
          const credentials: LoginCredentials = {
            email: 'test@example.com',
            password: 'validPassword123'
          };

          const result = await authService.login(credentials);

          expect(result.success).toBe(true);
          expect(result.user).toBeDefined();
          expect(result.user?.email).toBe(credentials.email);
        });

        test('should return failure with invalid credentials', async () => {
          const credentials: LoginCredentials = {
            email: 'test@example.com',
            password: 'wrongPassword'
          };

          const result = await authService.login(credentials);

          expect(result.success).toBe(false);
          expect(result.error).toBe('INVALID_CREDENTIALS');
          expect(result.user).toBeUndefined();
        });

        test('should handle network errors gracefully', async () => {
          // Simulate network error
          const authServiceWithFailedNetwork = factory();
          await authServiceWithFailedNetwork.initialize({
            httpClient: createFailingHttpClient(),
            config: getTestConfig()
          });

          const credentials: LoginCredentials = {
            email: 'test@example.com',
            password: 'validPassword123'
          };

          const result = await authServiceWithFailedNetwork.login(credentials);

          expect(result.success).toBe(false);
          expect(result.error).toBe('SERVICE_UNAVAILABLE');
        });
      });

      describe('Health Check Contract', () => {
        test('should report healthy when properly initialized', async () => {
          const isHealthy = await authService.isHealthy();
          expect(isHealthy).toBe(true);
        });

        test('should provide detailed health status', async () => {
          const healthStatus = await authService.getHealthStatus();

          expect(healthStatus).toMatchObject({
            isHealthy: expect.any(Boolean),
            lastChecked: expect.any(Date),
            checkDuration: expect.any(Number),
            uptime: expect.any(Number),
            status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
          });
        });
      });
    });
  });
});
```

### Isolated Component Testing

```typescript
// unit/components/DonationForm.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DonationForm } from '../../../components/forms/DonationForm';
import { TestServiceProvider } from '../../utils/TestServiceProvider';
import { createMockDonationService } from '../../mocks/services/MockDonationService';

describe('DonationForm Component', () => {
  let mockDonationService: jest.Mocked<IDonationService>;

  beforeEach(() => {
    mockDonationService = createMockDonationService();
  });

  const renderWithServices = (props = {}) => {
    return render(
      <TestServiceProvider services={{ donationService: mockDonationService }}>
        <DonationForm {...props} />
      </TestServiceProvider>
    );
  };

  describe('Form Rendering', () => {
    test('should render all required fields', () => {
      renderWithServices();

      expect(screen.getByLabelText(/charity name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/donation date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save donation/i })).toBeInTheDocument();
    });

    test('should show appropriate fields based on donation type', () => {
      renderWithServices({ initialType: 'crypto' });

      expect(screen.getByLabelText(/cryptocurrency type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/crypto amount/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /get price/i })).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    test('should prevent submission with invalid data', async () => {
      renderWithServices();

      const submitButton = screen.getByRole('button', { name: /save donation/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/charity name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/amount must be greater than 0/i)).toBeInTheDocument();
      });

      expect(mockDonationService.createDonation).not.toHaveBeenCalled();
    });

    test('should submit with valid data', async () => {
      mockDonationService.createDonation.mockResolvedValue({
        id: 'donation-123',
        charity_id: 'charity-456',
        type: 'money',
        amount: 100,
        // ... other fields
      });

      renderWithServices();

      // Fill out form
      fireEvent.change(screen.getByLabelText(/charity name/i), {
        target: { value: 'Test Charity' }
      });
      fireEvent.change(screen.getByLabelText(/amount/i), {
        target: { value: '100' }
      });

      fireEvent.click(screen.getByRole('button', { name: /save donation/i }));

      await waitFor(() => {
        expect(mockDonationService.createDonation).toHaveBeenCalledWith(
          expect.objectContaining({
            charity_id: expect.any(String),
            type: 'money',
            tax_deductible_amount: 100
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    test('should show error when service fails', async () => {
      mockDonationService.createDonation.mockRejectedValue(
        new ServiceError('Service unavailable', 'SERVICE_ERROR', 'high', true, 'DONATION')
      );

      renderWithServices();

      // Fill and submit form
      fireEvent.change(screen.getByLabelText(/charity name/i), {
        target: { value: 'Test Charity' }
      });
      fireEvent.change(screen.getByLabelText(/amount/i), {
        target: { value: '100' }
      });
      fireEvent.click(screen.getByRole('button', { name: /save donation/i }));

      await waitFor(() => {
        expect(screen.getByText(/unable to save donation/i)).toBeInTheDocument();
      });
    });

    test('should recover from errors when retry is successful', async () => {
      mockDonationService.createDonation
        .mockRejectedValueOnce(new ServiceError('Temporary error', 'TEMP_ERROR', 'medium', true, 'DONATION'))
        .mockResolvedValue({ id: 'donation-123' } as any);

      renderWithServices();

      // Submit form - should fail first time
      fireEvent.click(screen.getByRole('button', { name: /save donation/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      });

      // Retry - should succeed
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      await waitFor(() => {
        expect(screen.getByText(/donation saved successfully/i)).toBeInTheDocument();
      });
    });
  });

  describe('Feature Flag Integration', () => {
    test('should hide crypto fields when crypto donations disabled', () => {
      const mockFeatureFlags = {
        ...defaultFeatureFlags,
        CRYPTO_DONATIONS: false
      };

      render(
        <TestServiceProvider
          services={{ donationService: mockDonationService }}
          featureFlags={mockFeatureFlags}
        >
          <DonationForm />
        </TestServiceProvider>
      );

      expect(screen.queryByLabelText(/cryptocurrency/i)).not.toBeInTheDocument();
    });
  });
});
```

### Integration Testing

```typescript
// integration/auth-donation.test.ts
import { TestServiceRegistry } from '../utils/testServiceRegistry';
import { createMockAuthService } from '../mocks/services/MockAuthService';
import { createMockDonationService } from '../mocks/services/MockDonationService';

describe('Auth-Donation Integration', () => {
  let serviceRegistry: TestServiceRegistry;

  beforeEach(async () => {
    serviceRegistry = new TestServiceRegistry();

    // Register services
    serviceRegistry.register('AUTH_SERVICE', createMockAuthService);
    serviceRegistry.register('DONATION_SERVICE', createMockDonationService, {
      dependencies: ['AUTH_SERVICE']
    });

    await serviceRegistry.initializeAll();
  });

  afterEach(async () => {
    await serviceRegistry.shutdown();
  });

  test('should prevent donation creation when user not authenticated', async () => {
    const authService = await serviceRegistry.get('AUTH_SERVICE');
    const donationService = await serviceRegistry.get('DONATION_SERVICE');

    // Ensure user is not authenticated
    await authService.logout();

    // Attempt to create donation
    const donationData = {
      charity_id: 'charity-123',
      type: 'money' as const,
      date: '2024-01-01',
      tax_deductible_amount: 100,
      metadata: { method: 'Cash' }
    };

    await expect(donationService.createDonation(donationData))
      .rejects.toThrow(/authentication required/i);
  });

  test('should enforce freemium limits for free users', async () => {
    const authService = await serviceRegistry.get('AUTH_SERVICE');
    const donationService = await serviceRegistry.get('DONATION_SERVICE');

    // Login as free user
    await authService.login({
      email: 'free@example.com',
      password: 'password'
    });

    const donationData = {
      charity_id: 'charity-123',
      type: 'money' as const,
      date: '2024-01-01',
      tax_deductible_amount: 100,
      metadata: { method: 'Cash' }
    };

    // Should allow first 2 donations
    await donationService.createDonation(donationData);
    await donationService.createDonation(donationData);

    // Third donation should fail
    await expect(donationService.createDonation(donationData))
      .rejects.toThrow(/donation limit exceeded/i);
  });

  test('should allow unlimited donations for paid users', async () => {
    const authService = await serviceRegistry.get('AUTH_SERVICE');
    const donationService = await serviceRegistry.get('DONATION_SERVICE');

    // Login as paid user
    await authService.login({
      email: 'paid@example.com',
      password: 'password'
    });

    const donationData = {
      charity_id: 'charity-123',
      type: 'money' as const,
      date: '2024-01-01',
      tax_deductible_amount: 100,
      metadata: { method: 'Cash' }
    };

    // Should allow many donations
    for (let i = 0; i < 10; i++) {
      await expect(donationService.createDonation(donationData))
        .resolves.toBeDefined();
    }
  });
});
```

### Error Boundary Testing

```typescript
// unit/boundaries/ModularErrorBoundary.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ModularErrorBoundary } from '../../../components/boundaries/ModularErrorBoundary';
import { ServiceError } from '../../../core/errors/ServiceError';

// Component that throws errors for testing
const ErrorThrowingComponent: React.FC<{ shouldThrow: boolean; errorType: string }> = ({
  shouldThrow,
  errorType
}) => {
  if (shouldThrow) {
    if (errorType === 'service') {
      throw new ServiceError('Test service error', 'TEST_ERROR', 'medium', true, 'TEST_MODULE');
    } else {
      throw new Error('Generic test error');
    }
  }
  return <div>Normal content</div>;
};

describe('ModularErrorBoundary', () => {
  // Suppress console.error for clean test output
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  test('should render children when no error occurs', () => {
    render(
      <ModularErrorBoundary moduleId="TEST_MODULE">
        <ErrorThrowingComponent shouldThrow={false} errorType="none" />
      </ModularErrorBoundary>
    );

    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  test('should catch and display service errors', () => {
    render(
      <ModularErrorBoundary moduleId="TEST_MODULE">
        <ErrorThrowingComponent shouldThrow={true} errorType="service" />
      </ModularErrorBoundary>
    );

    expect(screen.getByText(/test module temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  test('should convert generic errors to service errors', () => {
    render(
      <ModularErrorBoundary moduleId="TEST_MODULE">
        <ErrorThrowingComponent shouldThrow={true} errorType="generic" />
      </ModularErrorBoundary>
    );

    expect(screen.getByText(/test module temporarily unavailable/i)).toBeInTheDocument();
  });

  test('should use custom fallback component when provided', () => {
    const CustomFallback: React.FC<any> = () => (
      <div>Custom error message</div>
    );

    render(
      <ModularErrorBoundary
        moduleId="TEST_MODULE"
        fallbackComponent={CustomFallback}
      >
        <ErrorThrowingComponent shouldThrow={true} errorType="service" />
      </ModularErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });

  test('should attempt automatic recovery for recoverable errors', async () => {
    const onError = jest.fn();

    render(
      <ModularErrorBoundary
        moduleId="TEST_MODULE"
        enableRecovery={true}
        onError={onError}
      >
        <ErrorThrowingComponent shouldThrow={true} errorType="service" />
      </ModularErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TEST_ERROR',
        recoverable: true
      }),
      expect.any(Object)
    );
  });
});
```

---

## 🔄 Continuous Integration Setup

### Test Pipeline Configuration

```yaml
# .github/workflows/test.yml
name: Modular Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        module: [auth, donations, payments, pricing, charts]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit:${{ matrix.module }}

  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:contract

  integration-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, contract-tests]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:e2e
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest src/__tests__/unit",
    "test:unit:auth": "jest src/__tests__/unit/services/auth",
    "test:unit:donations": "jest src/__tests__/unit/services/donations",
    "test:contract": "jest src/__tests__/contract",
    "test:integration": "jest src/__tests__/integration",
    "test:e2e": "playwright test",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:debug": "jest --runInBand --verbose"
  }
}
```

This comprehensive testing framework ensures that:

1. **Modules are truly isolated** - Changes in one service don't break tests in another
2. **Contracts are enforced** - Service implementations must comply with interfaces
3. **Error scenarios are covered** - All failure modes are tested
4. **Integration is verified** - Modules work correctly together
5. **Performance is maintained** - Tests run quickly and in parallel
6. **Confidence is high** - Comprehensive coverage prevents regressions