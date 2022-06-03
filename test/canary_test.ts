import { assertEquals } from "../models/dev_deps.ts";

Deno.test('should pass this canary test', () => {
    assertEquals(true, true);
});