if(require.main){
    // console.log("?")
    // console.log(gameDataInit({}))
    // console.log("??")
}

// console.log("?")

const originalGameData = {
    tags: [
        {
            name: "Town",
            isFaction: true,
            includeRoles: [
                "Citizen",
                "Sheriff",
                "Doctor",
                "AuxiliaryOfficer"
            ]
        },
        {
            name: "Mafia",
            isFaction: true,
            includeRoles: [
                "Mafioso"
            ]
        },
        {
            name: "Killing",
            includeRoles: [
                "Mafioso"
            ]
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
            name: "Doctor"
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
            verify: (game, voterIndex, targetIndex, previousTargetIndex)=>{
                let voterIsAlive = game.playerList[voterIndex].isAlive
                let targetIsAlive = game.playerList[targetIndex]?.isAlive
                let targetIsNotPreviousTarget = targetIndex !== previousTargetIndex
                // 为什么玩家不能给自己投票？我觉得他可以啊
                // let targetIsNotVoter = (voterIndex !== targetIndex)
                let gameStatusIncludesLynchVote = game.status.split('/').includes('lynchVote')
                return voterIsAlive && targetIsAlive && targetIsNotPreviousTarget && gameStatusIncludesLynchVote
            },
            cancelVerify(game, record, voterIndex){
                let voterHasVoteRecord = record[voterIndex] !== undefined
                let gameStatusIncludesLynchVote = game.status.split('/').includes('lynchVote')
                return voterHasVoteRecord && gameStatusIncludesLynchVote
            },
            getResultIndex(game, count){
                const apll = game.alivePlayerList.length
                const voteNeeded = apll % 2 === 0 ? ((apll / 2) + 1) : Math.ceil(apll / 2)
                const resultIndex = count.findIndex(c => c >= voteNeeded)
                return  resultIndex >= 0 ? resultIndex : undefined
            }
        }

    ],
    teams: [
        {
            name: "Mafia",
            includeRoleTag: "Mafia",
            teamAbility: "MafiaKillAttack",
            teamVoteVerify: (voterIndex, targetIndex)=>{
                let voterIsAlive = this.playerList[voterIndex].isAlive
                let targetIsAlive = this.playerList[targetIndex].isAlive
                let voterIsMafia = this.queryAlivePlayersByRoleTag('Mafia').map(p => p.index).includes(voterIndex)
                // 为什么要限制黑手党在晚上投票呢？白天也可以投啊
                // let gameStatusIsNightDiscussion = (this.status === 'night/discussion')
                // 为什么要限制黑手党给自己人投票呢？我觉得他可以啊
                // let targetIsNotMafia = (this.queryAlivePlayersByRoleTag('Mafia').map(p => p.index).includes(targetIndex) === false)
                return voterIsAlive && targetIsAlive && voterIsMafia
            },
        }
    ]
}

console.log(gameDataInit({playerList:[]}))


export function gameDataInit(game){
    let roleSet = roleSetInit()
    let voteSet = voteSetInit(game)
    let teamSet = teamSetInit(roleSet)

    return {roleSet, voteSet, teamSet}

    function roleSetInit(){
        let roleSet = []
        let roleData = originalGameData.roles
        let tagsData = originalGameData.tags

        for(let r of roleData){
            r.tags = tagsData.map(t => t.includeRoles.includes(r.name)? t.name:undefined).filter(t => t !== undefined)

            // set affiliation
            // 设置角色的从属关系，不属于“城镇”、“黑手党”、“三合会”的角色会被设置为中立
            r.affiliation = r.tags.find(tName => tagsData.find(t => t.name === tName).isFaction) ?? "Neutral"
            if(r.affiliation === "Neutral")
                r.tags.unshift("Neutral")

            roleSet.push(r)
        }

        return roleSet
    }

    function voteSetInit(game){
        return originalGameData.votes.map(v => new Vote(game, v))
    }

    function teamSetInit(roleSet){
        return {}
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

    playerVote(voterIndex, targetIndex){
        const previousTargetIndex = this.record[voterIndex]
        const success = this.verify(this.game, voterIndex, targetIndex, previousTargetIndex)
        if(success){
            this.record[voterIndex] = targetIndex
            const voteCount = this.getCount()
            return {success, previousTargetIndex, voteCount}
        }

        return {success:false}
    }

    playerVoteCancel(voterIndex){
        const success = this.cancelVerify(this.game, this.record, voterIndex)
        const previousTargetIndex = this.record[voterIndex]
        if(success){
            this.record[voterIndex] = undefined
            const voteCount = this.getCount()
            return {success, previousTargetIndex, voteCount}
        }

        return {success:false}
    }

    getCount(){
        let count = new Array(this.record.length).fill(0)
        for(const [voterIndex, targetIndex] of this.record.entries()){
            const p = this.game.playerList[voterIndex]
            count[targetIndex] += `${this.type}Weight` in p.role ? p.role[`${this.type}Weight`] : 1
        }

        return count
    }

    getResultIndex(){
        return this.data.getResultIndex(this.game, this.getCount())
    }

    resetRecord(){
        this.record = this.record.fill(undefined)
    }

    verify(game, voterIndex, targetIndex, previousTargetIndex){
        return this.data.verify(game, voterIndex, targetIndex, previousTargetIndex)
    }
    cancelVerify(game, record, voterIndex){
        return this.data.cancelVerify(game, record, voterIndex)
    }
}