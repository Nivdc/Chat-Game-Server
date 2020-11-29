//this file for chat mode

const events = require('events')

class Chat{
    constructor(name,userList = [],master){
        this.name = name
        this.userList = userList
        this.master = master
        this.channel = new events.EventEmitter()

        this.channel.on('join',(user)=>{
            this.userList.push(user)
            this.channel.on('broadcast', (sender, message)=>{
                if(user.id != sender.id){
                    user.client.write(message)
                }
            })
        })

        this.channel.on('leave',(user)=>{
            for(var i=0 ; i<this.userList.lenght ; i++){
                if(this.userList[i].id === user.id){
                    this.userList.splice(i,1)
                    break
                }
            }

            this.channel.removeListener('broadcast', (sender, message)=>{
                if(user.id != sender.id){
                    user.client.write(message)
                }
            })

            this.channel.emit('broadcast', user.id, `${user.id} has left the chatroom.\n`)
        })

        if(this.userList.length !== 0){
            this.userList.forEach(joinChatRoom(user))
        }
    }

    joinChatRoom(user){
        this.channel.emit('join',user)
    }
}

module.exports = Chat
