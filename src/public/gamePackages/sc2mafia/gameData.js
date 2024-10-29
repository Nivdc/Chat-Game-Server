const originalGameData = {
    factions: [
        {name:'Town'},
        {name:'Mafia'}
    ],
    tags: [
        {
            name: "Killing",
            includeRoleNames: [
                "Mafioso"
            ]
        },
        {
            name:"Team",
            includeRoleNames: [] // auto generate
        }
    ],
    roles: [
        {
            name: "Citizen",
            defaultAffiliationName:"Town",
        },
        {
            name: "Sheriff",
            defaultAffiliationName:"Town",
        },
        {
            name: "Doctor",
            defaultAffiliationName:"Town",
            abilities:[
                {
                    // require data:{targetIndex}
                    name: 'DoctorHealProtect',
                    setRoleData(game, player){
                        player.role[`${this.name}Target`] = undefined
                    },
                    use(game, user, data){
                        const target = game.playerList[data.targetIndex]
                        if(this.verify(user, target)){
                            user.role[`${this.name}Target`] = target
                            return true
                        }
                        return false
                    },
                    verify(user, target){
                        const userIsAlive = user.isAlive
                        const userIsNotTarget = (user !== target)
                        const targetIsNotDead_Yet = target.isAlive
                        return userIsAlive && userIsNotTarget && targetIsNotDead_Yet
                    },
                    generateAction(user){
                        if(user.role[`${this.name}Target`] !== undefined){
                            const abilityTarget = user.role[`${this.name}Target`]
                            user.role[`${this.name}Target`] = undefined
                            return {type:this.name, origin:user, target:abilityTarget}
                        }
                        return undefined
                    }
                }
            ]
        },
        {
            name: "AuxiliaryOfficer",
            defaultAffiliationName:"Town",
        },
        {
            name: "Mafioso",
            defaultAffiliationName:"Mafia",
        }
    ],
    votes: [
        {
            name: "LynchVote",
            verify: (game, voterIndex, voteData, previousVoteData)=>{
                const targetIndex = voteData
                const previousTargetIndex = previousVoteData
                if(Number.isInteger(targetIndex)){
                    let voterIsAlive = game.playerList[voterIndex].isAlive
                    let targetIsAlive = game.playerList[targetIndex]?.isAlive
                    let targetIsNotPreviousTarget = (targetIndex !== previousTargetIndex)
                    // 为什么玩家不能给自己投票？我觉得他可以啊
                    // let targetIsNotVoter = (voterIndex !== targetIndex)
                    let gameStatusIncludesLynchVote = game.status.split('/').includes('lynchVote')
                    return voterIsAlive && targetIsAlive && targetIsNotPreviousTarget && gameStatusIncludesLynchVote
                }
                else{
                    return false
                }
            },
            getResultIndex(game, count){
                const apll = game.alivePlayerList.length
                const voteNeeded = apll % 2 === 0 ? ((apll / 2) + 1) : Math.ceil(apll / 2)
                const resultIndex = count.findIndex(c => c >= voteNeeded)
                return  resultIndex >= 0 ? resultIndex : undefined
            }
        },
        {
            name: "TrialVote",
            verify: (game, voterIndex, voteData, previousVoteData)=>{
                if(typeof(voteData) === 'boolean'){
                    let voterIsAlive = game.playerList[voterIndex].isAlive
                    let voterIsNotTrialTarget = voterIndex !== game.trialTarget?.index
                    let voteDataIsNotPreviousVoteData = voteData !== previousVoteData
                    let gameStatusIncludesTrialVote = game.status.split('/').includes('trialVote')
                    return voterIsAlive && voterIsNotTrialTarget && voteDataIsNotPreviousVoteData && gameStatusIncludesTrialVote
                }
            },
            getResultBoolean(game, record){
                const guiltyCount = record.filter(r => r === true).length
                const innocentCount = record.filter(r => r === false).length

                return guiltyCount > innocentCount
            }
        }

    ],
    teams: [
        {
            name: "Mafia",
            includeRoleNames:["Mafioso"],

            // includeRoleTag: "Mafia",
            abilities:[
                {
                    name:"MafiaKillAttack",
                    targetNoticeEventType:"MafiaKillTargets",
                    voteData:{
                        name:"MafiaKillVote",
                        verify(game, voterIndex, targetIndex, previousTargetIndex){
                            let voterIsAlive = game.playerList[voterIndex].isAlive
                            let targetIsAlive = game.playerList[targetIndex].isAlive
                            let voterIsTeamMember = this.team.playerList.map(p => p.index).includes(voterIndex)
                            let targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                            // 为什么要限制黑手党在晚上投票呢？白天也可以投啊
                            // let gameStatusIsNighdataiscussion = (this.status === 'night/discussion')
                            // 为什么要限制黑手党给自己人投票呢？我觉得他可以啊
                            // let targetIsNotMafia = (this.queryAlivePlayersByRoleTag('Mafia').map(p => p.index).includes(targetIndex) === false)
                            return voterIsAlive && voterIsTeamMember && targetIsAlive && targetIsNotPreviousTarget
                        },
                        getResultIndex(game, count){
                            const voteMax = count.reduce((a, b) => Math.max(a, b), -Infinity);

                            if(voteMax > 0){
                                let voteMaxIndexArray = count.map((vc, idx) => {return  vc === voteMax ? idx:undefined}).filter(vidx => vidx !== undefined)
                                return voteMaxIndexArray
                            }
                            return undefined
                        }
                    },
                    generateAction(){
                        const targetIndexArray = this.vote.getResultIndex()
                        if(targetIndexArray !== undefined && targetIndexArray.length !== 0){
                            const realKiller = getRandomElement(this.team.alivePlayerList)
                            const realTargetIndex = getRandomElement(targetIndexArray)
                            const realTarget = this.game.playerList[realTargetIndex]
                            this.team.sendEvent('TeamActionNotice', {originIndex:realKiller.index, targetIndex:realTarget.index})
                            return {type:this.name, origin:realKiller, target:realTarget}
                        }else{
                            return undefined
                        }
                    }
                }
            ],
        }, 

        {
            name:"AuxiliaryOfficers",
            includeRoleNames:["AuxiliaryOfficer"],
            abilities:[
                {
                    name:"AuxiliaryOfficerCheck",
                    targetNoticeEventType:"AuxiliaryOfficerCheckTargets",
                    voteData:{
                        name:"AuxiliaryOfficerCheckVote",
                        verify(game, voterIndex, targetIndex, previousTargetIndex){
                            let voterIsAlive = game.playerList[voterIndex].isAlive
                            let targetIsAlive = game.playerList[targetIndex].isAlive
                            let voterIsTeamMember = this.team.playerList.map(p => p.index).includes(voterIndex)
                            let targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                            let targetIsNotAuxiliaryOfficer = (this.team.playerList.map(p => p.index).includes(targetIndex) === false)
                            return voterIsAlive && voterIsTeamMember && targetIsAlive && targetIsNotPreviousTarget && targetIsNotAuxiliaryOfficer
                        },
                        getResultIndex(game, count){
                            const voteMax = count.reduce((a, b) => Math.max(a, b), -Infinity);

                            if(voteMax > 0){
                                let voteMaxIndexArray = count.map((vc, idx) => {return  vc === voteMax ? idx:undefined}).filter(vidx => vidx !== undefined)
                                return voteMaxIndexArray
                            }
                            return undefined
                        }
                    },
                    generateAction(){
                        const targetIndexArray = this.vote.getResultIndex()
                        if(targetIndexArray !== undefined && targetIndexArray.length !== 0){
                            const realOrigin = getRandomElement(this.team.alivePlayerList)
                            const realTargetIndex = getRandomElement(targetIndexArray)
                            const realTarget = this.game.playerList[realTargetIndex]
                            this.team.sendEvent('TeamActionNotice', {originIndex:realOrigin.index, targetIndex:realTarget.index})
                            return {type:this.name, origin:realOrigin, target:realTarget}
                        }else{
                            return undefined
                        }
                    }
                }
            ],
        }
    ]
}

