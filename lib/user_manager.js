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
            res.writeHead(200, {
                      "Content-Type":"text/event-stream",
                      "Cache-Control":"no-cache",
                      "Connection":"keep-alive",
            })
            user.setSSEconnection(res)
            userJoinLobby(user)
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
        this.cookieID = md5(name).substr(0,8)
        this.SSEconnection = null
    }

    setSSEconnection(res){
        this.SSEconnection = res
    }
}

function md5(str){
   return crypto
    .createHash('md5')
    .update(str)
    .digest('hex')
}

exports.validateLogin = validateLogin
exports.createSSEconnection = createSSEconnection
