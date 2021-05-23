const crypto = require('crypto')
const userJoinLobby = require('./lobby').userJoinLobby
let tempUserList = []
let guestCount = 1

function validateLogin(name,pwd){
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

function createSSEconnection(cookieID,res){
    let user = null
    if(cookieID !== undefined){
        if(user = tempUserList.find(user => {return user.cookieID === cookieID})){
            user.setSSEconnection(res)
            res.writeHead(200, {
                      "Content-Type":"text/event-stream",
                      "Cache-Control":"no-cache",
                      "Connection":"keep-alive",
            })
            res.write(':success\n\n')
            tempUserList.forEach((currentUser,index,list) => {
                if(currentUser.cookieID === user.cookieID){
                    list.splice(index,1)
                }
            })
            userJoinLobby(user)
        }
    }
    else{
        res.statusCode = 401
        res.end()
    }
}

class User{
    constructor(name){
        this.name = name
        this.cookieID = md5(name)
        this.id = this.cookieID.substr(0,4)//两个id相同的玩家同时在线，同时在一个房间里的机率...大概很小吧。
                                            //这是用来给前端索引用户使用的，其他地方尽量使用上面那个较长的cookieID，姑且先这样吧。
        this.SSEconnection = null
        this.currentRoomID = null
    }

    setSSEconnection(res){
        this.SSEconnection = res
    }

    sendEvent(eventName,data){
        if(data){
            this.SSEconnection.write(`event:${eventName}\ndata:${JSON.stringify(data)}\n\n`)
        }
        else{
            this.SSEconnection.write(`event:${eventName}\ndata:\n\n`)
        }
    }

    info(){
        return {
            name:this.name,
            id:this.id,
        }
    }
}

function md5(str){
   return crypto
    .createHash('md5')
    .update(str)
    .digest('hex')
    .substr(0,8)//fixme:如果玩家数量大，截8个字符可能会重复。不过哪来那么多玩家，蛤蛤
                //而且两个重复玩家同时在线的可能性...很小。
}

exports.validateLogin = validateLogin
exports.createSSEconnection = createSSEconnection