export function gameDataInit(game){
    let tagSet  = tagSetInit() 
    let roleMetaSet = roleMetaSetInit(game)
    let voteSet = voteSetInit(game)
    let teamSet = teamSetInit(game, roleMetaSet)

    return {tagSet, roleMetaSet, voteSet, teamSet}

    function tagSetInit(){
        let tagSet = originalGameData.tags
        let teamTag = tagSet.find(t => t.name === 'Team')

        if(teamTag.includeRoleNames.length === 0){        
            for(const teamData of originalGameData.teams){
                if('includeRoleNames' in teamData){
                    teamTag.includeRoleNames.push(...teamData.includeRoleNames)
                }

                if('includeRoleTag' in teamData){
                    const irn = tagSet.find(t => t.name === teamData.includeRoleTag).includeRoleNames
                    teamTag.includeRoleNames.push(...irn)
                }
            }
        }

        return tagSet
    }

    function roleMetaSetInit(game){
        let roleMetaSet = []
        let rolesData = originalGameData.roles
        let tagsData = originalGameData.tags

        for(let roleData of rolesData){
            roleMetaSet.push(new RoleMeta(game, roleData, tagsData))
        }

        return roleMetaSet
    }

    function voteSetInit(game){
        return originalGameData.votes.map(v => new Vote(game, v))
    }

    function teamSetInit(game, roleMetaSet){
        return originalGameData.teams.map(t => new Team(game, t, roleMetaSet))
    }
}

