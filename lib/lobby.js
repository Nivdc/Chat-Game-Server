const fs = require('fs')
const Chat = require('./chat')
const userList = []
const roomList = []
const lobbyChat = new Chat('大厅')
const gamesFilePath = __dirname+"/../public/gamePackages"
const EventEmitter = new require('events')
const lobbyListener = new EventEmitter()
let roomCount = 0
let gameList = null

function init(){
    gameList = getGameList()
    lobbyListener.on('cleanRoom',(roomID)=>{
        deleteRoom(roomID)
    })
    lobbyListener.on('gameStart',(room)=>{
        room.status = "inGame"
        userList.forEach(user => {
            user.SSEconnection.write(`event:RoomInfoUpd\ndata:${JSON.stringify(room.roomInfo())}\n\n`)
            //xxx:只是更新个房间，咋要发送这么一大坨数据呢？但是好像很方便啊
        })
    })
    lobbyListener.on('gameOver',(room)=>{
        room.status = "open"
        userList.forEach(user => {
            user.SSEconnection.write(`event:RoomInfoUpd\ndata:${JSON.stringify(room.roomInfo())}\n\n`)
            //xxx:只是更新个房间，咋要发送这么一大坨数据呢？但是好像很方便啊
        })
    })
}

function getGameList(){
    let gameList = []
    let gameCount = 0
    let files = fs.readdirSync(gamesFilePath)
    files.forEach((file)=>{
        gameList.push(new Game(file,require(`${gamesFilePath}/${file}/package`),gameCount))
        gameCount++
    })

    return gameList
}

function userCreateRoom(roomData,hostCookieID){
    let tempUser = null
    let tempRoom = null
    if(tempUser = userList.find(user => {return user.cookieID === hostCookieID})){
        tempRoom = new Room(roomData,tempUser,roomCount)
        roomList.push(tempRoom)
        userList.forEach(user => {
            if(user.cookieID !== hostCookieID){
                user.SSEconnection.write(`event:createRoom\ndata:${JSON.stringify(tempRoom.roomInfo())}\n\n`)
            }
        })
        roomCount++
        return tempRoom.roomInfo()
    }
    return false
}

function deleteRoom(roomID){
    roomList.forEach((room,index,list) => {
        if(room.id === roomID){
            room.status = 'close'
            userList.forEach(user => {
                user.SSEconnection.write(`event:RoomInfoUpd\ndata:${JSON.stringify(room.roomInfo())}\n\n`)
                //xxx:只是删掉个房间，咋要发送这么一大坨数据呢？但是好像很方便啊
            })
           list.splice(index,1)
        }
    })
}

function sendLobbyInitInfo(user){
    user.sendEvent("lobbyInit",{
            roomsInfo:roomList.map(room => room.roomInfo()),
            gamesInfo:gameList.map(game => game.gameInfo()),
        }
    )
}

function sendChatMessage(message,senderCookieID){
    return lobbyChat.sendChatMessage(message,senderCookieID)
}

function sendRoomChatMessage(message,senderCookieID,roomID){
    let room = null
    if(room = roomList.find(room => {return room.id === roomID})){
        return room.sendChatMessage(message,senderCookieID)
    }
    return false
}

function userJoinLobby(user){
    userList.push(user)
    lobbyChat.userJoin(user)
    sendLobbyInitInfo(user)
    lobbyChat.sendEventToEveryone("lobbyChatUserListUpd",lobbyChat.chatUserInfo())

    user.SSEconnection.on('close',()=>{
        userList.forEach((currentUser,index,list) => {
            if(currentUser.cookieID === user.cookieID){
                list.splice(index,1)
                lobbyChat.userQuit(currentUser)
                lobbyChat.sendEventToEveryone("lobbyChatUserListUpd",lobbyChat.chatUserInfo())
                
                if(user.currentRoomID){
                    roomList.forEach((currentRoom,index,list)=>{
                        if(currentRoom.id === user.currentRoomID){
                            currentRoom.userQuit(user.cookieID)
                            userList.forEach(user => {
                                user.SSEconnection.write(`event:RoomInfoUpd\ndata:${JSON.stringify(currentRoom.roomInfo())}\n\n`)
                                //xxx:只是一个人退出，咋要发送这么一大坨数据呢？但是好像很方便啊
                            })
                        }
                    })
                }
            }
        })
    })
}

