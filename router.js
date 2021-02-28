const fs = require('fs/promises')
const userManager = require('./lib/user_manager')
const lobby = require('./lib/lobby')

function router(req,res){
    let url = new URL(req.url,`http://${req.headers.host}`)
    let path = url.pathname
    let tempCache = null
    if(req.headers.cookie !== undefined){
        let cookieID = req.headers.cookie.split('=')[1]
    }
    else{
        let cookieID = null
    }

    console.log(`${path}`);
    switch(path){
        case '/':
            fs.readFile(__dirname+"/public/index.html")
            .then(contents => {
                res.statusCode = 200
                res.setHeader('Content-Type','text/html')
                res.end(contents)
            })
        break
        case '/session':
            if(req.method === "GET"){
                userManager.createSSEconnection(cookieID,res)
            }//fixme:if someone post but never get, he will stay at userList for ever
            else if(req.method === "POST"){
                req.on("data",data=>{
                    tempCache = JSON.parse(data.toString())//fixme:if data is huge, this will not be work
                })
                req.on("end",()=>{
                    if(cookieID = userManager.validateLogin(tempCache.userName,tempCache.password)){
                        res.statusCode = 200
                        res.setHeader('Set-Cookie',`id=${cookieID}; SameSite=Strict; HttpOnly`)
                        res.end()
                        //当前的cookieID没有加盐，如果有个家伙自己算出了这个ID，是有可能作弊的
                    }
                    else{
                        res.statusCode = 401
                        res.end()
                    }
                })
            }
        break
        case '/lobby':
            if(req.method === "GET"){
                if(tempCache = lobby.sentRoomList(cookieID)){
                    res.statusCode = 200
                    res.setHeader('Content-Type','application/json')
                    res.end(JSON.stringify(tempCache))
                }
                else{
                    res.statusCode = 401
                    res.end()
                }
            }
        break
        case '/lobby/message':
            if(req.method === "POST"){
                req.on("data",data=>{
                    tempCache = JSON.parse(data.toString())
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
        break
        case '/rooms':
            if(req.method === "GET"){
                userJoinRoom(cookieID)
            }
            else if(req.method === "POST"){
                userCreateRoom()
            }
        break

        default:
            sentStaticResource(path,res)
    }
 }

function sentStaticResource(path,res){
    path = "/public"+path
    //这地方有个大bug，浏览器自动生成的请求头可能不对
    //没有考虑到文件不存在的情况
    let fileSuffix = path.match(/\.([a-z0-9]*)$/i)[1]

    switch(fileSuffix){
        case 'html':
        case 'css':
            fs.readFile(__dirname + `${path}`,'utf8')
            .then(contents => {
                res.statusCode = 200
                res.setHeader('Content-Type',('text/' + fileSuffix))
                res.end(contents)
            })
        break

        case 'js':
        case 'json':
            fs.readFile(__dirname + `${path}`,'utf8')
            .then(contents => {
                res.statusCode = 200
                res.setHeader('Content-Type',('application/' + (fileSuffix === 'js' ? 'x-javascript' : 'json')))
                res.end(contents)
            })
        break

        case 'jpg':
        case 'png':
            fs.readFile(__dirname + `${path}`,'binary')
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
            fs.readFile(__dirname + `${path}`,'binary')
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

exports.router = router