// 注意，这里设置的Role涵盖了同一角色的所有代码，但是具体到角色行为需要的数据，则并不在这个类中
// 举例来说，某一市民的防弹衣还剩下多少使用次数并不保存在此。
// 我暂时还没找到很好的解决办法，就先放在玩家对象里面吧。
// 所以，与其说这里写的是Role类，它反倒是更像某种RoleMeta
// 仔细思考一下就会发现，这么做是正确的，
// 因为同一个角色只会遵循同一个逻辑，没有理由将这些逻辑复制给每个玩家（虽然这么做可以带来使用上的方便
// 也许有某种方法可以兼顾方便和正确，但是我还没找到它

// ...确实有种方法可以兼顾方便和正确，只需要将下面这个类称之为RoleMeta，
// 然后再在Player类与RoleMeta类之间补充一个包含数据的中间层即可...

// 就这么干吧，Player类里面多出来一个roleData实在太奇怪了，应该也没啥坏处
class RoleMeta{
    constructor(game, roleData, tagsData){
        this.data = roleData
        this.game = game
        this.tagStrings = tagsData.map(t => t.includeRoleNames.includes(roleData.name)? t.name:undefined).filter(t => t !== undefined)

        // set affiliationName
        // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
        // this.affiliationName = this.tagStrings.find(ts => tagsData.find(t => t.name === ts).isFaction) ?? "Neutral"
        // this.tagStrings = this.tagStrings.filter(ts => tagsData.find(t => t.name === ts).isFaction !== true)
        // if(this.affiliationName === "Neutral")
        //     this.tagStrings.unshift("Neutral")

        return new Proxy(this, {
            get(target, prop) {
                return prop in target ? target[prop] : target.data[prop]
            }
        })
    }

    useAblity(user, data){
        if(this.abilities.length === 1){
            const success = this.abilities[0].use(this.game, user, data)
            if(success){
                user.sendEvent('UseAblitySuccess', data)
            }
        }
        else if('name' in data){
            const ability = this.abilities.find(a => a.name === data.name)
            const success = ability.use(this.game, user, data)
            if(success){
                user.sendEvent('UseAblitySuccess', data)
            }
        }
    }

    setRoleData(player){
        if(this.abilities !== undefined){
            for(const a of this.abilities){
                if('setRoleData' in a)
                    a.setRoleData(this.game, player)
            }
        }
    }

    toJSON(){
        return {
            name:this.name,
            tagStrings:this.tagStrings,
            defaultAffiliationName:this.defaultAffiliationName,
            abilityNames:this.abilities?.map(a => a.name)
        }
    }
}

// 在这个类中，
// record记录了谁投票给谁，record[1]读取出来的就是2号玩家投票的对象
// 而count记录的是得票情况，count[1]读取出来的就是2号玩家得了几票
class Vote{
    constructor(game, data){
        this.game = game
        this.data = data
        this.record = new Array(game.playerList.length).fill(undefined);
    }

    get name(){
        return this.data.name
    }

    get type(){
        return this.data.name
    }

    playerVote(voterIndex, voteData){
        const previousVoteData = this.record[voterIndex]
        const success = this.verify(this.game, voterIndex, voteData, previousVoteData)
        if(success){
            this.record[voterIndex] = voteData
            const voteCount = this.getCount()
            return {success, previousVoteData, voteCount}
        }

        return {success:false}
    }

    playerVoteCancel(voterIndex){
        const previousVoteData = this.record[voterIndex]
        if(previousVoteData !== undefined){
            this.record[voterIndex] = undefined
            const voteCount = this.getCount()
            return {success:true, previousVoteData, voteCount}
        }

        return {success:false}
    }

