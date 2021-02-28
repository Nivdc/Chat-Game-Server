class Chat{
    constructor(name,userList = []){
        this.name = name
        this.userList = userList
    }

    sentChatMessage(message,senderCookieID = null){
        let msg = {
            chatName:`${this.name}`,
            senderName:'system',
            message:`${message}`,
        }

        if(senderCookieID !== null){
            this.userList.forEach(user =>{
                if(user.cookieID === senderCookieID){
                    msg.senderName = user.name
                }
            })
            if(msg.senderName === 'system'){//fixme:i hope no user's name is 'system'
                return false
            }
            else{
                this.userList.forEach(user => {
                    user.SSEconnection.write(`event:chatMessage\ndata:${JSON.stringify(msg)}\n\n`)
                })
                return true
            }
        }
        else{
            this.userList.forEach(user => {
                user.SSEconnection.write(`event:chatMessage\n
                    data:${JSON.stringify(msg)}\n\n`)
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
}

module.exports = Chat
