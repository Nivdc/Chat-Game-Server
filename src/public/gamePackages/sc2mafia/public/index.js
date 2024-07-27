let socket = undefined

document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        loading:true,
        watchIgnore:false,
        setting:{},

        async init() {
            this.setting = cloneDeep(this.presets[0].setting)
            this.socketInit()
            sendEvent("FrontendReady")
            this.roleSetInit()
            this.loading = false

            this.$watch('setting', (value, oldValue)=>{
                if(this.watchIgnore === false){
                    sendEvent("HostChangesGameSetting", value)
                    
                }else{
                    this.watchIgnore = false
                }
            })
        },
        socketInit(){
            socket = window.top.socket
            window.top.game_onmessage = onMessage

        
            if(socket === undefined){
                console.log("调试模式，事件将不会被发送到服务器。")
                socket = {send:console.log}
            }

            window.addEventListener('HostChangesGameSetting', (e) => {
                this.watchIgnore = true
                this.setting = e.detail
            })
            window.addEventListener('SetHost', (e) => {
                this.host = this.getPlayerByPlayerData(e.detail)
                let message = {parts:[]}
                message.parts.push(this.host.getNameMessagePart())
                message.parts.push({text:'  是新的主机', class:'text-warning'})
                this.addMessage(message)
            })
            window.addEventListener('SetPlayerList', (e) => {
                let playerDatas = e.detail
                let playerColors = [
                    "red", "blue", "87CEFA",
                    "purple", "yellow", "FF6811",
                    "228B22", "FFC0EA", "8A2BE2",
                    "D3D3D3", "006400", "8B4513",
                    "98FB98", "696969", "fuchsia"
                ];

                this.playerList = playerDatas.map(pd => new Player(pd, playerColors[pd.index]))
            })
            window.addEventListener('ChatMessage', (e) => {
                let message = {parts:[]}
                let sender  = this.getPlayerByPlayerData(e.detail.sender)
                message.parts.push(sender.getNameMessagePart(': '))
                message.parts.push({text:e.detail.message})
                this.addMessage(message)
            })
            window.addEventListener('HostSetupGame', (e) => {
                this.addMessage({text:"游戏将在15秒后开始", style:"color:LawnGreen;"})
                this.startButtonToggle = false
            })
            window.addEventListener('HostCancelSetup', (e) => {
                this.addMessage({text:"主机取消了开始", style:"color:yellow;"})
                this.startButtonToggle = true
            })
            window.addEventListener('PlayerQuit', (e) => {
                let message = {parts:[], style:'background-color:darkred'}
                let player  = this.getPlayerByPlayerData(e.detail)
                message.parts.push(player.getNameMessagePart())
                message.parts.push({text:' 退出了游戏'})
                this.addMessage(message)
            })
            window.addEventListener('SetStatus', (e) => {
                this.status = e.detail
                console.log(this.status)
                if(this.status === 'begin'){
                    this.createTimer('begin', 0.5, ()=>{this.timer = undefined})
                    this.clearMssagesList()
                }
            })
            window.addEventListener('PlayerRename', (e) => {
                if(e.detail.player.hasCustomName === false)
                    this.addMessage({text:`${e.detail.newName} 进入了城镇`, style:"color:lime;"})
                else
                    this.addMessage({text:`${e.detail.player.name} 将名字改为 ${e.detail.newName}`, style:"color:lime;"})

            })
            window.addEventListener('RepickHost', (e) => {
                let message = {parts:[]}
                let player  = this.playerList[e.detail.player.index]
                message.parts.push(player.getNameMessagePart())
                if(e.detail.targetIndex == null)
                    message.parts.push({text:' 提议重选主机', style:'color:yellow'})
                else{
                    let target = this.playerList[e.detail.targetIndex]
                    message.parts.push({text:' 提议重选主机为 ', style:'color:yellow'})
                    message.parts.push(target.getNameMessagePart())
                }
                this.addMessage(message)
            })
            window.addEventListener('SetRole', (e) => {
                this.myRole = this.roleSet.find(r=>r.name === e.detail.name)
                this.gamePageTipMessage = {}
                this.gamePageTipMessage.class = 'animation-fadeIn-1s'
                this.gamePageTipMessage.parts = [{text:"您将要扮演的角色是 ... "}]
                let mrnmp = this.myRole.getNameMessagePart()
                mrnmp.style += 'font-weight:bold;'
                this.gamePageTipMessage.parts.push(mrnmp)
                document.getElementById('gamePage').style.display = 'flex'
                setTimeout(()=>{
                    this.gamePageTipMessage.class = 'animation-fadeOut-2s'
                    document.getElementById('gamePageBody').classList.add('animation-fadeIn-3s')
                    document.getElementById('gamePageBody').style.display = 'flex'
                }, 3000)
            })
        },

        getPlayerByPlayerData(playerData){
            return this.playerList.find(p => p.index === playerData.index)
        },

        // 预设栏组件
        selectedPreset:undefined,
        presets : [
            {
                name:"默认",
                description:"默认的设置",
                setting:{
                    dayVoteType: "Majority",
                    dayLength: 1.2,
                    
                    enableTrial: false,
                    enableTrialDefense: true,
                    trialTime: 0.8,
                    pauseDayTimerDuringTrial: true,
                    
                    startAt: "day/No-Lynch",
                    
                    nightType: "Classic",
                    nightLength: 0.6,
                    
                    enableDiscussion: true,
                    discussionTime: 0.3,
                    
                    revealPlayerRoleOnDeath: true,
                    protectCitizensMode:true,
                    enableCustomName: true,
                    enableKillMessage: true,
                    enableLastWord: true,
                    enablePrivateMessage: true,
                    
                    roleList: [
                        "Citizen", "Citizen",
                        "AuxiliaryOfficer", "AuxiliaryOfficer", 
                        "Mafioso", "Mafioso", 
                    ],
                }
            }
        ],
        selectPreset(preset){
            this.selectedPreset = preset
            //todo: 同步选择的预设
        },
        useSelectedPreset(){
            if(this.selectedPreset??false)
                this.setting = cloneDeep(this.selectedPreset.setting)
        },
        importSetting(){
            let importJsonString = prompt("请输入导出字符串: ")
            if(typeof(importJsonString) === 'string'){
                try{
                    this.setting = JSON.parse(window.atob(importJsonString))
                }catch(e){
                    alert("导入错误，请重试。")
                }
            }
        },
        exportSetting(){
            let s = JSON.stringify(this.setting);
            let exportString = window.btoa(s)
            alert("导出结果为: \n\n" + exportString);
        },

        // 聊天框及玩家列表
        messageList:[],
        messageLog:[],
        inputString:'',
        addMessage(message){
            this.addMessageWithoutLog(message)
            this.messageLog.push(message)
        },
        addMessageWithoutLog(message){
            this.messageList.push(message)
            this.$nextTick(()=>{scrollToBottom('chatMessageList')})
        },

        playerList:[],
        //todo，别忘了还有接收函数
        submit(){
            if(/^\s*$/.test(this.inputString) === false){
                if(/^-/.test(this.inputString) === false){
                    sendEvent("ChatMessage", this.inputString)
                }
                else{
                    let str = this.inputString.substring(1);
                    if(this.status === 'begin' && this.setting.enableCustomName)
                        sendEvent("PlayerRename", str)
                    else{
                        [command, ...args] = str.split(" ")

                        switch(command){
                            case 'repick':
                                this.repickHost(args.shift())
                            break
                        }
                    }
                }
            }
            this.inputString = ''
        },
        clearMssagesList(){
            this.messageList = []
        },

        // 主机和重选主机按钮
        host:{},
        repickHost(playerIndex){
            sendEvent("RepickHost", playerIndex)
        },

        //角色目录与列表
        affiliationSet:[
            {
                name:"Town",
                nameZh:"城镇",
                color:"lime",
                goalDescriptionZh:"处死所有罪犯和恶人。"
            },
            {
                name:"Mafia",
                nameZh:"黑手党",
                color:"red",
                goalDescriptionZh:"杀光城镇以及所有想要对抗你们的人。"

            },
            // {
            //     name:"Random",
            //     nameZh:"随机",
            //     color:"#00ccff",
            // },
        ],
        selectedAffiliation:undefined,
        selectAffiliation(affiliation){
            this.selectedAffiliation = affiliation
            this.selectedRole = undefined
        },
        getAffiliationByName(affiliationName){
            return this.affiliationSet.find( a => a.name === affiliationName )
        },

        roleSet:[
            {
                name:"Citizen",
                nameZh:"市民",
                affiliationName:"Town",
                descriptionZh:"一个相信真理和正义的普通人",
                abilityDescriptionZh:"市民默认没有任何特殊能力",
                // victoryGoalDescriptionZh:"",
                otherDescriptionZh:"市民在这个游戏中默认为最为普遍的角色",
                abilityDetails:["你没有任何特殊能力。"],
                featureDetails:["如果所有市民死亡，则城镇输掉这场游戏。"]
            },
            // {
            //     name:"Sheriff",
            //     nameZh:"警长",
            //     affiliationName:"Town",
            //     descriptionZh:"一个执法机构的成员，迫于谋杀的威胁而身处隐匿。",
            //     abilityDescriptionZh:"这个角色有每晚侦查一人有无犯罪活动的能力。",
            // },
            {
                name:"AuxiliaryOfficer",
                nameZh:"辅警",
                affiliationName:"Town",
                descriptionZh:"一名与同僚熟络的辅助警员。",
                abilityDescriptionZh:"这个角色有在夜晚与其他辅警合作侦查的能力。",
                abilityDetails:["每晚投票调查一人的阵营。"],
                featureDetails:[
                    "在晚上你可以与其他辅警交谈。",
                    "你知道其他辅警的身份。" ,
                    "辅警团队在晚上可以投票（随机）派出一人调查某人的阵营。",
                    "调查结果全团可知，但如果调查人被杀，则没有结果。"
                ]
            },
            // {
            //     name:"Doctor",
            //     nameZh:"医生",
            //     affiliationName:"Town",
            //     descriptionZh:"一个熟练于医治外伤的秘密外科医生。",
            //     abilityDescriptionZh:"这个角色有每晚救治一人，使其免受一次死亡的能力。",
            // },
            {
                name:"Mafioso",
                nameZh:"党徒",
                affiliationName:"Mafia",
                descriptionZh:"一个犯罪组织的成员。",
                abilityDescriptionZh:"这个角色有在夜晚与其他黑手党合作杀人的能力。",
                abilityDetails:["每晚投票杀死一人。"],
                featureDetails:[
                    "在晚上你可以与其他黑手党成员交谈",
                ]
            },
        ],
        roleSetInit(){
            this.setRoleAffiliation()
            this.setRoleColor()
            this.roleSet.forEach(r=>{
                r.getNameMessagePart = (additionalString)=>{
                    return {text:r.nameZh+(additionalString??''), style:`color:${r.color};`}
                }
            })
        },
        setRoleAffiliation(){
            this.roleSet.forEach(r => {
                r.affiliation = this.affiliationSet.find(a => a.name === r.affiliationName)
            })
        },
        setRoleColor(){
            this.roleSet.forEach(r =>{
                Object.defineProperty(r, 'color', {
                    get: function() {
                      return this.affiliation?.color
                    },
                    enumerable: true,
                    configurable: true
                })
            })
        },
        getRoleSetByAffiliationName(affiliationName){
            return  this.roleSet.filter(r => r.affiliationName === affiliationName)
        },
        selectedRole:undefined,
        selectRole(role){
            this.selectedRole = role
            this.selectedAffiliation = role.affiliation
        },

        addSelectedRole(){
            if(this.selectedRole !== undefined){
                this.setting.roleList.push(this.selectedRole?.name)
                this.setting.roleList.sort((a,b)=>{
                    return this.roleSet.indexOf(this.roleSet.find(r => r.name === a)) - this.roleSet.indexOf(this.roleSet.find(r => r.name === b))
                })
            }
        },
        removeSelectedRole(){
            let roleIndex = this.setting.roleList.lastIndexOf(this.selectedRole?.name)
            if(roleIndex !== -1)
                this.setting.roleList.splice(roleIndex, 1)
        },

        getRoleListFromData(roleListData){
            return roleListData.map(rd => this.roleSet.find(r => r.name === rd))
        },

        //开始信息及按钮
        startInfo:"",
        startButtonToggle:true,
        start(){
            if(this.startButtonToggle === true){
                sendEvent("HostSetupGame", this.setting)
            }else{
                sendEvent("HostCancelSetup")
            }
        },

        //计时器组件
        timer:undefined,
        createTimer(name, durationMin, callback){
            this.timer = {
                name,
                durationSec: 60 * durationMin,
                update(){
                    if(this.durationSec === 0){
                        clearTimeout(this.timerId)
                        if(callback??false)
                            callback()
                        return
                    }

                    // 首次运行
                    if(this.timerId === undefined){
                        this.timerId = setTimeout(()=>{this.update()}, 1000)
                    }else{
                        this.durationSec --
                        this.timerId = setTimeout(()=>{this.update()}, 1000)
                    }
                },
            }
            this.timer.update()
        },

        // 游戏页面中心的提示
        gamePageTipMessage:undefined,

        // 一些游戏数据
        myRole:undefined,
        myTeam:undefined,
    }))

    function cloneDeep(o){
        return JSON.parse(JSON.stringify(o))
    }

    function onMessage(e){
        const event = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent(event.type, { detail:event.data }))
        console.log('recive <-', e)
    }

    function sendEvent(type, data){
        const event = {type,data}
        // console.log(event)
        socket?.send(JSON.stringify(event))
    }

    function scrollToBottom(elementClass) {
        const content = document.querySelector(`.${elementClass}`);
        content.scrollTop = content.scrollHeight;
    }
})

