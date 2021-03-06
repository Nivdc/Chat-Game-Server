const http = require('http')
const router = require('./router').router

const server = http.createServer((req,res) => {
    router(req,res)
})

server.listen(3000,'192.168.1.9',()=>{
    console.log('Server running at http://192.168.1.9:3000')
})
