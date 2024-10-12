const originalGameData = {
    tags: [
        {
            name: "Town",
            isFaction: true,
            includeRoleNames: [
                "Citizen",
                "Sheriff",
                "Doctor",
                "AuxiliaryOfficer"
            ]
        },
        {
            name: "Mafia",
            isFaction: true,
            includeRoleNames: [
                "Mafioso"
            ]
        },
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
            name: "Citizen"
        },
        {
            name: "Sheriff"
        },
        {
            name: "Doctor",
            abilities:[
                {
                    name: 'DoctorHealProtect',
                    setRoleData(game, player){
                        player.roleData[`${this.name}Target`] = undefined
                    },
                    use(game, user, data){
                        const target = game.playerList[data.targetIndex]
                        if(this.verify(user, target)){
                            user.roleData[`${this.name}Target`] = target
                            return true
                        }
                        return false
                    },
                    verify(user, target){
                        const userIsAlive = user.isAlive
                        const userIsNotTarget = (user !== target)
                        return userIsAlive && userIsNotTarget
                    },
                    generateAction(user){
                        if(user.roleData[`${this.name}Target`] !== undefined){
                            const abilityTarget = user.roleData[`${this.name}Target`]
                            user.roleData[`${this.name}Target`] = undefined
                            return {type:this.name, origin:user, target:abilityTarget}
                        }
                        return undefined
                    }
                }
            ]
        },
        {
            name: "AuxiliaryOfficer"
        },
        {
            name: "Mafioso"
        }
    ],
    votes: [
        {
            name: "LynchVote",
            verify: (game, voterIndex, voteData, previousVoteData)=>{
                if(Number.isInteger(voteData)){
                    const targetIndex = voteData
                    let voterIsAlive = game.playerList[voterIndex].isAlive
                    let targetIsAlive = game.playerList[targetIndex]?.isAlive
                    let targetIsNotPreviousTarget = targetIndex !== previousVoteData
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
            includeRoleTag: "Mafia",
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
                        this.vote.resetRecord()
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
    let roleSet = roleSetInit(game)
    let voteSet = voteSetInit(game)
    let teamSet = teamSetInit(game, roleSet)

    return {tagSet, roleSet, voteSet, teamSet}

    function tagSetInit(){
        let tagSet = originalGameData.tags
        let teamTag = tagSet.find(t => t.name === 'Team')

        for(const team of originalGameData.teams){
            if('includeRoleNames' in team){
                teamTag.includeRoleNames = teamTag.includeRoleNames.concat(team.includeRoleNames)
            }

            if('includeRoleTag' in team){
                const irn = tagSet.find(t => t.name === team.includeRoleTag).includeRoleNames
                teamTag.includeRoleNames = teamTag.includeRoleNames.concat(irn)
            }
        }

        return tagSet
    }

    function roleSetInit(game){
        let roleSet = []
        let rolesData = originalGameData.roles
        let tagsData = originalGameData.tags

        for(let roleData of rolesData){
            roleSet.push(new Role(game, roleData, tagsData))
        }

        return roleSet
    }

    function voteSetInit(game){
        return originalGameData.votes.map(v => new Vote(game, v))
    }

    function teamSetInit(game, roleSet){
        return originalGameData.teams.map(t => new Team(game, t, roleSet))
    }
}

// 注意，这里设置的role涵盖了同一角色的所有代码，但是具体到角色行为需要的数据，则并不在这个类中
// 举例来说，某一市民的防弹衣还剩下多少使用次数并不保存在此。
// 我暂时还没找到很好的解决办法，就先放在玩家对象里面吧。
// 所以，与其说这里写的是Role类，它反倒是更像某种RoleMate
// 仔细思考一下就会发现，这么做是正确的，
// 因为同一个角色只会遵循同一个逻辑，没有理由将这些逻辑复制给每个玩家（虽然这么做可以带来使用上的方便
// 也许有某种方法可以兼顾方便和正确，但是我还没找到它

// ...确实有种方法可以兼顾方便和正确，只需要将下面这个类称之为RoleMate，
// 然后再在Player类与RoleMate类之间补充一个包含数据的中间层即可...
class Role{
    constructor(game, roleData, tagsData){
        this.name = roleData.name
        this.abilities = roleData.abilities
        this.data = roleData
        this.game = game
        this.tags = tagsData.map(t => t.includeRoleNames.includes(this.name)? t.name:undefined).filter(t => t !== undefined)

        // set affiliation
        // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
        this.affiliation = this.tags.find(tName => tagsData.find(t => t.name === tName).isFaction) ?? "Neutral"
        if(this.affiliation === "Neutral")
            this.tags.unshift("Neutral")
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
        player.roleData = {}

        for(const a of this.abilities){
            if('setRoleData' in a)
                a.setRoleData(this.game, player)
        }
    }

    toJSON(){
        return {
            name: this.name,
            abilityNames: this.abilities.map(a => a.name)
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
    constructor(game, data, roleSet){
        this.name = data.name
        this.game = game
        this.data = data

        this.playerList = []

        this.includeRoles = []
        for(const r of roleSet){
            if('includeRoleTag' in data){
                if(r.tags.includes(data.includeRoleTag)){
                    this.includeRoles.push(r)
                }
            }

            if('includeRoleNames' in data){
                for(const roleName of data.includeRoleNames){
                    if(r.name === roleName && (this.includeRoles.includes(r) === false)){
                        this.includeRoles.push(r)
                    }
                }

            }
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
}

if(require.main === module){
    console.log(gameDataInit({playerList:[]}))
}

function getRandomElement(arr){
    const randomIndex = Math.floor(Math.random() * arr.length)
    return arr[randomIndex]
}