// Configuration
const port = process.env?.PORT ? Number(process.env.PORT) : 3000
const development = process.env?.NODE_ENV === "development"
const hostname = process.env?.HOSTNAME ?? "localhost"

function main(){
    const server = Bun.serve({
        port,
        hostname,
        development,
        fetch(req, server){
            console.log(`[request]: ${req.method}->${req.url}`)
            // return new Response("Bun!")

            const url = new URL(req.url)
            if(url.pathname === '/') url.pathname = '/index.html'
            if(url.pathname === '/session') return user_join_lobby(req, server)

            return serve_static_resource(url.pathname)
        },
        websocket: {
            message(ws, message) {}, // a message is received
            open(ws) {}, // a socket is opened
            close(ws, code, message) {}, // a socket is closed
            drain(ws) {}, // the socket is ready to receive more data
          },
    })

    console.log(`Listening on http://${hostname}:${server.port}...`)
}

async function serve_static_resource(path: String): Response {
    const resource = Bun.file("./src/public" + path)
    return await resource.exists() ? new Response(await resource.stream()) : new Response("404 Not Found", { status: 404 })
}

let user_counter = 1
const user_list = []

function user_join_lobby(req: Request, server: Server){
    const uuid = req.headers.get("cookie")?.split('=')[1]
    console.log(uuid)

    if(uuid !== undefined)
        if(user_list.find(user => {return user.uuid === uuid}) !== undefined)
            return new Response("WebSocket upgrade error.", { status: 400 })
        }

    let user = {name:`游客${user_counter}`, uuid:crypto.randomUUID()}
    const success = server.upgrade(req, { data: { uuid:user.uuid }, headers : {"Set-Cookie": `user_uuid=${user.uuid}`} })

    if(success){
        user_counter ++
        user_list.push(user)
        return undefined
    }
    else{
        return new Response("WebSocket upgrade error.", { status: 400 })
    }
    return success
        ? undefined
        : new Response("WebSocket upgrade error.", { status: 400 })
}

main()