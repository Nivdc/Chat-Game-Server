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
        let categoriesData = await readJsonFile(gameDataPath+"categories.json")

        for(let r of roleData){
            r.categories = []
            for(const c of categoriesData){
                if(c.includeRole.includes(r.name))
                    r.categories.push(c.name)
            }

            // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
            let f = r.categories.filter(c => majorFactions.has(c))
            if (f){
                r.affiliation = f.pop()
            }else{
                r.affiliation = "Neutral"
                r.categories.unshift("Neutral")
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

        function generatePlayerList(userList){
            return userList.map(user => Object.create(user))
        }
    }

    get survivingPlayerList(){
        return this.playerList.filter((p) => p.isAlive === true)
    }

    get atTrialOrExecutionStage(){
        const trialAndExecutionStatuses = ["trial", "trialDefense", "execution", "executionLastWord"]
        return trialAndExecutionStatuses.includes(this.status)
    }

    game_ws_message_router(ws, message){
        const event = JSON.parse(message)
        let player = this.playerList.find(player => {return player.uuid === ws.data.uuid})
    
        if (player !== undefined)
        switch(event.type){
            case "HostSetupGame":
                if(player.uuid === this.host.uuid && this.status === "init")
                    this.setup(event.data)
            break

            case "Rename":
                if(this.status === "begin" && this.setting.enableCustomName){
                    player.name = event.data
                }
            break

            case "LynchVote":
                if(player.isAlive && this.status === "day"){
                    if(event.data !== undefined){
                        player.lynchVoteTargetNumber = event.data
                        this.lynchVoteCheck()
                    }
                }
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

        this.dayCount = 1

        this.setStatus("begin")
    }

    // 此处有一个比较反直觉的逻辑，我思考了很久
    // 一个状态会持续多久，并不是它本身有个长度决定的，
    // 而是由下一个状态多久后会到来决定的，明白这一点很重要。
    // 当前阶段持续30秒和下一个阶段30秒后出现，其实是逻辑等价的说法。

    // 感觉从下方的代码可以抽出一个gameStage的数据对象出来...
    // 总的来看，游戏可以有以下这几个阶段：
    // begin, day/discussion, day/lyuchVote, day/trial/defense, day/trial
    // day/execution, day/execution/lastWord, night, end
    // 但是...累了累了，先搞完再说吧。

    // 我们说30秒后黑夜会到来，它真的会来吗？如来
    // 到底来没来？如来~
    setStatus(status){
        switch(status){
            case "begin":
                this.status = "begin"
                this.beginTimer = new Timer(() => this.begin(), 0.5, true)
            break
            default:
                this.status = status
            break
        }

        this.sendEventToAll("GameStatusUpdate", JSON.stringify(this))

        console.log(this.status)
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
                this.dayCycle("day/No-Lynch")
            break
        }
    }

    dayCycle(type){
        this.dayOver = false

        let dayType = type ?  type : "day"
        let length = type !== "day/No-Lynch" ? this.setting.dayLength : 0

        if(this.setting.enableDiscussion){
            length += this.setting.discussionTime
            this.setStatus("discussion")
            this.discussionTimer = new Timer(() => this.setStatus(dayType), this.setting.discussionTime, true)
        }else{
            this.setStatus(dayType)
        }

        this.dayTimer = new Timer(() => {
            this.dayOver = true
            if(!this.atTrialOrExecutionStage)
                this.nightCycle()
        }, length, true)
    }

    nightCycle(){
        this.setStatus("night")
        this.dayCount ++
        this.nightTimer = new Timer(() => this.dayCycle(), this.setting.nightLength, true)
    }

    lynchVoteCheck(){
        let voteCount = Array(15).fill(0);
        for(const p of this.survivingPlayerList){
            if(p.lynchVoteTargetNumber !== undefined)
                voteCount[p.lynchVoteTargetNumber - 1] += "voteWeight" in p ? p.voteWeight : 1
        }

        console.log(voteCount)
        for(const [index, vc] of voteCount.entries()){
            if(this.playerList[index].isAlive){
                let spll = this.survivingPlayerList.length
                let voteNeeded = spll % 2 === 0 ? ((spll / 2) + 1) : Math.ceil(spll / 2)
                if(vc >= voteNeeded){
                    if(this.setting.enableTrial){
                        this.trialCycle(this.playerList[index])
                    }else{
                        this.execution(this.playerList[index])
                    }
                }
            }
        }
    }

    execution(player){
        let executionLenght = 0.4
        this.setStatus("executionLastWord")
        this.executionLWTimer = new Timer(()=> {
            this.setStatus("execution")
        }, executionLenght/2, true)

        player.isAlive = false
        player.deathReason = "Execution"
        //todo:向所有玩家发送处决消息和玩家遗言

        this.executionTimer = new Timer(()=> {
            this.dayTimer.tick()
            this.nightCycle()
        }, executionLenght, true)

        this.victoryCheck()
    }

    victoryCheck(){
        let town_sp_l = this.querySurvivingPlayerByCategory("Town").length
        let mafia_sp_l = this.querySurvivingPlayerByCategory("Mafia").length
        
        if(town_sp_l === 0){
            this.winningFaction = "Mafia"
            this.winners = this.querySurvivingPlayerByCategory("Mafia")
        }else if(mafia_sp_l === 0){
            this.winningFaction = "Town"
            this.winners = this.querySurvivingPlayerByCategory("Town")
        }
        
        if(this.winningFaction !== undefined){        
            this.setStatus("end")
            this.clearAllTimer()
            this.endTimer = new Timer(()=> this.room.endGame(), 0.02, true)
        }
    }

    querySurvivingPlayerByCategory(categoryString){
        return this.survivingPlayerList.filter((p)=>{
            return p.role.categories.includes(categoryString)
        })
    }

    clearAllTimer(){
        for (const [key, value] of Object.entries(this)) {
            if(key.endsWith("Timer")){
                console.log(key)
                value.clear()
            }
        }

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

    get remainingTime(){
        if(this.id){
            return this.delay - (Date.now() - this.startTime)
        }else{
            return undefined
        }
    }

    start(){
        if(!this.id){
            this.startTime = Date.now()
            this.id = setTimeout(()=>{this.tick()}, this.delay)
        }
    }

    pause(){
        if(this.id){
            this.clear()
            this.delay = Date.now() - this.startTime
        }
    }

    tick(){
        this.clear()
        this.callback()
    }

    addDelay(min, go){
        this.pause()
        this.delay += 1000 * 60 * min

        if(go)
            this.start()
    }

    change(newCallback, newDelay, nowGo){
        this.pause()
        this.callback = newCallback

        if(newDelay)
            this.delay = newDelay
        
        if(nowGo)
            this.start()
    }

    clear(){
        if(this.id){
            clearTimeout(this.id)
            this.id = undefined
        }
    }
}