const gameDataPath = import.meta.dir + '/public/gameData/'
let defaultSetting = {}
let roleList = []
let majorFactions = new Set(["Town", "Mafia", "Triad", ])


await init()
async function init(){
    defaultSetting = await readJsonFile(gameDataPath+"defaultSetting.json")
    roleList = await generateRoleList()

    async function readJsonFile(path){
        return await Bun.file(path).json()
    }

    async function generateRoleList(){
        let roleList = []
        let roleData = await readJsonFile(gameDataPath+"roles.json")
        let categorieData = await readJsonFile(gameDataPath+"categories.json")

        for(let r of roleData){
            r.categorie = []
            for(const c of categorieData){
                if(c.includeRole.includes(r.name))
                    r.categorie.push(c.name)
            }

            // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
            let f = r.categorie.filter(c => majorFactions.has(c))
            if (f){
                r.affiliation = f.pop()
            }else{
                r.affiliation = "Neutral"
                r.categorie.unshift("Neutral")
            }

            roleList.push(r)
        }

        return roleList
    }
}

export function start(room){
    return new Game(room)
}

class Game{
    constructor(room){
        this.playerList = generatePlayerList(room.user_list)
        this.host = room.host
        this.room = room
        this.status = "init"

        generatePlayerList(userList){
            return userList.map(user => Object.create(user))
        }
    }

    game_ws_message_router(ws, message){
        const event = JSON.parse(message)
        let user = this.playerList.find(user => {return user.uuid === ws.data.uuid})
    
        if (user !== undefined)
        switch(event.type){
            case "GameChatMessage":
                this.sendEventToAll("GameChatMessage",{sender_name:user.name, message:event.data})
            break
            // case "IAmReady":
            //     user.send_event("GameInit",{
            //         playersNames:this.playerList.map(player => player.name),
            //     })
            // break
            case "HostSetupGame":
                if(user.uuid === this.host.uuid)
                    this.setup(event.data)
                break
            case "EndGame":
                this.room.end_game()
            break
        }
    }

    sendEventToAll(eventType, data){
        this.sendEventToGroup(this.playerList, eventType, data)
    }

    sendEventToGroup(playerGroup, eventType, data){
        playerGroup.forEach(player =>{
            player.sendEvent(eventType,data)
        })
    }

    setup(setting){
        this.setting = {...defaultSetting, ...setting}
        // todo:此处应有根据随机规则生成真正角色列表的逻辑
        shuffleArray(this.setting.roleSet)
        shuffleArray(this.playerList)
        for(let [index, p] of this.playerList.entries()){
            p.role = roleList.find( r => r.name === this.setting.roleSet[index] )
            p.isAlive = true
        }

        this.dayCycleCount = 1
        this.nightCycleCount = 1


        this.run()
    }


    // 此处有一个比较反直觉的逻辑，我思考了很久
    // 一个状态会持续多久，并不是它本身有个长度决定的，
    // 而是由下一个状态多久后会到来决定的，明白这一点很重要。
    // 当前阶段持续30秒和下一个阶段30秒后出现，其实是逻辑等价的说法。

    // 感觉从下方的代码可以抽出一个gameStage的数据对象出来...
    // 但是...累了累了，先搞完再说吧。

    // 我们说30秒后黑夜会到来，它真的会来吗？如来
    // 到底来没来？如来~
    setStatus(status){
        if(this.status !== "end")
            this.victoryCheck()

        switch(status){
            case "begin":
                this.status = "begin"
                new Timer(this.begin(), 0.5, true)
            break
            default:
                this.status = status
            break
        }
    }

    begin(){
        switch(this.setting.startAt){
            case "day":
                this.dayCycle()
            break
            case "night":
                this.nightCycle()
            break
            case "day/No-Lynch":
                this.status = "discussion"
            break
        }
    }

    dayCycle(type){
        let dayType = type !== "No-Lynch" ? "day" : "day/No-Lynch"
        let length = type !== "No-Lynch" ? this.setting.dayLength : 0

        if(this.setting.enableDiscussion){
            length += this.setting.discussionTime
            this.setStatus("discussion")
            new Timer(this.setStatus(dayType), this.setting.discussionTime, true)
        }else{
            this.setStatus(dayType)
        }

        this.dayCycleCount ++
        this.dayTimer = new Timer(this.nightCycle(), length, true)
    }

    nightCycle(){
        this.setStatus("night")
        this.nightCycleCount ++
        new Timer(this.dayCycle(), this.setting.nightLength, true)
    }

    userQuit(user){
        this.playerList.forEach((currentUser,index,list) =>{
            if(currentUser === user){
                list.splice(index,1)
            }
        })

        if(this.playerList.length === 0)
            this.room.end_game()
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

class Timer{
    constructor(callback, delayMin, go){
        this.callback = callback
        this.delay = 1000 * 60 * delayMin

        if(go)
            this.start()
    }

    start(){
        if(!this.id){
            this.startTime = Date.now()
            this.id = setTimeout(this.callback, this.delay)
        }
    }

    pause(){
        if(this.id){
            clearTimeout(id)
            this.id = undefined
            this.delay = Date.now() - this.startTime
        }
    }
}