    getCount(){
        let count = new Array(this.record.length).fill(0)
        for(const [voterIndex, targetIndex] of this.record.entries()){
            const p = this.game.playerList[voterIndex]
            if(targetIndex !== undefined)
                count[targetIndex] += `${this.type}Weight` in p.role ? p.role[`${this.type}Weight`] : 1
        }

        return count
    }

    getResult(){
        if('getResultIndex' in this.data)
            return this.data.getResultIndex(this.game, this.getCount())
        else if('getResultBoolean' in this.data)
            return this.data.getResultBoolean(this.game, this.record)
    }

    getResultIndex(){
        if('getResultIndex' in this.data)
            return this.data.getResultIndex(this.game, this.getCount())
    }

    resetRecord(){
        this.record = this.record.fill(undefined)
    }

    verify(game, voterIndex, voteData, previousTargetIndex){
        return this.data.verify(game, voterIndex, voteData, previousTargetIndex)
    }
    cancelVerify(game, record, voterIndex){
        return this.data.cancelVerify(game, record, voterIndex)
    }
}

class Team{
    constructor(game, data, roleMetaSet){
        this.name = data.name
        this.game = game
        this.data = data

        this.playerList = []

        this.includeRoleNames = []
        for(const r of roleMetaSet){
            if('includeRoleTag' in data){
                if(r.tagStrings.includes(data.includeRoleTag)){
                    this.includeRoleNames.push(r.name)
                }
            }
        }
        if('includeRoleNames' in data){
            this.includeRoleNames.push(...data.includeRoleNames)
        }

        for(let a of data.abilities){
            a.team = this
            a.game = game
            a.voteData.team = this
            a.vote = new Vote(game, a.voteData)
        }
    }

    sendEvent(eventType, data){
        return this.game.sendEventToGroup(this.playerList, eventType, data)
    }

    get alivePlayerList(){
        return this.playerList.filter(p => p.isAlive)
    }

    get abilities(){
        return this.data.abilities
    }

    playerVote(voter, targetIndex){
        if(this.abilities.length === 1){
            const ability = this.abilities[0]
            const vote = ability.vote
            const voterIndex = voter.index
            const {success, previousTargetIndex, voteCount} = vote.playerVote(voter.index, targetIndex)
            if(success){
                this.sendEvent(vote.type, {voterIndex, targetIndex, previousTargetIndex})
                if('targetNoticeEventType' in ability)
                    this.sendEvent(ability.targetNoticeEventType, ability.vote.getResultIndex())
            }
        }
    }

    playerVoteCancel(voter){
        if(this.abilities.length === 1){
            const ability = this.abilities[0]
            const vote = ability.vote
            const voterIndex = voter.index
            const {success, previousTargetIndex, voteCount} = vote.playerVoteCancel(voterIndex)
            if(success){
                this.sendEvent(vote.type+'Cancel', {voterIndex, previousTargetIndex})
                if('targetNoticeEventType' in ability)
                    this.sendEvent(ability.targetNoticeEventType, ability.vote.getResultIndex())
            }
        }
    }

    generateAction(){
        let actionSequence = []
        for(const ability of this.abilities){
            const action = ability.generateAction()
            if(action !== undefined)
                actionSequence.push(action)

            ability.vote.resetRecord()
        }

        return actionSequence
    }

    toJSON(){
        return {
            name:this.name,
            abilityNames:this.abilities?.map(a => a.name)
        }
    }
}

// 下面这个输出是用来调试的，和浏览器环境不兼容因此只能注释掉
// if(require.main === module){
//     // console.log(gameDataInit({playerList:[]}).roleMetaSet.map(rm => rm.toJSON()))
//     console.log(getDefaultAffiliationTable())
// }

function getRandomElement(arr){
    const randomIndex = Math.floor(Math.random() * arr.length)
    return arr[randomIndex]
}

// todo
export function abilityUseVerify(roleName, abilityName){
    
}

export function publicVoteVerify(game, voteTypeName, {voterIndex, targetIndex, previousTargetIndex}){
    const vote = originalGameData.votes.find(v => v.name === voteTypeName)
    return vote.verify(game, voterIndex, targetIndex, previousTargetIndex)
}

export function getDefaultAffiliationTable(){
    let  defaultAffiliationTable = []
    const roles = originalGameData.roles
    const factionNameSet = new Set(roles.map(r => r.defaultAffiliationName))
    for(const factionName of factionNameSet){
        defaultAffiliationTable.push({
            name:factionName,
            includeRoleNames:roles.filter(r => r.defaultAffiliationName === factionName).map(r => r.name)
        })
    }

    return defaultAffiliationTable
}