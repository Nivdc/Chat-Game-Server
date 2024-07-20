const gameDataPath = import.meta.dir + '/public/gameData/'
let defaultSetting = {}
let roleSet = []
let majorFactions = new Set(["Town", "Mafia", "Triad", ])


await init()
async function init(){
    defaultSetting = await readJsonFile(gameDataPath+"defaultSetting.json")
    roleSet = await generateRoleSet()

    async function readJsonFile(path){
        return await Bun.file(path).json()
    }

    async function generateRoleSet(){
        let roleSet = []
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

            roleSet.push(r)
        }

        return roleSet
    }
}

export function start(room){
    return new Game(room)
}

class Game{
    constructor(room){
        this.playerList = room.user_list.map(user => new Player(user))
        this.playerList.forEach((p) => {p.setPlayerList(this.playerList)})
        this.host = this.playerList.find((p)=> p.user === room.host)
        this.room = room
        this.status = "init"

        // 异步函数的执行顺序和性能影响需要更多的观察
        class GameStage{
            constructor(game, name, durationMin){
                this.name = name
                this.controller = new AbortController()
                this.promise = new Promise((resolve, reject)=>{
                    this.timer = new Timer(resolve, durationMin, true)
                    this.controller.signal.addEventListener('abort', () => {
                        this.timer.clear()
                        reject(`GameStage:${this.name} aborted`);
                    });
                })
                game.setStatus(name)
            }

            end(){
                this.timer.tick()
            }

            abort(){
                this.controller.abort()
            }

            then(...args){
                return this.promise.then(...args)
            }

            [Symbol.asyncIterator]() {
                return (async function* () {
                    await this.promise;
                    yield;
                }).call(this);
            }
        }

        this.GameStage = GameStage
    }

    get onlinePlayerList(){
        return this.playerList.filter((p) => p.isOnline === true)
    }

    get survivingPlayerList(){
        return this.playerList.filter((p) => p.isAlive === true)
    }

    get deadPlayerList(){
        return this.playerList.filter((p) => p.isAlive === false)
    }

    get atTrialOrExecutionStage(){
        return this.status.split('/').includes("trial") || this.status.split('/').includes("execution")
    }

