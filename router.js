const fs = require('fs/promises')
const userManager = require('./lib/user_manager')
const lobby = require('./lib/lobby')
const gamesFilePath = __dirname+"/public/gamePackages"

function router(req,res){
    let url = new URL(req.url,`http://${req.headers.host}`)
    let path = url.pathname  
    console.log(`${req.method}->${path}`)

    tryService(req,res).then(()=>{
        if(res.writableEnded === false && req.method === 'GET' && path.split('/')[1] !== 'session'){
            // 这个地方要达到的效果是分流http请求，分成三种：服务器服务、服务器资源、游戏服务。
            // fuck nodejs, fuck async, fuck eventEmitter
            // 这里的问题在于nodejs中所有函数都是异步执行的，
            // 使用class Promise确实可以让它同步执行，
            // 但是同步执行涉及到事件监听器的时候只是往事件监听器里面添加了一个处理函数，并没有等这个函数执行完毕，
            // 至于这个处理函数什么时候会执行完毕，我们不知道，也就是说这个事件处理函数依然是异步的。
            // 解决办法就是在上面多加了几个判定条件...暂时糊弄过去了。
            // 这个函数叫做try...似乎在暗示我们应该使用错误处理来完成同步操作，可以这样吗？以后再试试吧。
            sentStaticResource(path,res)
        }
    })
}

function tryService(req,res){
    return new Promise(function (resolve, reject) {
        serverService(req,res)
        resolve()
    })
    // if(res.writableEnded === false){
    //     lobby.tryGameService(path,cookie,res)
    // }
}

function serverService(req,res){
    let url = new URL(req.url,`http://${req.headers.host}`)
    let path = url.pathname
    let tempCache = null
    let cookieID = null

    if(typeof(req.headers.cookie) !== 'undefined'){
        cookieID = req.headers.cookie.split('=')[1]
    }

    //xxx:下面这段代码看着真的怪。。。
    switch(path.split('/')[1]){
    case 'session':
            if(req.method === "GET"){
                userManager.createSSEconnection(cookieID,res)
            }//fixme:if someone post but never get, he will stay at tempUserList forever
            else if(req.method === "POST"){
                req.on("data",data=>{
                    tempCache = JSON.parse(data.toString())//fixme:if data is huge, this will not be work
                })
                req.on("end",()=>{
                    if(cookieID = userManager.validateLogin(tempCache.userName,tempCache.password)){
                        res.statusCode = 200
                        res.setHeader('Set-Cookie',`id=${cookieID}; SameSite=Strict; HttpOnly`)
                        res.end()
                        //fixme:当前的cookieID没有加盐，如果有个家伙自己算出了这个ID，是有可能作弊的，要加盐可以使用nodejs的Hmac
                    }
                    else{
                        res.statusCode = 401
                        res.end()
                    }
                })
            }
        break

        case 'lobby':
            if(typeof(path.split('/')[2]) === 'undefined'){
                if(req.method === "GET"){
                    if(tempCache = lobby.sentLobbyInitInfo(cookieID)){
                        res.statusCode = 200
                        res.setHeader('Content-Type','application/json')
                        res.end(JSON.stringify(tempCache))
                    }
                    else{
                        res.statusCode = 401
                        res.end()
                    }
                }
            }
            else if(path.split('/')[2] === 'message'){
                if(req.method === "POST"){
                    req.on("data",data=>{
                        tempCache = JSON.parse(data.toString())//fixme:if data is huge, this will not be work
                    })
                    req.on("end",()=>{
                        if(lobby.sentChatMessage(tempCache.message,cookieID)){
                            res.statusCode = 200
                            res.end()
                        }
                        else{
                            res.statusCode = 401
                            res.end()
                        }
                    })
                }
            }
        break

        case 'room':
            if(typeof(path.split('/')[2]) === 'undefined'){//example url:/room
                if(req.method === "POST"){
                    req.on("data",data=>{
                        tempCache = JSON.parse(data.toString())//fixme:if data is huge, this will not be work
                    })
                    req.on("end",()=>{
                        if(tempCache = lobby.userCreateRoom(tempCache,cookieID)){
                            res.statusCode = 200
                            res.setHeader('Content-Type','application/json')
                            res.end(JSON.stringify(tempCache))
                        }
                        else{
                            res.statusCode = 401
                            res.end()
                        }
                    })
                }
            }
            else if(typeof(path.split('/')[3]) === 'undefined'){//example url:/room/0
                if(req.method === "GET"){
                    if(lobby.userJoinRoom(cookieID,parseInt(path.split('/')[2]))){
                        res.statusCode = 200
                        res.end()
                    }
                    else{
                        res.statusCode = 401
                        res.end()
                    }
                }
                else if(req.method === "POST"){
                    req.on("data",data=>{
                        tempCache = JSON.parse(data.toString())//fixme:if data is huge, this will not be work
                    })
                    req.on("end",()=>{
                        if(lobby.userSetRoom(tempCache,cookieID,parseInt(path.split('/')[2]))){
                            res.statusCode = 200
                            res.setHeader('Content-Type','application/json')
                            res.end()
                        }
                        else{
                            res.statusCode = 401
                            res.end()
                        }
                    })
                }
            }
            else if(path.split('/')[3] === 'message'){
                if(req.method === "POST"){
                    req.on("data",data=>{
                        tempCache = JSON.parse(data.toString())//fixme:if data is huge, this will not be work
                    })
                    req.on("end",()=>{
                        if(lobby.sentRoomChatMessage(tempCache.message,cookieID,parseInt(path.split('/')[2]))){
                            res.statusCode = 200
                            res.end()
                        }
                        else{
                            res.statusCode = 401
                            res.end()
                        }
                    })
                }
            }
            else if(path.split('/')[3] === "quit"){
                if(lobby.userQuitRoom(cookieID,parseInt(path.split('/')[2]))){
                    res.statusCode = 200
                    res.end()
                }
                else{
                    res.statusCode = 401
                    res.end()
                }
            }
            else if(path.split('/')[3] === "game"){
                if(req.method === "POST"){
                    // let roomID = path.split('/')[2]
                    // if(lobby.startGame(roomID,cookieID)){
                        res.statusCode = 200
                        res.end()
                    // }
                    // else{
                    //     res.statusCode = 401
                    //     res.end()
                    // }
                }
            }
        break

        default:
        break
    }
}

