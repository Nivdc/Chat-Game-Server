import { validateLogin,createWebSocketConnection } from "./app/user_manager.ts"

export async function router(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if(url.pathname === '/'){
        url.pathname = '/index.html'
    }
    console.log(`${req.method}->${url.pathname}`)


    let res = await server(req)
    if(res === null){
        res = await sendStaticResource(url.pathname)
    }

    return res
}

async function server(req: Request): Promise<Response|null>{

    //user login
    if(new URLPattern({pathname:"/login"}).test(req.url) && req.method === "POST" && req.body){
        const userInfo = await req.json()
        const userCookie = validateLogin(userInfo.name,userInfo.password)
        if(userCookie !== null){
            return new Response("login success.", { 
                status: 200,
                headers: {
                    "Set-Cookie": `id=${userCookie}; SameSite=Strict; HttpOnly`,
                }
            })
        }
    }

    //user create WebSocketConnection
    if(new URLPattern({pathname:"/session"}).test(req.url)){
        const res = createWebSocketConnection(req)
        if(res !== null)
            return res
    }

    return null
}

async function sendStaticResource(path : string){
    let res
    try {
        res = await Deno.open("./src/public" + path, {read:true})
    }catch{
        res = new Response("404 Not Found", { status: 404 })
        return  res
    }

    const readableStream = res.readable
    return new Response(readableStream)
}