import { lobby_join_request, lobby_set_user_websocket } from "./lib/lobby"
import { lobby_user_quit, lobby_ws_message_router } from "./lib/lobby"

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
            if(url.pathname === '/session') return lobby_join_request(req, server)

            return serve_static_resource(url.pathname)
        },
        websocket: {
            message(ws, message) {
                lobby_ws_message_router(ws, message)
            },
            open(ws) {
                lobby_set_user_websocket(ws)
            },
            close(ws, code, message) {
                lobby_user_quit(ws)
            },
            // drain(ws) {}, // the socket is ready to receive more data
          },
    })

    console.log(`Listening on http://${hostname}:${server.port}...`)
}

async function serve_static_resource(path: String): Response {
    const resource = Bun.file("./src/public" + path)
    return await resource.exists() ? new Response(resource) : new Response("404 Not Found", { status: 404 })
}

main()