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

    if (req.body) {
        const body = await req.text()
        console.log("Body:", body)
    }

    return res
}

function server(req: Request): Response | null{
    return null
}

function sendStaticResource(path : string): Response{

    return  new Response("Hello, World!")
}