    game_ws_message_router(ws, message){
        const event = JSON.parse(message)
        let player = this.playerList.find(player => {return player.uuid === ws.data.uuid})
    
        if (player !== undefined){
            console.log("recive <-", event)
            switch(event.type){
                case "FrontendReady":
                    this.sendInitData(player)
                break

                case "HostSetupGame":
                    if(player.uuid === this.host.uuid && this.status === "init"){
                        this.setup(event.data)
                        this.sendEventToAll(event.type)
                    }
                break

                case "HostCancelSetup":
                    if(player.uuid === this.host.uuid && this.status === "setup"){
                        this.abortSetupStage()
                    }
                break

                case "HostChangesGameSetting":
                    if(player.uuid === this.host.uuid && this.status === "init")
                        this.sendEventToAll(event.type, event.data)
                break

                case "PlayerRename":
                    if(this.status === "begin" && this.setting.enableCustomName){
                        player.name = event.data
                    }
                break

                case "RepickHost":
                    if(player !== this.host){
                        if(event.data){
                            player.repickHostVoteTargetNumber = Number(event.data)
                            console.log(player.index, 'vote to ', player.repickHostVoteTargetNumber)
                        }
                        else{
                            player.repickHostVoteTargetNumber = -1
                        }
                        this.repickHostVoteCheck()
                    }else{
                        if(event.data)
                            // fixme:如果主机指定一个非法的playerIndex...什么都不会发生吧...大概?
                            this.repickHost(this.playerList[Number(event.data)])
                        else{
                            this.repickHost(this.getNewRandomHost())
                        }
                    }
                break

                case "ChatMessage":
                    this.sendChatMessage(player, event.data)
                break
            }

            if(player.isAlive ?? false)
            switch(event.type){
                case "LynchVote":
                    // todo:发送投票信息
                    if(this.status.split('/').includes('lynchVote')){
                        if(event.data !== undefined){
                            player.lynchVoteTargetNumber = Number(event.data)
                            this.lynchVoteCheck()
                        }
                    }
                break
                
                case "MafiaKillVote":
                    if(player.role.affiliation === "Mafia"){
                        player.mafiaKillVoteTargetNumber = Number(event.data)
                        this.mafiaKillVoteCheck()
                    }
                break

                case "UseAbility":
                        player.abilityTargetNumber = Number(event.data)
                break
            }
    
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

    sendInitData(p){
        p.sendEvent("SetHost", this.host)
        p.sendEvent("SetPlayerList", this.playerList)
    }

    async setup(setting){
        try{
            await this.newGameStage("setup", 0.25)
            console.log("start")
            this.setting = {...defaultSetting, ...setting}
            // todo:此处应有根据随机规则生成真正角色列表的逻辑
            // todo:检查玩家人数是否与角色列表匹配
            // todo:为没有自定义名字的玩家随机分配名字
            shuffleArray(this.setting.roleList)
            shuffleArray(this.playerList)
            for(let [index, p] of this.playerList.entries()){
                p.role = roleSet.find( r => r.name === this.setting.roleList[index] )
                p.isAlive = true
            }

            // todo:向每名玩家发送自己的角色
            // todo:向黑手党发送队友的信息

            // 游戏环境变量初始化...可能不全，因为js可以随时添加上去，欸嘿
            this.dayCount = 1

            this.newGameStage("begin", 0.05)
            this.gameStage.then(()=>{ this.begin() })
        }catch(e){
            if(e === "GameStage:setup aborted")
                return
        }
    }

    // 此处有一个比较反直觉的逻辑，我思考了很久
    // 一个状态会持续多久，并不是它本身有个长度决定的，
    // 而是由下一个状态多久后会到来决定的，明白这一点很重要。
    // 当前阶段持续30秒和下一个阶段30秒后出现，其实是逻辑等价的说法。

    // 感觉从下方的代码可以抽出一个gameStage的数据对象出来...
    // 总的来看，游戏可以有以下这几个阶段：
    // begin, day/deathDeclare, day/discussion, day/discussion/lynchVote, day/trial/defense, day/trial/discussion
    // day/execution/lastWord,day/execution/discussion, night/discussion, night/action, end

    // 我们说30秒后黑夜会到来，它真的会来吗？如来
    // 到底来没来？如来~

    setStatus(status){
        // console.log("Befor->",this.status)

        this.status = status
        this.sendEventToAll("GameStatusUpdate", this)

        console.log("After->",this.status)
    }

    newGameStage(name, durationMin){
        this.gameStage = new this.GameStage(this, name, durationMin)
        return this.gameStage
    }

    begin(){
        switch(this.setting.startAt.split('/')[0]){
            case "day":
                this.dayCycle()
            break
            case "night":
                this.nightCycle()
            break
        }
    }

    async dayCycle(){
        this.playerList.forEach((p) => p.resetCommonProperties())
        this.dayOver = false

        if(this.dayCount !== 1)
            await this.deathDeclare()

        await this.victoryCheck()
        if(this.status === 'end')
            return

        if(this.setting.enableDiscussion)
            await this.newGameStage("day/discussion", this.setting.discussionTime)

        // Except for the first day/No-Lynch...this is a bit counter-intuitive.
        if(this.dayCount !== 1 || this.setting.startAt !== "day/No-Lynch")
            await this.newGameStage("day/discussion/lynchVote", this.setting.dayLength)


        this.dayOver = true
        if(!this.atTrialOrExecutionStage)
            this.nightCycle()
    }

    async deathDeclare(){
        // todo:没啥特别的...就是把最近死掉的人的信息发送出去（然后等待动画播放完成...会有动画的吧？大概？
    }

    async nightCycle(){
        this.nightActionSequence = []
        this.recentlyDeadPlayers = []

        await this.newGameStage("night/discussion", this.setting.nightLength)

        this.dayCount ++
        this.nightAction()
    }

    nightAction(){
        this.setStatus("night/action")

        this.generatePlayerAction()

        this.nightActionSequence.sort(actionSequencing)

        this.nightActionProcess()

        function actionSequencing(a,b){
            const priorityOfActions = {
                "MafiaKill":10,
                "SheriffCheck":20,
                "DoctorProtect":89,
            }

            return priorityOfActions[a.name] - priorityOfActions[b.name]
        }
    }

    generatePlayerAction(){
        // MafiaKill
        if(this.mafiaKillTargets ?? false){
            let realTarget = getRandomElement(this.mafiaKillTargets)
            let realKiller = getMafiaKiller()
            this.nightActionSequence.push({type:"MafiaKill", origin:realKiller, target:this.mafiaKillTargets})
            this.mafiaKillTargets = undefined
        }

        // SoloPlayer
        for(const p of this.playerList){
            if(p.abilityTargetNumber !== undefined){
                let targetPlayrerIndex = p.abilityTargetNumber - 1
                let targetPlayer = this.playerList[targetPlayrerIndex]
                let actionType = undefined

                switch(p.role.name){
                    case "Sheriff":
                        actionType = "SheriffCheck"
                    break
                    case "Doctor":
                        actionType = "DoctorHeal"
                    break
                }

                if(actionType ?? false)
                    nightActionSequence.push({type:actionType, origin:p, target:targetPlayer})
            }
        }
    }

    nightActionProcess(){
        let attackCount = Array(this.playerList.length).fill(0)
        let healCount   = Array(this.playerList.length).fill(0)

        if(this.nightActionSequence.length === 0){
            this.dayCycle()
            return
        }

        let a = this.nightActionSequence.shift()
        switch(a.type){
            case "MafiaKill":
                attackCount[a.target.index] ++
                // todo: 发送提示
            break

            case "SheriffCheck":
                // todo: 没啥特别的...就是发送消息去就好
            break

            case "DoctorHeal":
                healCount[a.target.index] ++
                // todo: 发送提示
            break
        }

        for(let p of this.playerList){
            let idx = p.index
            if(p.isAlive){
                if(attackCount[idx] > healCount[idx]){
                    p.isAlive = false
                    this.recentlyDeadPlayers.push(p)
                }
            }
        }
        
    }

    // addNightAction(type, args){
    //     let existedEvents = this.nightActionSequence.filter((a) => a.type === type)

    //     switch(type){
    //         case "MafiaKill":
    //             if(existedEvents.length === 1) 
    //                 this.nightActionSequence.splice(this.nightActionSequence.indexOf(existedEvents.pop()), 1)
    //             this.nightActionSequence.push({type, target:args.target})
    //         break
    //     }
    // }

    abortSetupStage(){
        if(this.gameStage?.name === "setup"){
            this.gameStage.abort()
            this.gameStage = undefined
            this.status = "init"
            this.sendEventToAll("HostCancelSetup")
        }
    }

    sendChatMessage(sender, data){
        let targetGroup = undefined

        if(this.status === "init" || this.status === "setup" || this.status === "end")
            targetGroup = this.onlinePlayerList
        else{
            if(sender.isAlive === true){
                if(this.status.startsWith("day") && this.status.split('/').includes("discussion")){
                    targetGroup = this.survivingPlayerList
                }else if(this.status.startsWith("night") && this.status.split('/').includes("discussion")){
                    if(sender.role.affiliation === "Mafia")
                        targetGroup = this.querySurvivingPlayerByCategory(sender.role.affiliation)
                }
            }else{
                targetGroup = this.deadPlayerList
            }
        }

        this.sendEventToGroup(targetGroup, "ChatMessage", {senderName:sender.name, message:data})
    }

    lynchVoteCheck(){
        let spll = this.survivingPlayerList.length
        const voteNeeded = spll % 2 === 0 ? ((spll / 2) + 1) : Math.ceil(spll / 2)
        let lynchTarget = this.voteCheck('LynchVote', this.survivingPlayerList, this.survivingPlayerList, voteNeeded)
        if(lynchTarget !== undefined){
            if(this.setting.enableTrial){
                this.trialCycle(lynchTarget)
            }else{
                this.execution(lynchTarget)
            }
        }

    }

    mafiaKillVoteCheck(){
        // Note that when a tie vote occurs, there can be multiple targets
        let killTargets = this.voteCheck('MafiaKillVote', this.querySurvivingPlayerByCategory('Mafia'), this.survivingPlayerList)
        this.mafiaKillTargets = killTargets
        // todo:发往客户端的提示信息
    }

    // 首先检查是否有一半的玩家投票重选主机，如果有，随机选择一个主机
    // 其次检查是否有一半的玩家都投票给某个特别的玩家，如果有，选择他为主机
    repickHostVoteCheck(){
        let opll = this.onlinePlayerList.length
        // 尚且不确定哪种人数要求更好，一种不含半数，另一种含半数
        // const voteNeeded = opll % 2 === 0 ? ((opll / 2) + 1) : Math.ceil(opll / 2)
        const voteNeeded = Math.ceil(opll / 2)

        const votedPlayerNumber = this.playerList.filter(p => p.repickHostVoteTargetNumber !== undefined ).length
        if(votedPlayerNumber >= voteNeeded){
            var randomHost = this.getNewRandomHost()
        }

        // 为接下来的检测排除干扰项
        this.playerList.filter(p => p.repickHostVoteTargetNumber === -1).forEach(p => p.repickHostVoteTargetNumber = undefined)

        let specificHost = this.voteCheck('RepickHostVote', this.onlinePlayerList, this.onlinePlayerList, voteNeeded)

        if(specificHost !== undefined)
            this.repickHost(specificHost)
        else if(randomHost !== undefined)
            this.repickHost(randomHost)
    }

    getNewRandomHost(){
        do{
            var randomHost = getRandomElement(this.onlinePlayerList)
        }while(randomHost === this.host && this.onlinePlayerList.length > 1)

        return randomHost
    }

    repickHost(newHost){
        if(newHost?.isOnline){
            this.host = newHost
            this.sendEventToAll("SetHost", this.host)
            this.abortSetupStage()
            this.onlinePlayerList.forEach(p => p.repickHostVoteTargetNumber = undefined)
        }
    }

    voteCheck(voteType, checkPlayers, voteTargets, voteNeeded){
        voteType = voteType.charAt(0).toLowerCase() + voteType.slice(1)
        let voteCount = Array(this.playerList.length).fill(0)
        for(const p of checkPlayers){
            if(p[`${voteType}TargetNumber`] !== undefined){
                voteCount[p[`${voteType}TargetNumber`] - 1] += `${voteType}Weight` in p ? p[`${voteType}Weight`] : 1
                console.log('vt', voteType, `${p.index}vt`, p[`${voteType}TargetNumber`] - 1)
            }
        }

        for(const player of this.playerList){
            if(voteTargets.includes(player) === false){
                voteCount[player.index] = 0
            }
        }

        // 如果定义了最小票数，达到最小票数的玩家对象将被返回(lynchVote)
        // 否则得票最高的玩家将被返回，可以返回多个(MafiaKillVote)
        if(voteNeeded !== undefined){
            for(const [index, vc] of voteCount.entries()){
                console.log(vc)
                if(vc >= voteNeeded){
                    return this.playerList[index]
                }
            }
            return undefined
        }else{
            let voteMax = Math.max(voteCount)
            let voteMaxIndexArray = voteCount.map((vc, idx) => {
                if(vc === voteMax)
                    return idx
            })
            return voteMaxIndexArray.map((idx) => this.playerList[idx])
        }
    }

    async execution(player){
        let executionLenght = 0.4

        // "day" stage end
        this.gameStage.end()
        await this.newGameStage("day/execution/lastWord", executionLenght/2)
        player.isAlive = false
        player.deathReason = "Execution"

        //todo:向所有玩家发送处决消息和玩家遗言

        await this.newGameStage("day/execution/discussion", executionLenght/2)
        await this.victoryCheck()

        if(this.status !== "end")
            this.nightCycle()
    }

    async victoryCheck(){
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
            await this.newGameStage("end", 0.02)
            this.room.endGame()
        }
    }

    querySurvivingPlayerByCategory(categoryString){
        return this.survivingPlayerList.filter((p)=>{
            return p.role.categories.includes(categoryString)
        })
    }

    querySurvivingPlayerByRoleName(roleName){
        return this.survivingPlayerList.filter((p)=>{
            return p.role.name === roleName
        })
    }

    // clearAllTimer(){
    //     for (const [key, value] of Object.entries(this)) {
    //         if(key.endsWith("Timer")){
    //             value.clear()
    //         }
    //     }
    // }

    userQuit(user){
        this.playerList.forEach((currentPlayer,index,list) =>{
            if(currentPlayer.user === user){
                currentPlayer.user = undefined
            }
        })

        // fixme: host quit, no one can setup game
        if(user === this.host.user)
            this.repickHost(this.getNewRandomHost())

    }
}

function getRandomElement(arr){
    const randomIndex = Math.floor(Math.random() * arr.length)
    return arr[randomIndex]
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

class Player{
    constructor(user){
        this.user = user
    }

    get uuid(){
        return this.user?.uuid
    }

    get name(){
        return this.nickname !== undefined ? this.nickname : 
            this.user !== undefined ? this.user.name : "OfflinePlayer"
    }

    set name(name){
        this.nickname = name
    }

    get index(){
        return this.playerList.indexOf(this)
    }

    get isOnline(){
        return this.user === undefined ? false : true
    }

    setPlayerList(playerList){
        this.playerList = playerList
    }

    sendEvent(eventType, data){
        if(this.user !== undefined)
            this.user.sendEvent(eventType, data)
    }

    resetCommonProperties(){
        // this.lynchVoteTargetNumber = undefined
        for (const key of Object.keys(this)) {
            if(key.endsWith("TargetNumber"))
                this[key] = undefined
        }
    }

    // toJSON_self(){
    //     return {
    //         name: this.name,
    //         affiliation: this.affiliation, 
    //         roleName: this.roleName
    //     }
    // }

    toJSON(){
        return {
            name: this.name,
            index:this.index,
        }
    }
}

class Timer{
    constructor(callback, delayMin, go){
        this.callback = callback
        this.delay = 1000 * 60 * delayMin

        if(go)
            this.start()
    }

    // get remainingTime(){
    //     if(this.id){
    //         return this.delay - (Date.now() - this.startTime)
    //     }else{
    //         return undefined
    //     }
    // }

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

    // addDelay(min, go){
    //     this.pause()
    //     this.delay += 1000 * 60 * min

    //     if(go)
    //         this.start()
    // }

    // change(newCallback, newDelay, nowGo){
    //     this.pause()
    //     this.callback = newCallback

    //     if(newDelay)
    //         this.delay = newDelay
        
    //     if(nowGo)
    //         this.start()
    // }

    clear(){
        if(this.id){
            clearTimeout(this.id)
            this.id = undefined
        }
    }
}