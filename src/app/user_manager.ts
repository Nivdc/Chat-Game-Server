import { crypto } from "../../models/dev_deps.ts"
// const userJoinLobby = require('./lobby').userJoinLobby
const tempUserList: User[] = []
let guestCount = 1

export function validateLogin(name: string,pwd: string){
    if(name === "" && pwd === ""){
        const user = new User("游客"+guestCount)
        guestCount++
        tempUserList.push(user)
        return user.uuid
    }
    else{
        return null
    }
}

export function createWebSocketConnection(req: Request) : Response{
    const uuid = req.headers.get("cookie")?.split('=')[1]
    const user = tempUserList.find(user => {return user.uuid === uuid})
    if(user === undefined){
        return new Response("cilent error.", { status : 400 })
    }

    tempUserList.forEach((currentUser,index,list) => {
        if(currentUser.uuid === user.uuid){
            list.splice(index,1)
        }
    })

    let response, socket: WebSocket
    try {
        ({ response, socket } = Deno.upgradeWebSocket(req))
    } catch {
        return new Response("request isn't trying to upgrade to websocket.", { status : 400 })
    }

    socket.onopen = () => user.setWebSocketConnection(socket)
    // userJoinLobby(user)

    return response

    // socket.onopen = () => console.log("socket opened")
    // socket.onmessage = (e) => {
    //     console.log("socket message:", JSON.parse(e.data).message)
    //     socket.send(JSON.stringify({eventType:"chatMessage",content:JSON.parse(e.data).message}))
    // }
    // socket.onerror = (e) => console.log("socket errored:", e)
    // socket.onclose = () => console.log("socket closed")
}

export class User{
    name : string 
    readonly uuid : string
    socket : WebSocket | null
    currentRoomID : number | null

    constructor(name : string){
        this.name = name
        this.uuid = crypto.randomUUID()
        this.socket = null
        this.currentRoomID = null
    }

    setWebSocketConnection(socket : WebSocket){
        this.socket = socket
    }

    sendEvent(eventType : string, data? : any){
        if(this.socket){
            if(data){
                const event = {type:eventType, data:data}
                this.socket.send(JSON.stringify(event))
            }
            else{
                const event = {type:eventType}
                this.socket.send(JSON.stringify(event))
            }
        }
    }

    info(){
        return {
            name:this.name,
            uuid:this.uuid,
        }
    }
}