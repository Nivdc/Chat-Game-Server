const events = require('events')
const net = require('net')
const Lobby = require('./lib/lobby')
const User = require('./lib/user')

const server = net.createServer(client => {
    client.write(`welcome`)
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