class Player{
    constructor(playerData, color){
        this.data   = playerData
        this.color  = html5ColorHexMap[color]??(color.startsWith('#')? color:`#${color}`)
    }

    get name(){
        return this.data.name
    }

    get index(){
        return this.data.index
    }

    getNameMessagePart(additionalString){
        return {text:this.name+(additionalString??''), style:`font-weight:bold;color:${this.color};`}
    }
}

const html5ColorHexMap = {
    "aliceblue": "#f0f8ff", "antiquewhite": "#faebd7", "aqua": "#00ffff", "aquamarine": "#7fffd4", "azure": "#f0ffff",
    "beige": "#f5f5dc", "bisque": "#ffe4c4", "black": "#000000", "blanchedalmond": "#ffebcd", "blue": "#0000ff",
    "blueviolet": "#8a2be2", "brown": "#a52a2a", "burlywood": "#deb887", "cadetblue": "#5f9ea0", "chartreuse": "#7fff00",
    "chocolate": "#d2691e", "coral": "#ff7f50", "cornflowerblue": "#6495ed", "cornsilk": "#fff8dc", "crimson": "#dc143c",
    "cyan": "#00ffff", "darkblue": "#00008b", "darkcyan": "#008b8b", "darkgoldenrod": "#b8860b", "darkgray": "#a9a9a9",
    "darkgrey": "#a9a9a9", "darkgreen": "#006400", "darkkhaki": "#bdb76b", "darkmagenta": "#8b008b", "darkolivegreen": "#556b2f",
    "darkorange": "#ff8c00", "darkorchid": "#9932cc", "darkred": "#8b0000", "darksalmon": "#e9967a", "darkseagreen": "#8fbc8f",
    "darkslateblue": "#483d8b", "darkslategray": "#2f4f4f", "darkslategrey": "#2f4f4f", "darkturquoise": "#00ced1", "darkviolet": "#9400d3",
    "deeppink": "#ff1493", "deepskyblue": "#00bfff", "dimgray": "#696969", "dimgrey": "#696969", "dodgerblue": "#1e90ff",
    "firebrick": "#b22222", "floralwhite": "#fffaf0", "forestgreen": "#228b22", "fuchsia": "#ff00ff", "gainsboro": "#dcdcdc",
    "ghostwhite": "#f8f8ff", "gold": "#ffd700", "goldenrod": "#daa520", "gray": "#808080", "grey": "#808080",
    "green": "#008000", "greenyellow": "#adff2f", "honeydew": "#f0fff0", "hotpink": "#ff69b4", "indianred": "#cd5c5c",
    "indigo": "#4b0082", "ivory": "#fffff0", "khaki": "#f0e68c", "lavender": "#e6e6fa", "lavenderblush": "#fff0f5",
    "lawngreen": "#7cfc00", "lemonchiffon": "#fffacd", "lightblue": "#add8e6", "lightcoral": "#f08080", "lightcyan": "#e0ffff",
    "lightgoldenrodyellow": "#fafad2", "lightgray": "#d3d3d3", "lightgrey": "#d3d3d3", "lightgreen": "#90ee90", "lightpink": "#ffb6c1",
    "lightsalmon": "#ffa07a", "lightseagreen": "#20b2aa", "lightskyblue": "#87cefa", "lightslategray": "#778899", "lightslategrey": "#778899",
    "lightsteelblue": "#b0c4de", "lightyellow": "#ffffe0", "lime": "#00ff00", "limegreen": "#32cd32", "linen": "#faf0e6",
    "magenta": "#ff00ff", "maroon": "#800000", "mediumaquamarine": "#66cdaa", "mediumblue": "#0000cd", "mediumorchid": "#ba55d3",
    "mediumpurple": "#9370db", "mediumseagreen": "#3cb371", "mediumslateblue": "#7b68ee", "mediumspringgreen": "#00fa9a", "mediumturquoise": "#48d1cc",
    "mediumvioletred": "#c71585", "midnightblue": "#191970", "mintcream": "#f5fffa", "mistyrose": "#ffe4e1", "moccasin": "#ffe4b5",
    "navajowhite": "#ffdead", "navy": "#000080", "oldlace": "#fdf5e6", "olive": "#808000", "olivedrab": "#6b8e23",
    "orange": "#ffa500", "orangered": "#ff4500", "orchid": "#da70d6", "palegoldenrod": "#eee8aa", "palegreen": "#98fb98",
    "paleturquoise": "#afeeee", "palevioletred": "#db7093", "papayawhip": "#ffefd5", "peachpuff": "#ffdab9", "peru": "#cd853f",
    "pink": "#ffc0cb", "plum": "#dda0dd", "powderblue": "#b0e0e6", "purple": "#800080", "rebeccapurple": "#663399",
    "red": "#ff0000", "rosybrown": "#bc8f8f", "royalblue": "#4169e1", "saddlebrown": "#8b4513", "salmon": "#fa8072",
    "sandybrown": "#f4a460", "seagreen": "#2e8b57", "seashell": "#fff5ee", "sienna": "#a0522d", "silver": "#c0c0c0",
    "skyblue": "#87ceeb", "slateblue": "#6a5acd", "slategray": "#708090", "slategrey": "#708090", "snow": "#fffafa",
    "springgreen": "#00ff7f", "steelblue": "#4682b4", "tan": "#d2b48c", "teal": "#008080", "thistle": "#d8bfd8",
    "tomato": "#ff6347", "turquoise": "#40e0d0", "violet": "#ee82ee", "wheat": "#f5deb3", "white": "#ffffff",
    "whitesmoke": "#f5f5f5", "yellow": "#ffff00", "yellowgreen": "#9acd32"
};
