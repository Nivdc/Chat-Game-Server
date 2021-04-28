class Chat{
    constructor(name,userList = []){
        this.name = name
        this.userList = userList
    }

    sendChatMessage(message,senderCookieID = null,senderName='system'){//xxx:发送者名称排在cookieID后面有点不太自然
        let user = null
        let msg = {
            chatName:`${this.name}`,
            senderName:`${senderName}`,
            message:`${message}`,
        }

        if(senderCookieID !== null){
            if(user = this.userList.find(user =>{return user.cookieID === senderCookieID})){
                msg.senderName = user.name
                this.userList.forEach(user => {
                    user.sendEvent("chatMessage",msg)
                })
                return true
            }
            else{
                return false
            }
        }
        else{
            this.userList.forEach(user => {
                user.sendEvent("chatMessage",msg)
            })
            return true
        }
    }

    sendEventToEveryone(eventName,data){
        this.userList.forEach(user => {
            user.sendEvent(eventName,data)
        })
    }

    userJoin(user){
        this.userList.push(user)
    }

    userQuit(user){
        this.userList.forEach((currentUser,index,list) => {
            if(currentUser.cookieID === user.cookieID){
                list.splice(index,1)
             }
        })
    }

    chatUserInfo(){
        return this.userList.map(user => user.name)
    }
}

module.exports = Chat