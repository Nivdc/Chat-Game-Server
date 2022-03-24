const http = require('http')
const router = require('./router').router

const server = http.createServer((req,res) => {
    router(req,res)
})

server.listen(3000,'127.0.0.1',()=>{
    console.log('Server running at http://localhost:3000')
})
