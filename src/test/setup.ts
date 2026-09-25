/**
 * Test-suite guard: no automated test may reach the network. Code under test
 * that needs HTTP (the Immowelt link resolver) receives an injected fetch.
 */
globalThis.fetch = (() => {
  throw new Error("Network access is disabled in tests; inject a mocked fetch instead.");
}) as typeof fetch;
