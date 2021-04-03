class Chat{
    constructor(name,userList = []){
        this.name = name
        this.userList = userList
    }

    sentChatMessage(message,senderCookieID = null,senderName='system'){//xxx:发送者名称排在cookieID后面有点不太自然
        let tempUser = null
        let msg = {
            chatName:`${this.name}`,
            senderName:`${senderName}`,
            message:`${message}`,
        }

        if(senderCookieID !== null){
            if(tempUser = this.userList.find(user =>{return user.cookieID === senderCookieID})){
                msg.senderName = tempUser.name
                this.userList.forEach(user => {
                    user.sentEvent("chatMessage",JSON.stringify(msg))
                })
                return true
            }
            else{
                return false
            }
        }
        else{
            this.userList.forEach(user => {
                user.sentEvent("chatMessage",JSON.stringify(msg))
            })
            return true
        }
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

    chatInfo(){
        return this.userList.map(user => user.name)
    }
}

module.exports = Chat