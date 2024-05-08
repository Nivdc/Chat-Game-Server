let user_counter = 1
const user_list: User[] = []

export function lobby_join_request(req: Request, server: Server){
    const uuid = req.headers.get("cookie")?.split('=')[1]

    if(uuid !== undefined)
        if(user_list.find(user => {return user.uuid === uuid}) !== undefined)
            return new Response("WebSocket upgrade error.", { status: 400 })

    let user = new User(`游客${user_counter}`)
    user_list.push(user)
    const success = server.upgrade(req, { data: { uuid:user.uuid }, headers : {"Set-Cookie": `user_uuid=${user.uuid}`} })

    if(success){
        user_counter ++
        return undefined
    }
    else{
        user_list.pop()
        return new Response("WebSocket upgrade error.", { status: 400 })
    }
}

export function lobby_set_user_websocket(ws: WebSocket){
    let user = user_list.find(user => {return user.uuid === ws.data.uuid})
    user?.set_websocket(ws)
}

export function lobby_user_quit(ws: WebSocket){
    user_list.forEach((currentUser,index,list) => {
        if(currentUser.uuid === ws.data.uuid){
            list.splice(index,1)
        }
    })
}

export function lobby_ws_message_router(ws, message){
    const event = JSON.parse(message)
    let user = user_list.find(user => {return user.uuid === ws.data.uuid})
    if (user !== undefined)
    if (event.type === "lobbyChatMessage") {
        send_event_to(user_list, event.type, {sender_name:user.name, message:event.data})
    }
}

function send_event_to(user_list: User[],type:string, data? :any){
    user_list.forEach(user => {
        user.send_event(type,data)
    })
}

class User{
    name : string 
    readonly uuid : string
    socket : WebSocket | null
    current_room_id : number | null

    constructor(name : string){
        this.name = name
        this.uuid = crypto.randomUUID()
        this.socket = null
        this.current_room_id = null
    }

    set_websocket(socket : WebSocket){
        this.socket = socket
    }

    send_event(type : string, data? : any){
        if(this.socket){
            if(data){
                const event = {type, data}
                this.socket.send(JSON.stringify(event))
            }
            else{
                const event = {type}
                this.socket.send(JSON.stringify(event))
            }
        }
    }

    info(){
        return {
            name: this.name,
            current_room_id: this.current_room_id
        }
    }
}