function userQuitLobby(user){//todo...?这个功能有用吗？也许可以给游戏中的玩家少发点大厅数据。

}

function userJoinRoom(cookieID,roomID){
    let tempUser = null
    let tempRoom = null
    if(tempUser = userList.find(user => {return user.cookieID === cookieID})){
        if(tempRoom = roomList.find(room => {return room.id === roomID})){
            tempRoom.userJoin(tempUser)
            userList.forEach(user => {
                user.SSEconnection.write(`event:RoomInfoUpd\ndata:${JSON.stringify(tempRoom.roomInfo())}\n\n`)
                //xxx:只是一个人加入，咋要发送这么一大坨数据呢？但是好像很方便啊
            })
            return true
        }
    }
    return false
}

function userQuitRoom(cookieID,roomID){
    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        tempRoom.userQuit(cookieID)
        userList.forEach(user => {
            user.SSEconnection.write(`event:RoomInfoUpd\ndata:${JSON.stringify(tempRoom.roomInfo())}\n\n`)
            //xxx:只是一个人退出，咋要发送这么一大坨数据呢？但是好像很方便啊
        })
        return true
    }
    return false
}

function userSetRoom(roomData,userCookieID,roomID){
    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        if(tempRoom.userSetRoom(roomData,userCookieID)){
            userList.forEach(user => {
                user.SSEconnection.write(`event:RoomInfoUpd\ndata:${JSON.stringify(tempRoom.roomInfo())}\n\n`)
                //xxx:只是改改设置，咋要发送这么一大坨数据呢？但是好像很方便啊
            })
            return true
        }
    }
    return false
}

function startGame(roomID,userCookieID){//谁发明的这些乱七八糟的变量名？oh,no,it's me!
    let room = null
    if(room = roomList.find((room)=>{return room.id === roomID})){
        if(room.host.cookieID === userCookieID){
            room.startGame()
            return true
        }
    }
    return false
}

function convertPath(path){//xxx:...懒得做玩家是不是在房间里的验证了，又或者本来就不该做？这是否是一种过度优化？......
    if(/^\/room\/([0-9]*)\/game\/$/.test(path)){
        path = path + '/index.html'
    }
    let roomID = parseInt(path.match(/^\/room\/([0-9]*)\/game\/(.*)/)[1])
    let reqPath = path.match(/^\/room\/([0-9]*)\/game\/(.*)/)[2]

    let tempRoom = null
    if(tempRoom = roomList.find(room => {return room.id === roomID})){
        return `${tempRoom.game.staticResourcePath}/${reqPath}`
    }
    return null
}

function tryGameService(method,path,cookieID,data){
    let user = userList.find(user =>{return user.cookieID === cookieID})
    if(user){
        if(typeof(user.currentRoomID) === 'number'){
            let room = roomList.find(room => {return room.id === user.currentRoomID})
            return room.inputHandler(method,path,user,data)
        }
    }

    return false
}

class Room{
    constructor(roomData,host,roomID){
        this.name=roomData.name
        this.status=roomData.status
        this.host=host
        this.id=roomID
        this.game = gameList.find(game => {return game.id === roomData.gameID})
        this.gameModeNum=roomData.gameModeNum
        this.customOption=roomData.customOption
        this.chat=new Chat('房间')
        this.userList=[]

        this.userJoin(host)
    }

    userJoin(user){
        this.userList.push(user)
        this.chat.userJoin(user)
        user.currentRoomID = this.id
    }

    userQuit(cookieID){
        this.userList.forEach((user,index,list) =>{
            if(user.cookieID === cookieID){
                if(list.length === 1){
                    list.pop()//fixme:WHY???为啥下面那个在只有一个人的时候没法工作???我怀疑nodejs有bug
                }
                else{
                    list.splice(index,1)
                }
                this.chat.userQuit(user)
                user.currentRoomID = null
            }
        })
        if(this.userList.length === 0){
            lobbyListener.emit('cleanRoom',this.id)
        }
    }
    
