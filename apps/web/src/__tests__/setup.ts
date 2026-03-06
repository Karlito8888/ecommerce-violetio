// Enable React act() in jsdom environment (suppresses "not configured to support act()" warning)
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
