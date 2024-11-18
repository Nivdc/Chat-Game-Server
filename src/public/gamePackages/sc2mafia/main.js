import { originalGameData, Vote, Faction, Team, Role, getRoleTags } from "./gameData.js"
import { getRandomElement } from "./utils.js"

const gameDataPath = import.meta.dir + '/public/gameData/'
let defaultSetting = await readJsonFile(gameDataPath+"defaultSetting.json")

async function readJsonFile(path){
    return await Bun.file(path).json()
}

export function start(room){
    return new Game(room)
}

class Game{
    constructor(room){
        this.playerList = room.user_list.map(user => new Player(user, this))
        this.host = this.playerList.find(p => p.user === room.host)
        this.room = room
        this.status = "init"

        this.voteSet = originalGameData.votes.map(v => new Vote(this, v))

        this.sendEventToAll('BackendReady')

        // 异步函数的执行顺序和性能影响需要更多的观察
        class GameStage{
            constructor(game, name, durationMin){
                this.game = game
                this.name = name
                this.controller = new AbortController()
                this.promise = new Promise((resolve, reject)=>{
                    this.timer = new Timer(resolve, durationMin, true)
                    this.controller.signal.addEventListener('abort', () => {
                        this.timer.clear()
                        reject
                    })
                })
                this.game.setStatus(this.name)
            }

            pause(){
                this.timer.pause()
            }

            start(){
                this.game.setStatus(this.name)
                this.timer.start()
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

    get alivePlayerList(){
        return this.playerList.filter((p) => p.isAlive === true)
    }

    get deadPlayerList(){
        return this.playerList.filter((p) => p.isAlive === false)
    }

    get atTrialOrExecutionStage(){
        return this.status.split('/').includes("trial") || this.status.split('/').includes("execution")
    }

    get notStartedYet(){
        return this.status === "init" || this.status === "setup"
    }

    game_ws_message_router(ws, message){
        const event = JSON.parse(message)
        const player = this.playerList.find(player => {return player.uuid === ws.data.uuid})

        if (player !== undefined){
            console.log(`recive pidx: ${player.index}  <-`, event)
            switch(event.type){
                case "FrontendReady":
                    if(player.isReady !== true)
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
                        this.sendEventToAll(event.type, {player, newName:event.data})
                        player.name = event.data
                    }
                break

                case "RepickHost":
                    if(['init', 'setup'].includes(this.status)){
                        this.sendEventToAll(event.type, {player, targetIndex:(Number(event.data))})
                        if(player !== this.host){
                            if(event.data){
                                player.repickHostVoteTargetIndex = Number(event.data)
                            }
                            else{
                                player.repickHostVoteTargetIndex = -1
                            }
                            this.repickHostVoteCheck()
                        }else{
                            if(event.data)
                                this.repickHost(this.playerList[(Number(event.data))])
                            else{
                                this.repickHost(this.getNewRandomHost())
                            }
                        }
                    }
                break

                case "ChatMessage":
                    this.sendChatMessage(player, event.data)
                break

                case "AnimationsFinished":
                    player.animationsFinished = true
                    this.gameDirector.CheckAllPlayersAnimationsFinished()
                break
            }

            // 仔细观察活着的玩家在游戏流程中的几种行为，我认为可以分为以下几类：
            // 1.公开投票，例如lynchVote
            // 2.团队投票，例如MafiaKillVote
            // 3.使用技能
            // 4.其他，例如聊天、设置遗言

            // 最后一类并不复杂，我们暂时忽略，而为前几类行为进行编程的难点在于，它们有很相似的行为，却又略有不同。

            //                                                                            ┌──► Immediately change the game state
            // PublicVote ─┐                                ┌─ Public vote result check ──┘                                     
            //   TeamVote ─┼► Input parameter verification ─┼─ Team   vote result check ────► Set Team ability targets ──┐    
            // UseAbility ─┘                                └───────────────────────────────► Set Role ability targets ──┤    
            //                                                                                                           │    
            //                                                                                                 (At Night)│    
            //                                                                              Generate actions ◄───────────┘     

            // 我们可以将这三种行为抽象出来，并且单独编程每个行为的验证函数，但是这里有个小问题，
            // TeamVote可以由Team对象验证，UseAbility可以由Role对象验证，但是PublicVote该由谁来验证呢？

            // 要回答这个问题，我们必须要仔细思考一下现实中的黑手党（狼人杀）是怎么玩的，
            // 当我们在线下与朋友们一起玩这类游戏的时候，如果你说：“我要投票审判12号玩家。”
            // 是由谁来确认你的这个投票是有效的呢？答案很简单，是游戏的主持人。

            // 因此，PublicVote应该由SystemHost来验证。
            // 而出于某些原因，在这个程序中，我会将SystemHost称之为GameDirector。


            // 一旦我们引入了这个GameDirector，我就不得不说明一下这个设计思路了
            // 简单来说就是，线下游戏中我们需要某个玩家来当主持人，而在线上游戏中，我们通过编程这个主持人的行为来实现更优的游戏流程
            // 而一旦我们深究这个思路，就会发现在本项目中存在一个与该思路不符的设计: class GameStage
            // game对象（也就是这个特别大的对象）可以继续持有各项游戏数据（也理应如此），
            // 但是游戏阶段的控制理应转交给GameDirector决定才对，
            // 或者换句话说，game应该仅持有游戏数据，而所有的驱动逻辑都该转移到GameDirector中
            // 我们有理由认为此处有可能存在一个更好的设计。

            // ...然而这意味着目前项目中的很多代码都要重写，顺便还要承认我自己之前写了很多废代码...
            // 既然现有的游戏流程还是可以满足需求的...那就暂且先放放？

            if(player.isAlive ?? false){
                switch(event.type){
                    case "LynchVote":
                    case "TrialVote":
                        this.gameDirector.playerVote(event.type, player, event.data)
                    break
                    case "LynchVoteCancel":
                    case "TrialVoteCancel":
                        let voteType = event.type.slice(0, event.type.indexOf('Cancel'))
                        this.gameDirector.playerVoteCancel(voteType, player)
                    break
                    case "TeamVote":
                        player.team.playerVote(event.data)
                    break
                    case "TeamVoteCancel":
                        player.team.playerVoteCancel(event.data)
                    break

                    case "UseAbility":
                        player.role.useAblity(event.data)
                    break
                    case "UseAbilityCancel":
                        player.role.useAblityCancel(event.data)
                    break

                    case 'SetLastWill':
                        if(this.setting.enableLastWill){
                            player.lastWill = event.data
                            player.sendEvent("SetLastWill", player.lastWill)
                        }
                    break
                    case 'SetKillerMessage':
                        if(this.setting.enableLastWill){
                            player.killerMessage = event.data
                            player.sendEvent("SetKillerMessage", player.killerMessage)
                        }
                    break
                    case 'PrivateMessage':
                        // fixme: 后端的检测不是很严谨，动画阶段也能发送私信
                        if(this.setting.enablePrivateMessage){
                            const data = event.data
                            const target  = this.playerList[data.targetIndex]
                            if(target.isAlive){
                                this.sendEventToGroup(this.onlinePlayerList.filter(p => p !== target), 'PrivateMessage-PublicNotice', {senderIndex:player.index, targetIndex:target.index})
                                target.sendEvent('PrivateMessage-Receiver', {senderIndex:player.index, message:data.message})
                            }
                        }
                    break
                    case 'Suicide':
                        // fixme: 我发现这个地方有一个问题，玩家有可能可以通过反复的使用自杀指令来判断自己是不是被小丑亡语选中为自杀对象了
                        // ...我们先不要想太多，等小丑角色做出来再说吧。
                        // if((this.dayCount ?? 0) >= 3)
                        if(player.hasEffect('Suicide') === false){
                            player.addEffect('Suicide')
                            player.sendEvent('YouDecidedToCommitSuicide')
                        }
                        else{
                            player.removeEffect('Suicide')
                            player.sendEvent('YouGiveUpSuicide')
                        }

                    break
                }
            }
        }
    }

    sendEventToAll(eventType, data){
        this.sendEventToGroup(this.playerList, eventType, data)
    }

    sendEventToGroup(playerGroup, eventType, data){
        if(playerGroup !== undefined)
            playerGroup.forEach(player =>{
                player.sendEvent(eventType,data)
            })
    }

    sendInitData(p){
        // todo: 以下数据也许可以整合到一起发送以提高压缩率。
        p.sendEvent("SetPlayerList", this.playerList)
        p.sendEvent("SetPlayerSelfIndex", p.index)
        p.sendEvent("SetHost", this.host)
        p.sendEvent("SetStatus", this.status)
        p.sendEvent("SetDayCount", this.dayCount ?? 1)
        p.sendEvent("SetFactionSet", originalGameData.factions)
        p.sendEvent("SetTagSet", originalGameData.tags)
        p.sendEvent("SetRoleSet", originalGameData.roles)
        p.sendEvent("InitCompleted")

        p.isReady = true
        // 如果我们将下面这个消息发送给没有准备好的玩家，就会因为ws协议保证消息收发的顺序性
        // 它会先于上面所有事件接收到，于是因为没有准备好的玩家没有接收到SetPlayerList事件，导致前端错误
        this.sendEventToGroup(this.playerList.filter(p => p.isReady),"SetReadyPlayerIndexList", this.playerList.filter(p => p.isReady).map(p => p.index))
    }

    // 如果这个游戏继续发展下去，一个role应该附带三个信息{name, fation, team}
    // 也就是名称、阵营、团队，尽管团队数据储存在角色数据中，但它实际上和玩家的角色无关
    // 也就是说玩家处于哪个团队，与它的角色无关，是可以配置的
    // 但是有些角色会有默认的团队，如果没有特别配置，那这个角色的玩家就会处于默认的团队
    // 这是未来的计划，目前还没实现
    async setup(setting){
        await this.newGameStage("setup", 0.025)
        this.setting = {...defaultSetting, ...setting}
        await this.newGameStage("begin", 0.05)
        let {realRoleNameList, possibleRoleSet} = this.processRandomRole(this.setting.roleList)
        this.sendEventToAll("SetPossibleRoleSet", possibleRoleSet)
        // todo:检查玩家人数是否与角色列表匹配
        // todo:为没有自定义名字的玩家随机分配名字
        shuffleArray(realRoleNameList)
        shuffleArray(this.playerList)
        this.sendEventToAll("SetPlayerList", this.playerList)
        for(let [index, p] of this.playerList.entries()){
            const playerRoleName = realRoleNameList[index]
            const playerRoleData = {name:playerRoleName}
            p.setRole(playerRoleData)
            p.isAlive = true

            p.sendEvent("SetPlayerSelfIndex", p.index)
        }

        this.factionSetInit()
        this.teamSetInit()
        this.gameDirectorInit()

        this.dayCount = 1

        await this.newGameStage("animation/begin", 0.1)
        this.begin()
    }

    // 死去的概率论在攻击我，还是得靠GPT，G老师救场
    processRandomRole(roleListData){
        let realRoleNameList = roleListData.map((r) => {
            if(typeof(r) === 'string'){
                return r
            }else{
                const roleNameLowerCase = r.name.charAt(0).toLowerCase() + r.name.slice(1)
                const modifyObject = this.setting.roleModifyOptions[roleNameLowerCase]
                if(modifyObject !== undefined){
                    for(const keyName of Object.keys(modifyObject)){
                        if(keyName.startsWith('excludeTag')){
                            const excludeTagName = keyName.split('excludeTag')[1]
                            r.possibleRoleSet = r.possibleRoleSet.filter(prd => {
                                const roleTags = getRoleTags(prd.name)
                                return roleTags.includes(excludeTagName) === false
                            })
                        }
                        else if(keyName.startsWith('excludeRole')){
                            const excludeRoleName = keyName.split('excludeRole')[1]
                            r.possibleRoleSet = r.possibleRoleSet.filter(prd => prd.name !== excludeRoleName)
                        }
                    }
                }

                return weightedRandom(r.possibleRoleSet)
            }
        })

        const fixedRoleNameList       = roleListData.filter(r => typeof(r) === 'string')
        const fixedRoleNameSet        = new Set(fixedRoleNameList)
        const randomObjectList        = roleListData.filter(r => r.name?.endsWith('Random'))
        const possibleRoleNameList    = randomObjectList.map(ro => ro.possibleRoleSet.map(pr => pr.name)).flat(Infinity)
        const possibleRoleNameSet     = new Set(possibleRoleNameList)

        let possibleRoleArray = []
        for(const possibleRoleName of possibleRoleNameSet){
            let totalExpectation = 0
            let totalProbability_NotCurrentRole = 1

            for(const randomObject of randomObjectList){
                const currentRandomProbability = calculateProbability(possibleRoleName, randomObject.possibleRoleSet)
                const currentRandomExpectation = currentRandomProbability
                totalExpectation += currentRandomExpectation

                const probability_NotCurrentRole = 1 - currentRandomProbability
                totalProbability_NotCurrentRole *= probability_NotCurrentRole
            }

            const totalProbability = 1 - totalProbability_NotCurrentRole

            let possibleRoleData = {name:possibleRoleName, expectation:Number(totalExpectation.toFixed(3)), probability:Number(totalProbability.toFixed(3))}
            possibleRoleArray.push(possibleRoleData)
        }

        for(const fixedRoleName of fixedRoleNameSet){
            if(possibleRoleNameSet.has(fixedRoleName)){
                let prd = possibleRoleArray.find(pr => pr.name === fixedRoleName)
                prd.expectation = Number(prd.expectation) + fixedRoleNameList.filter(rn => rn === fixedRoleName).length
                prd.probability = 1
            }else{
                possibleRoleArray.push({name:fixedRoleName, expectation:fixedRoleNameList.filter(rn => rn === fixedRoleName).length, probability:1})
            }
        }

        return {realRoleNameList, possibleRoleSet:possibleRoleArray}
    }

    factionSetInit(){
        this.factionSet = []

        for(const p of this.playerList){
            if(p.role.affiliationName !== undefined){
                const faction = this.factionSet.find(f => f.name === p.role.affiliationName)
                if(faction !== undefined)
                    p.setFaction(faction)
                else{
                    const newFaction = new Faction(this, p.role.affiliationName)
                    this.factionSet.push(newFaction)
                    p.setFaction(newFaction)

                }
            }
        }
    }

    
    // 目前的实现是Team的name同时具有着name和type的作用，且同一个faction下不会创建同名的team，
    // 不过我们的游戏实际上可以支持创建不同name，但相同type的team，也就是说黑手党faction可以有两个AttackTeam
    teamSetInit(){
        this.teamSet = []

        for(const p of this.playerList){
            if(p.role.teamName !== undefined){
                const team = this.teamSet.find(t => t.affiliationName === p.role.affiliationName && t.name === p.role.teamName)
                if(team !== undefined)
                    p.setTeam(team)
                else{
                    const newTeam = new Team(this, p.role.affiliationName, p.role.teamName)
                    this.teamSet.push(newTeam)
                    p.setTeam(newTeam)
                }
            }
        }

        for(const t of this.teamSet){
            t.sendEventToAliveMember("SetTeam", t)
        }
    }

    gameDirectorInit(){
        const game = this

        this.gameDirector = {
            async playerVote(type, voter, data){
                const vote = game.voteSet.find(v => v.name === type)
                const voterIndex = voter.index
                const voteData = data
                // const targetIndex = Number(data)
                const {success, previousVoteData, voteCount} = vote.playerVote(voterIndex, voteData)
                if(success){
                    if(type === 'LynchVote'){
                        game.sendEventToAll(type, {voterIndex, targetIndex:voteData, previousTargetIndex:previousVoteData})
                        game.sendEventToAll(`SetLynchVoteCount`, voteCount)
                        const resultIndex = vote.getResult()
                        if(resultIndex !== undefined){
                            const lynchTarget = game.playerList[resultIndex]
                            // game.sendEventToAll("SetLynchTarget", lynchTarget)
                            if(game.setting.enableTrial){
                                if(game.setting.pauseDayTimerDuringTrial === true){
                                    this.tempDayStageCache = game.gameStage
                                    this.tempDayStageCache.pause()
                                }
                                await game.trialCycle(lynchTarget)
                                const {trialTargetIsGuilty, voteRecord} = this.checkTrialVoteResult()
                                game.sendEventToAll("SetTrialVoteRecord", voteRecord)
                                if(trialTargetIsGuilty){
                                    game.execution(lynchTarget)
                                }
                                else{
                                    if(game.setting.pauseDayTimerDuringTrial === true && this.tempDayStageCache !== undefined ){
                                        game.gameStage = this.tempDayStageCache
                                        game.gameStage.start()
                                        this.tempDayStageCache = undefined
                                    }
                                    else if(game.setting.pauseDayTimerDuringTrial === false && game.dayOver === true){
                                        game.nightCycle()
                                    }
                                    else if(game.setting.pauseDayTimerDuringTrial === false && game.dayOver === false){
                                        game.setStatus("day/discussion/lynchVote")
                                    }
                                }
                                game.trialTarget = undefined
                            }
                            else{
                                game.execution(lynchTarget)
                            }

                            // 如果投票有了结果就可以将记录清零了
                            vote.resetRecord()
                            game.sendEventToAll(`SetLynchVoteCount`, Array(game.playerList.length).fill(0))
                        }
                    // }else if(type === 'SkipVote'){
                    //     game.sendEventToAll(type, {voterIndex, voteData, previousVoteData})
                    }else if(type === 'TrialVote'){
                        game.sendEventToAll(type, {voterIndex})
                    }
                }
            },
            playerVoteCancel(type, voter){
                const vote = game.voteSet.find(v => v.name === type)
                const voterIndex = voter.index
                const {success, previousTargetIndex, voteCount} = vote.playerVoteCancel(voterIndex)
                if(success){

                    if(type === 'LynchVote'){
                        game.sendEventToAll(type+'Cancel', {voterIndex, previousTargetIndex})
                        game.sendEventToAll(`SetLynchVoteCount`, voteCount)
                    }else if(type === 'TrialVote'){
                        game.sendEventToAll(type+'Cancel', {voterIndex})
                    }
                }
            },
            checkTrialVoteResult(){
                const trialVote = game.voteSet.find(v => v.name === 'TrialVote')
                const record = trialVote.record.slice()
                const result = trialVote.getResult()
                trialVote.resetRecord()
                return  {trialTargetIsGuilty:result, voteRecord:record}
            },
            // resetAllPublicVote(){
            //     game.voteSet.forEach(v => v.resetRecord())
            // }

            CheckAllPlayersAnimationsFinished(){
                const allPlayersAnimationsFinished = game.onlinePlayerList.map(p => p.animationsFinished).every(value => value)
                if(allPlayersAnimationsFinished && game.status === 'animation/actions'){
                    game.gameStage.abort()
                    game.setStatus('animation/actions/last12Sec')
                    setTimeout(() => {
                        game.dayCycle()
                    }, 1000 * 12)
                }
            }
        }
    }

    // 此处有一个比较反直觉的逻辑，我思考了很久
    // 一个状态会持续多久，并不是它本身有个长度决定的，
    // 而是由下一个状态多久后会到来决定的，明白这一点很重要。
    // 当前阶段持续30秒和下一个阶段30秒后出现，其实是逻辑等价的说法。

    // 感觉从下方的代码可以抽出一个gameStage的数据对象出来...
    // 总的来看，游戏可以有以下这几个阶段：
    // begin, day/deathDeclare（animation）, day/discussion, day/discussion/lynchVote, 
    // day/trial/defense, day/discussion/trial/trialVote
    // day/execution/lastWord, day/execution/discussion, night/discussion, night/action（animation）, end
    // 除此之外，还有两个不在游戏循环内的阶段：
    // init, setup
    // 前端可能会播放动画，因此后端要等待动画播放完毕还有一个阶段：
    // animation

    // 我们说30秒后黑夜会到来，它真的会来吗？如来
    // 到底来没来？如来~

    setStatus(status){
        // console.log("Befor->",this.status)

        this.status = status
        this.sendEventToAll("SetStatus", this.status)

        console.log("SetStatus->",this.status)
    }

    newGameStage(name, durationMin){
        if(this.onlinePlayerList === 0 || this.status === 'end')
            return

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

        this.teamSet.forEach(t => t.checkTeamHasActionExecutor())

        if(this.dayCount !== 1){
            await this.newGameStage("animation/actionToDay", 0.1)
            await this.deathDeclare()
        }

        await this.victoryCheck()
        if(this.status === 'end')
            return

        if(this.setting.enableDiscussion)
            await this.newGameStage("day/discussion", this.setting.discussionTime)

        // 如果是第一天，就判断是否以白天/无处刑开局，如果不是，那就执行...有点绕
        // Except for the first day/No-Lynch...this is a bit counter-intuitive.
        if(this.dayCount !== 1 || this.setting.startAt !== "day/No-Lynch"){
            this.sendEventToAll(`SetLynchVoteCount`, Array(this.playerList.length).fill(0))
            await this.newGameStage("day/discussion/lynchVote", this.setting.dayLength)

            // 此处无论审判（处刑）投票是否有结果，都将记录清零
            const lynchVote = this.voteSet.find(v => v.name === 'LynchVote')
            lynchVote.resetRecord()
            this.sendEventToAll(`SetLynchVoteCount`, Array(this.playerList.length).fill(0))
        }


        this.dayOver = true
        if(!this.atTrialOrExecutionStage)
            this.nightCycle()
    }

    async deathDeclare(){
        if(this.recentlyDeadPlayers?.length > 0){
            this.sendEventToAll('SetRecentlyDeadPlayers', this.recentlyDeadPlayers.map(p => this.getPlayerDeathDeclearData(p)))
            await this.newGameStage("animation/daily/deathDeclear", 0.05 + (this.recentlyDeadPlayers.length * 0.1))
        }
    }

    async nightCycle(){
        // if(this.nightActionLog === undefined)
        //     this.nightActionLog = []
        this.nightActionSequence = []
        this.recentlyDeadPlayers = []

        // 如果是第一天，就判断是否以夜晚开局，如果不是，那就执行。
        if(this.dayCount !== 1 || this.setting.startAt !== "night")
            await this.newGameStage("animation/dayToNight", 0.1)
        await this.newGameStage("night/discussion", this.setting.nightLength)

        this.dayCount ++
        this.sendEventToAll("SetDayCount", this.dayCount ?? 1)
        await this.newGameStage("animation/nightToAction", 0.1)
        await this.nightAction()
        this.dayCycle()
    }

    async nightAction(){
        // this.setStatus("action")

        this.generatePlayerAction()
        // this.nightActionSequence.sort(actionSequencing)
        this.nightActionAndEffectProcess()

        // 此处前端已经收到了所有事件通知，等待下面这个阶段出现就会播放动画队列
        // 而这里就有一个后端究竟要等多久的问题，理想情况下，它应该等待无限久，直到所有人的所有前端动画都播放完
        // 目前的设计是后端会固定等待30秒，在这30秒内如果所有人的动画都播完了，就只需等待12秒
        await this.newGameStage("animation/actions", 0.5)

        // 注意这个排序过程，目前游戏中没有太多技能，所以它没什么用
        // 目前行动的执行顺序是根据玩家行动的生成顺序，也就是他在alivePlayerList中的排序决定的，也就是index小，楼层低的玩家先执行
        // 但是如果我们引入这个排序，则同一个行动将能够随机顺序执行
        // function actionSequencing(a,b){
        //     const priorityOfActions = {
        //         "Attack":9,
        //         "Heal":19,
        //         "Detect":21,
        //     }

        //     return priorityOfActions[a.type] - priorityOfActions[b.type]
        // }
    }

    // generatePlayerAction
    // 它的主要作用是为了防止反复变动造成复杂的修改
    // 试想如果一个党徒决定在晚上杀死1号玩家，但是过了会儿他又改成2号
    // 如果我们不引入一个生成过程，就得要对夜晚的行动队列进行反复修改
    generatePlayerAction(){
        for(const t of this.teamSet){
            this.nightActionSequence.push(...t.generateNightActions())
        }

        for(const p of this.alivePlayerList){
            this.nightActionSequence.push(...p.generateNightActions())
        }
    }

    // 每个action都至少包含三个数据: origin/行动者, target/对象, name/名称
    // 有些action还会包含type/类型，目前用到的只有两个类Attack和Protect
    nightActionAndEffectProcess(){
        this.nightActionSequence.forEach(a => sendActionEvent(a.origin, 'YouTakeAction', {actionName:a.name, targetIndex:a.target.index}))

        // RoleBlock
        const blockActions = filterAndRemove(this.nightActionSequence, a => a.name === 'RoleBlock')
        blockActions.forEach(a => {
            if(a.origin.hasEffect('RoleBlocked') === false){
                if(a.target.role.modifyObject?.['fightBackAgainstRoleBlocker']){
                    console.log(this.nightActionSequence)
                    this.nightActionSequence = this.nightActionSequence.filter(na => na.origin !== a.target)
                    this.nightActionSequence.push({name:'Attack', type:'Attack', origin:a.target, target:a.origin})
                    console.log(this.nightActionSequence)

                    sendActionEvent(a.target, 'SomeoneIsTryingToDoSomethingToYou', {actionName:a.name})
                }
                else if(a.target.hasEffect('ImmuneToRoleBlock') === false){
                    a.target.addEffect('RoleBlocked', 1)
                    sendActionEvent(a.target, 'YourRoleIsBlocked')
                }
                else{
                    if(a.origin.role.modifyObject?.['knowsIfTargetHasEffect_ImmuneToRoleBlock']){
                        sendActionEvent(a.origin, 'YourTargetHasEffect', {effectName:'ImmuneToRoleBlock'})
                    }
                    sendActionEvent(a.target, 'SomeoneIsTryingToDoSomethingToYou', {actionName:a.name})
                }
            }
        })
        this.nightActionSequence = this.nightActionSequence.filter(a => a.origin.hasEffect('RoleBlocked') === false)

        // Silence
        const silenceActions = filterAndRemove(this.nightActionSequence, a => a.name === 'Silence')
        silenceActions.forEach(a => {
            a.target.addEffect_skipThisTurn('Silenced', 1)
            sendActionEvent(a.target, 'YouWereSilenced')
        })

        // Attack and Protect Processing
        let attackSequence  = filterAndRemove(this.nightActionSequence, a => a.type === 'Attack')
        let protectSequence = filterAndRemove(this.nightActionSequence, a => a.type === 'Protect')

        for(const p of this.alivePlayerList){
            let asf  = attackSequence .filter(a => a.target === p)
            let psf  = protectSequence.filter(a => a.target === p)
            let anps = interleaveArrays(asf, psf)
            let tempDeathReason = []

            while(anps.length > 0){
                let action = anps.shift()
                switch(action.type){
                    case 'Attack':
                        const attackSource = action.isTeamAction ? action.origin.team.affiliationName : action.origin.role.name
                        tempDeathReason.push(`${attackSource}Attack`)

                        if(action.target.hasEffect('ImmuneToAttack') === false){
                            sendActionEvent(action.target, 'YouUnderAttack', {source:attackSource})
                            action.target.isAlive = false
                        }else{
                            sendActionEvent(action.target, 'SomeoneIsTryingToDoSomethingToYou', {actionName:action.name, source:attackSource})
                            sendActionEvent(action.origin, 'YourTargetHasEffect', {effectName:'ImmuneToAttack'})
                        }

                        if('killerMessage' in action.origin)
                            action.target.messageLeftByKiller = action.origin.killerMessage
                        else
                            action.target.messageLeftByKiller = undefined
                    break

                    case 'Protect':
                        if(tempDeathReason.length !== 0){
                            if(action.origin.role.modifyObject?.['knowsIfTargetIsAttacked'])
                                sendActionEvent(action.origin, 'YourTargetIsAttacked')
                        }
                        // fixme?: 如果医生已经死了，他还是能救下他要救的人
                        if(action.name === 'Heal' && tempDeathReason.length !== 0 && p.deathReason === undefined){
                            action.target.isAlive = true

                            if(action.target.hasEffect('ImmuneToAttack')){
                                sendActionEvent(action.target, 'SomeoneIsTryingToDoSomethingToYou', {actionName:action.name})
                            }else{
                                sendActionEvent(action.target, 'YouAreHealed')
                            }
                        }
                    break
                }
            }

            if(p.isAlive === false){
                p.deathReason = tempDeathReason
                this.recentlyDeadPlayers.push(p)
            }
        }


        while(this.nightActionSequence.length > 0){
            let a = this.nightActionSequence.shift()
            switch(a.name){
                case 'Detect':
                    if(a.origin.isAlive === true){
                        const detectionReport = {
                            targetIndex: a.target.index,
                            targetAffiliationName: a.target.faction?.name ?? 'Neutral',
                        }

                        if(detectionReport.targetAffiliationName === 'Neutral'){
                            if(a.target.role.tags.includes('Evil')){
                                detectionReport.targetRoleName = a.target.role.name
                            }
                        }

                        if(a.target.hasEffect('ImmuneToDetect')){
                            delete detectionReport.targetRoleName
                            delete detectionReport.targetAffiliationName
                        }

                        if(a.isTeamAction){
                            sendActionEvent(a.origin.team, 'ReceiveDetectionReport', detectionReport)
                        }else{
                            sendActionEvent(a.origin, 'ReceiveDetectionReport', detectionReport)
                        }
                    }
                break

                default:
                    console.error('Unknow action: ', a)
                break
            }
        }

        // effectsProcess_afterAction
        for(const p of this.alivePlayerList){
            if(p.hasEffect('Suicide')){
                p.isAlive = false
                p.deathReason?.push('Suicide') ?? (p.deathReason = ['Suicide'])
                if(this.recentlyDeadPlayers.includes(p) === false)
                    this.recentlyDeadPlayers.push(p)

                sendActionEvent(p, 'YouCommittedSuicide')
            }
        }

        this.onlinePlayerList.forEach(p => p.reduceEffectsDurationTurns())

        function sendActionEvent(target, actionName, data){
            if(data && 'name' in data)
                console.error("The parameter 'data' object of the function sendActionEvent must not contain the property 'name'.")

            if(target.constructor.name === 'Player')
                target.sendEvent('ActionHappened', {...{name:actionName}, ...data})
            else if(target.constructor.name === 'Team')
                target.sendEventToAliveMember('ActionHappened', {...{name:actionName}, ...data})
        }
    }

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

        if(this.notStartedYet || this.status === "end")
            targetGroup = this.onlinePlayerList
        else{
            if(sender.isAlive){
                if(this.status.startsWith("day") && this.status.split('/').includes("discussion")){
                    if(sender.hasEffect('Silenced') === false){
                        targetGroup = this.onlinePlayerList
                    }
                }
                // fixme?:夜间...可以让被沉默的人说话吗？
                else if(this.status.startsWith("night") && this.status.split('/').includes("discussion")){
                    if(sender.team){
                        targetGroup = sender.team.alivePlayerList
                    }
                }
            }else{
                var senderIsDead = true
                targetGroup = this.deadPlayerList
            }
        }

        if(this.status.split('/').includes('lastWord') && sender === this.executionTarget)
            targetGroup = this.onlinePlayerList
        if(this.status.split('/').includes('defense')  && sender === this.trialTarget){
            if(sender.hasEffect('Silenced') === false)
                targetGroup = this.onlinePlayerList
        }

        if(targetGroup !== undefined)
            this.sendEventToGroup(targetGroup, "ChatMessage", {senderIndex:sender.index, message:data, senderIsDead})
    }

    // 首先检查是否有一半的玩家投票重选主机，如果有，随机选择一个主机
    // 其次检查是否有一半的玩家都投票给某个特别的玩家，如果有，选择他为主机
    repickHostVoteCheck(){
        let opll = this.onlinePlayerList.length
        // 尚且不确定哪种人数要求更好，一种不含半数，另一种含半数
        // const voteNeeded = opll % 2 === 0 ? ((opll / 2) + 1) : Math.ceil(opll / 2)
        const voteNeeded = Math.ceil(opll / 2)

        const votedPlayerNumber = this.playerList.filter(p => p.repickHostVoteTargetIndex !== undefined ).length
        if(votedPlayerNumber >= voteNeeded){
            var randomHost = this.getNewRandomHost()
        }

        // 为接下来的检测排除干扰项
        this.playerList.filter(p => p.repickHostVoteTargetIndex === -1).forEach(p => p.repickHostVoteTargetIndex = undefined)

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
        if(newHost?.isOnline && newHost !== this.host){
            this.host = newHost
            this.sendEventToAll("SetHost", this.host)
            this.abortSetupStage()
            this.onlinePlayerList.forEach(p => p.repickHostVoteTargetIndex = undefined)
        }
    }

    // 这个旧的投票检查函数目前仅用于repickHostVote
    voteCheck(voteType, checkPlayers, voteTargets, voteNeeded){
        voteType = voteType.charAt(0).toLowerCase() + voteType.slice(1)
        let voteCount = Array(this.playerList.length).fill(0)
        for(const p of checkPlayers){
            if(p[`${voteType}TargetIndex`] !== undefined){
                voteCount[p[`${voteType}TargetIndex`]] += `${voteType}Weight` in p ? p[`${voteType}Weight`] : 1
                // console.log('voteType:', voteType, `->${p.index} voteTo`, p[`${voteType}TargetIndex`])
            }
        }

        for(const player of this.playerList){
            if(voteTargets.includes(player) === false){
                voteCount[player.index] = 0
            }
        }

        if(voteType === 'lynchVote')
            this.sendEventToAll(`SetLynchVoteCount`, voteCount)
        
        // 如果定义了最小票数，达到最小票数的玩家对象将被返回(lynchVote)
        // 否则得票最高的玩家将被返回，可以返回多个(MafiaKillVote)
        if(voteNeeded !== undefined){
            for(const [index, vc] of voteCount.entries()){
                if(vc >= voteNeeded){
                    return this.playerList[index]
                }
            }
            return undefined
        }else{
            const voteMax = voteCount.reduce((a, b) => Math.max(a, b), -Infinity);

            if(voteMax > 0){
                let voteMaxIndexArray = voteCount.map((vc, idx) => {return  vc === voteMax ? idx:undefined}).filter(vidx => vidx !== undefined)
                if(voteMaxIndexArray.length > 0)
                    return voteMaxIndexArray.map((idx) => this.playerList[idx])
            }
            return undefined
        }
    }

    async trialCycle(player){
        let trialLenghtMin = this.setting.trialTime

        this.trialTarget = player
        this.sendEventToAll("SetTrialTarget", this.trialTarget)
        if(this.trialTarget.hasEffect('Silenced')){
            this.sendEventToAll('TrialTargetIsSilenced')
        }

        if(this.setting.enableTrialDefense){
            await this.newGameStage("day/trial/defense", trialLenghtMin/2)
            await this.newGameStage("day/discussion/trial/trialVote", trialLenghtMin/2)
        }
        else{
            await this.newGameStage("day/discussion/trial/trialVote", trialLenghtMin)
        }
    }

    async execution(player){
        let executionLenghtMin = 0.4 // 0.4 * 60 = 24s

        // "day" stage end
        this.gameStage.end()
        this.executionTarget = player
        this.sendEventToAll("SetExecutionTarget", this.executionTarget)
        await this.newGameStage("day/execution/lastWord", executionLenghtMin/2)
        player.isAlive = false
        player.deathReason = ["Execution"]

        this.recentlyDeadPlayers = []
        this.recentlyDeadPlayers.push(player)

        this.sendEventToAll('SetRecentlyDeadPlayers', this.recentlyDeadPlayers.map(p => this.getPlayerDeathDeclearData(p)))
        await this.newGameStage("animation/execution/deathDeclear", this.recentlyDeadPlayers.length * 0.1)
        this.executionTarget = undefined

        await this.newGameStage("day/execution/discussion", executionLenghtMin/2)
        await this.victoryCheck()

        if(this.status !== "end")
            this.nightCycle()
    }

    // getDDD, Ha
    getPlayerDeathDeclearData(deadPlayer){
        let data = {}
        data.index = deadPlayer.index
        data.deathReason = deadPlayer.deathReason
        if(this.setting.revealPlayerRoleOnDeath)
            data.roleName = deadPlayer.role.name
        if(this.setting.enableLastWill)
            data.lastWill = deadPlayer.lastWill
        if(this.setting.enableKillerMessage)
            data.messageLeftByKiller = deadPlayer.messageLeftByKiller

        return data
    }

    // 游戏的主循环终止于某个Faction达成胜利目标（或所有Faction已无人生还...这里面有一个例外-邪教），
    // 然后依次结算每个玩家的Faction、Team、Role胜利目标，游戏宣布所有目标皆达成的玩家胜出。

    // 基于此，我们可以肯定地说，主要阵营的获胜是具有排他性的，
    // 在这个游戏中，不存在某一个阵营可以与另一个阵营同时获胜，这一点很重要。
    async victoryCheck(){
        if(this.factionSet.some(f => f.alivePlayerList.length > 0)){
            this.winningFaction = this.factionSet.find(f => f.victoryCheck())
            if(this.winningFaction !== undefined){
                this.winners = this.playerList.filter(p => p.victoryCheck())
                this.sendEventToAll("SetCast", this.playerList.map(p => p.toJSON_includeRole()))
                this.sendEventToAll("SetWinner", {winningFactionName:this.winningFaction.name, winners:this.winners.map(p => p.toJSON_includeRole())})

                await this.newGameStage("end", 0.2)
                this.end()
            }
        }
        else if(this.factionSet.every(f => f.alivePlayerList.length === 0)){
            this.winningFaction = undefined
            this.winners = this.playerList.filter(p => p.victoryCheck())
            this.sendEventToAll("SetCast", this.playerList.map(p => p.toJSON_includeRole()))
            this.sendEventToAll("SetWinner", {winners:this.winners.map(p => p.toJSON_includeRole())})

            await this.newGameStage("end", 0.2)
            this.end()
        }
        else if(this.onlinePlayerList.length === 0){
            this.end()
        }
    }

    end(){
        this.status = 'end'
        this.playerList.forEach(p => p.user = undefined)
        this.room.endGame()
    }

    queryAlivePlayersByRoleFaction(factionName){
        return this.alivePlayerList.filter((p)=>{
            return p.role.affiliationName === factionName
        })
    }

    queryAliveMajorFactionPlayers_except(exceptFactionName){
        const majorFationNames = this.factionSet.map(f => f.name)
        const remainingFactionNames  = majorFationNames.filter(fName => fName !== exceptFactionName)

        return this.alivePlayerList.filter(p =>{
            return remainingFactionNames.includes(p.role.affiliationName)
        })
    }

    queryAlivePlayersByRoleName(roleName){
        return this.alivePlayerList.filter((p)=>{
            return p.role.name === roleName
        })
    }

    queryAliveNeutralPlayersByRoleTag(roleTagName){
        return this.alivePlayerList.filter(p => p.faction === undefined).filter(p => {
            return p.role.tags.includes(roleTagName)
        })
    }

    userQuit(user){
        let player = this.playerList.find(p => p.user === user)
        this.sendEventToGroup(this.onlinePlayerList, "PlayerQuit", player)

        if(user === this.host.user && this.notStartedYet)
            this.repickHost(this.getNewRandomHost())

        player.user = undefined

        if(player.isAlive){
            player.addEffect('Suicide')
        }

        if(this.notStartedYet){
            this.playerList = this.onlinePlayerList
            this.sendEventToAll('SetPlayerList', this.playerList)
        }

        if(this.status === 'animation/actions'){
            this.gameDirector.CheckAllPlayersAnimationsFinished()
        }

        if(this.onlinePlayerList.length === 0){
            this.status = 'end'
            this.gameStage?.abort()
            this.room.endGame()
        }
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function isValidIndex(index, arrayLength) {
    return Number.isInteger(index) && index >= 0 && index < arrayLength;
}

function filterAndRemove(array, condition) {
    let newArray = array.filter(condition)

    for (let i = array.length - 1; i >= 0; i--) {
        if (condition(array[i])) {
            array.splice(i, 1)
        }
    }

    return newArray
}

function interleaveArrays(arr1, arr2) {
    let result = [];
    let maxLength = Math.max(arr1.length, arr2.length);

    for (let i = 0; i < maxLength; i++) {
        if (i < arr1.length) {
            result.push(arr1[i]);
        }
        if (i < arr2.length) {
            result.push(arr2[i]);
        }
    }

    return result;
}

function weightedRandom(possibleRoles) {
    const totalWeight = possibleRoles.reduce((sum, role) => sum + role.weight, 0)

    const randomNum = Math.random() * totalWeight

    let cumulativeWeight = 0

    for (let i = 0; i < possibleRoles.length; i++) {
        cumulativeWeight += possibleRoles[i].weight
        if (randomNum < cumulativeWeight) {
            return possibleRoles[i].name
        }
    }

    return undefined
}

function calculateProbability(roleName, possibleRoles) {
    const totalWeight = possibleRoles.reduce((sum, role) => sum + role.weight, 0)

    const roleWeight  = possibleRoles.find(r => r.name === roleName).weight
    const probability = roleWeight / totalWeight

    return probability
}

class Player{
    constructor(user, game){
        this.user = user
        this.playedRoleNameRecord = []
        this.game = game
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

    get hasCustomName(){
        return 'nickname' in this
    }

    get index(){
        return this.game.playerList.indexOf(this)
    }

    get isOnline(){
        return this.user !== undefined
    }

    sendEvent(eventType, data){
        if(this.user !== undefined)
            this.user.sendEvent(eventType, data)
    }

    resetCommonProperties(){
        this.animationsFinished = false
    }

    setRole(roleData){
        this.playedRoleNameRecord.push(roleData.name)
        this.role = new Role(this.game, this, roleData)
        this.sendEvent("SetRole", this.role)
    }

    setFaction(faction){
        this.faction = faction
        faction.playerList.push(this)
    }

    setTeam(team){
        const player = this
        team.playerList.push(this)
        this.team = new Proxy({
            player,
            team,
            playerVote(voteData){
                this.team.playerVote(player, voteData)
            },
            playerVoteCancel(voteData){
                this.team.playerVoteCancel(player, voteData)
            }
        }, {
            get(target, prop) {
                if(prop === 'constructor')
                    return target.team[prop]

                return prop in target ? target[prop] : target.team[prop]
            }
        })
    }

    victoryCheck(){
        const factionVictory = this.faction?.victoryCheck() ?? true
        const teamVictory = this.team?.victoryCheck?.() ?? true
        const roleVictory = this.role.victoryCheck?.() ?? true

        return factionVictory && teamVictory && roleVictory
    }

    generateNightActions(){
        return this.role.generateNightActions()
    }

    #effetcs = []
    addEffect(name, durationTurns = Infinity){
        this.#effetcs.push({name, durationTurns})
    }
    addEffect_skipThisTurn(name, durationTurns){
        this.addEffect(name, (durationTurns+1))
    }
    removeEffect(eName){
        this.#effetcs = this.#effetcs.filter(e => e.name !== eName)
    }
    hasEffect(eName){
        return (this.#effetcs.map(e => e.name).includes(eName) || this.role.hasEffect(eName))
    }
    reduceEffectsDurationTurns(){
        this.#effetcs.forEach(e => e.durationTurns -= 1)
        this.#effetcs = this.#effetcs.filter(e => e.durationTurns > 0)
        this.role.reduceEffectsDurationTurns()
    }

    toJSON_includeRole(){
        const json = this.toJSON()
        json.affiliationName = this.faction?.name
        json.role = this.role
        json.playedRoleNameRecord = this.playedRoleNameRecord
        return json
    }

    toJSON(){
        return {
            name: this.name,
            userName: this.user?.name,
            index:this.index,
            hasCustomName:this.hasCustomName,
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
            this.delay = this.remainingTime
            this.clear()
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