    userSetRoom(roomData,cookieID){
        if(this.host.cookieID === cookieID){
            this.name=roomData.name
            this.status=roomData.status
            this.game = gameList.find(game => {return game.id === roomData.gameID})
            this.gameModeNum=roomData.gameModeNum
            this.customOption=roomData.customOption

            return true
        }
        return false
    }

    sendChatMessage(message,senderCookieID){
        return this.chat.sendChatMessage(message,senderCookieID)
    }

    roomGameInfo(){//xxx:这里的信息可能多余了，只要有gameModeNum,一些信息可以在客户端读出来，但是自定义信息不能
        if(typeof(this.gameModeNum) === "number"){//如果这个值不是数字，说明使用的是自定义设置。
            return {
                gameName:this.game.gamePkgInfo.name,
                gameID:this.game.id,
                gameModeName:this.game.config.options[this.gameModeNum].modeName,
                maxPlayers:this.game.config.options[this.gameModeNum].maxPlayers
            }
        }
        else if(this.customOption){
            return {
                gameName:this.game.gamePkgInfo.name,
                gameID:this.game.id,
                gameModeName:"自定义",
                maxPlayers:this.customOption.maxPlayers
            }
        }
    }

    roomInfo(){
        return {
            name:this.name,
            status:this.status,
            hostName:this.host.name,
            id:this.id,
            gameInfo:this.roomGameInfo(),
            gameModeNum:this.gameModeNum,
            userNames:this.userList.map(user => user.name),
            //xxx:userNames?这好像是说这个用户有多个名字啊...吃了英语不好的亏,如果这里要改，前端也要改
        }
    }

    startGame(){
        if(this.userList.length <= this.roomGameInfo().maxPlayers){
            lobbyListener.emit('gameStart',this)
            this.chat.sendEventToEveryone('gameStart')
            this.Ggame = require(this.game.mainPath)//fixme:挖坑给自己跳啊，我就知道下面那个东西不对劲。变量名不正确。
            if(typeof(this.gameModeNum) === "number"){//如果这个值不是数字，说明使用的是自定义设置。
                this.Ggame.start(this.userList,this.game.config.options[this.gameModeNum],this)//好嘛，这回把整个房间都扔进去了，如果传下面那个gameOver函数，this指针不对
            }
            else if(this.customOption){
                this.Ggame.start(this.userList,this.customOption,this)
            }
            //fixme:可以看出来目前我们是直接把用户传进游戏逻辑里的，这样做非常非常非常不安全！！！只是暂时的权宜之计。
        }
    }

    gameOver(){
        this.Ggame = undefined
        lobbyListener.emit('gameOver',this)
        this.chat.sendEventToEveryone('gameOver')
    }

    inputHandler(method,path,user,data){
        if(this.Ggame){
            return this.Ggame.inputHandler(method,path,user,data)
        }
        else{
            return false
        }
    }
}

class Game{
    constructor(gameFileName,gamePkgInfo,gameID){
        this.gamePkgInfo = gamePkgInfo
        this.id = gameID
        this.staticResourcePath = `${gamesFilePath}/${gameFileName}/${gamePkgInfo.staticResourcePath}`
        this.mainPath = `${gamesFilePath}/${gameFileName}/${gamePkgInfo.main}`
        if(gamePkgInfo.config){
            this.config = require(`${gamesFilePath}/${gameFileName}/${gamePkgInfo.config}`)
        }
        else{
            const defaultConfig = {
                customizable:false,
                options:[
                    {
                        modeName:"Default",
                        maxPlayers:1
                    }
                ]
            }
            this.config = defaultConfig
        }
    }

    gameInfo(){
        return {
            gamePkgInfo:this.gamePkgInfo,
            id:this.id,
            config:this.config,
        }
    }
}

init()
exports.userJoinLobby = userJoinLobby
exports.sendChatMessage = sendChatMessage
exports.userCreateRoom = userCreateRoom
exports.sendRoomChatMessage = sendRoomChatMessage
exports.userJoinRoom = userJoinRoom
exports.userQuitRoom = userQuitRoom
exports.userSetRoom = userSetRoom
exports.startGame = startGame
exports.convertPath = convertPath
exports.tryGameService = tryGameService