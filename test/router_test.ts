import { assertEquals } from "../models/dev_deps.ts"
import { router } from "../src/router.ts"

Deno.test('get index page test', async (t) => {
    const res_body = "Hello, World!"
    const real_res = await router(new Request('http://0.0.0.0/'))
    const real_res_body = await real_res?.text()

    assertEquals(real_res_body, res_body)
})