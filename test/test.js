const events = require('events')
const net = require('net')
const Chat = require('./chat')

const testChat=new Chat()

const server = net.createServer(client => {
    let user = {}
    user.id=`${client.remoteAddress}:${client.remotePort}`
    user.client=client
    testChat.channel.emit('join', user)
    client.on('data',data => {
        console.log(testChat.userList)
        data = data.toString()
        testChat.channel.emit('broadcast', user.id, data)
    })
    client.on('close',data => {
        testChat.channel.emit('leave', user)
    })

})

server.listen(8888)
