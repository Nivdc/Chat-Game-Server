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

            return serve_static_resource(url.pathname)
        }
    })

    console.log(`Listening on http://${hostname}:${server.port}...`)
}

async function serve_static_resource(path: String): Response {
    const resource = Bun.file("./src/public" + path)
    return await resource.exists() ? new Response(await resource.stream()) : new Response("404 Not Found", { status: 404 })
}

main()