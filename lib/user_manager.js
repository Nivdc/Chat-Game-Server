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
            userJoinLobby(user)
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
        this.SSEconnection = null
        this.currentRoomID = null
    }

    setSSEconnection(res){
        this.SSEconnection = res
    }

    sentEvent(eventName,data){
        if(data){
            this.SSEconnection.write(`event:${eventName}\ndata:${data}\n\n`)
        }
        else{
            this.SSEconnection.write(`event:${eventName}\ndata:\n\n`)
        }
    }
}

function md5(str){
   return crypto
    .createHash('md5')
    .update(str)
    .digest('hex')
    .substr(0,8)//fixme:如果玩家数量大，截8个字符可能会重复
}

exports.validateLogin = validateLogin
exports.createSSEconnection = createSSEconnection
