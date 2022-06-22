import { assertEquals } from "../models/dev_deps.ts"
import { router } from "../src/router.ts"

Deno.test('guest user login test', async (t) => {
    const res_body = "login success"
    const real_res = await router(
        new Request("http://0.0.0.0/login", {
            method: "POST",
            body: JSON.stringify({
            name:"",
            password:""
            }),
            headers: {
            "content-type": "application/json",
            },
        }))
    const real_res_body = await real_res?.text()

    assertEquals(real_res_body, res_body)
})

// Deno.test('create web socket test', async (t) => { //this doesn't work...I don't know why.
//     const exampleSocket = await router(new Request('http://0.0.0.0/session',{headers:{
//         "Upgrade": "websocket",
//     }}))
//     console.log(exampleSocket)
// })

Deno.test('get unknow page test', async (t) => {
    const res_body = "404 Not Found"
    const real_res = await router(new Request('http://0.0.0.0/abcd'))
    const real_res_body = await real_res?.text()

    assertEquals(real_res_body, res_body)
})