function sentStaticResource(path,res){
    path = "/public"+path
    let fileSuffix = null
    //这地方有个大bug，浏览器自动生成的请求头可能不对
    //没有考虑到文件不存在的情况
    if(path === '/public/'){
        fs.readFile(__dirname+"/public/index.html")
        .then(contents => {
            res.statusCode = 200
            res.setHeader('Content-Type','text/html')
            res.end(contents)
        })
    }
    else{
        fileSuffix = path.match(/\.([a-z0-9]*)$/i)[1]
    
        switch(fileSuffix){
            case 'html':
            case 'css':
                fs.readFile(__dirname + path,'utf8')
                .then(contents => {
                    res.statusCode = 200
                    res.setHeader('Content-Type',('text/' + fileSuffix))
                    res.end(contents)
                })
            break

            case 'js':
            case 'json':
                fs.readFile(__dirname + path,'utf8')
                .then(contents => {
                    res.statusCode = 200
                    res.setHeader('Content-Type',('application/' + (fileSuffix === 'js' ? 'x-javascript' : 'json')))
                    res.end(contents)
                })
            break

            case 'jpg':
            case 'png':
                fs.readFile(__dirname + path,'binary')
                .then(contents => {
                    res.statusCode = 200
                    res.setHeader('Content-Type',('image/' + (fileSuffix === 'png' ? 'png' : 'jpeg')))
                    res.write(contents,'binary')
                    res.end()
                })
            break

            case 'ttf':
            case 'woff':
            case 'woff2':
                fs.readFile(__dirname + path,'binary')
                .then(contents => {
                    res.statusCode = 200
                    res.setHeader('Content-Type',('font/' + fileSuffix))
                    res.write(contents,'binary')
                    res.end()
                })
            break

            default:
                res.statusCode = 404
                res.end()
            break
        }
    }
}

exports.router = router