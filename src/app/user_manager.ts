import { crypto } from "../../models/dev_deps.ts"
// const userJoinLobby = require('./lobby').userJoinLobby
const tempUserList = []
let guestCount = 1

export function validateLogin(name: string,pwd: string){
    if(name === "" && pwd === ""){
        let user = new User("游客"+guestCount)
        guestCount++
        tempUserList.push(user)
        return user.cookieID
    }
    else{
        return null
    }
}

export function createWebSocketConnection(req: Request){

    const upgrade = req.headers.get("upgrade") || ""
    let response, socket: WebSocket
    try {
        ({ response, socket } = Deno.upgradeWebSocket(req))
    } catch {
        return new Response("request isn't trying to upgrade to websocket.", { status : 400 })
    }
    socket.onopen = () => console.log("socket opened")
    socket.onmessage = (e) => {
        console.log("socket message:", e.data)
        socket.send(new Date().toString())
    }
    socket.onerror = (e) => console.log("socket errored:", e)
    socket.onclose = () => console.log("socket closed")
    return response

    // let user = null
    // if(cookieID !== undefined){
    //     if(user = tempUserList.find(user => {return user.cookieID === cookieID})){
    //         user.setSSEconnection(res)
    //         res.writeHead(200, {
    //                   "Content-Type":"text/event-stream",
    //                   "Cache-Control":"no-cache",
    //                   "Connection":"keep-alive",
    //         })
    //         res.write(':success\n\n')
    //         tempUserList.forEach((currentUser,index,list) => {
    //             if(currentUser.cookieID === user.cookieID){
    //                 list.splice(index,1)
    //             }
    //         })
    //         userJoinLobby(user)
    //     }
    // }
    // else{
    //     res.statusCode = 401
    //     res.end()
    // }
}

class User{
    name : string 
    cookieID : string
    id : string
    webSocketConnection : WebSocket | null
    currentRoomID : number | null

    constructor(name : string){
        this.name = name
        this.cookieID = crypto.randomUUID()
        this.id = this.cookieID.substring(0,4)//2个id相同的玩家同时在线，同时在一个房间里的机率...大概很小吧。
                                            //这是用来给前端索引用户使用的，其他地方尽量使用上面那个较长的cookieID，姑且先这样吧。
        this.webSocketConnection = null
        this.currentRoomID = null
    }

    setWebSocketConnection(socket : WebSocket){
        this.webSocketConnection = socket
    }

    sendEvent(eventName : string, data : string){
        if(this.webSocketConnection){
            if(data){
                this.webSocketConnection.send(`event:${eventName}\ndata:${JSON.stringify(data)}\n\n`)
            }
            else{
                this.webSocketConnection.send(`event:${eventName}\ndata:\n\n`)
            }
        }
    }

    info(){
        return {
            name:this.name,
            id:this.id,
        }
    }
}