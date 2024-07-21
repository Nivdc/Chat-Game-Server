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
                message.parts.push({text:' 是新的主机', class:'text-warning'})
                this.addMessage(message)
            })
            window.addEventListener('SetPlayerList', (e) => {
                let playerDatas = e.detail
                // let playerColors = [
                //     "B4141E","0042FF","1CA7EA",
                //     "6900A1","EBE129","FE8A0E",
                //     "168000","CCA6FC","A633BF",
                //     "525494","168962","753F06",
                //     "96FF91","464646","E55BB0"
                // ];

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
                this.addMessageWithColor("游戏将在15秒后开始", 'LawnGreen')
                this.startButtonToggle = false
            })
            window.addEventListener('HostCancelSetup', (e) => {
                this.addMessageWithColor("主机取消了开始", 'yellow')
                this.startButtonToggle = true
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
                    enableCustomName: true,
                    enableKillMessage: true,
                    enableLastWord: true,
                    enablePrivateMessage: true,
                    
                    roleList: [
                        "Citizen", "Citizen", "Citizen", "Citizen", "Citizen",
                        "Citizen", "Citizen",
                        "Sheriff", "Sheriff", "Sheriff", "Sheriff",
                        "Mafioso", "Mafioso", "Mafioso", "Mafioso"
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
            this.messageList.push(message)
            this.messageLog.push(message)
        },
        addMessageWithoutLog(message){
            this.messageList.push(message)
        },
        addMessageWithColor(text, color){
            color = color.toLowerCase()
            let style = `color:${html5ColorHexMap[color]??`${color}`}`
            let message = {parts:[], style}
            message.parts.push({text})
            this.addMessage(message)
        },
        addMessageWithClass(text, cssClass){
            let message = {parts:[], class:cssClass}
            message.parts.push({text})
            this.addMessage(message)
        },
        addSystemWarningMessage(text, style, cssClass){
            let message = {parts:[]}
            message.parts.push({text, style, class:'text-warning'+cssClass})
            this.addMessage(message)
        },
        // buildMessage(sender, text){
        //     return {sender, text}
        // },
        // buildSystemWarningMessage(warningString){
        //     return  this.buildMessage({name:'系统', hide:true}, {message:warningString, class:'text-warning'})
        // },

        playerList:[],
        //todo，别忘了还有接收函数
        submit(){
            if(/^\s*$/.test(this.inputString) === false){
                if(/^-/.test(this.inputString) === false){
                    sendEvent("ChatMessage", this.inputString)
                }
                else{
                    let str = this.inputString.substring(1);
                    [command, ...args] = str.split(" ")

                    switch(command){
                        case 'repick':
                            this.repickHost(args.shift())
                        break

                        default:
                            // sendEvent("rename", args.shift())
                    }
                }
            }
            this.inputString = ''
        },
        clearMssagesList(){
            this.messageList = []
        },

        //todo
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
            },
            {
                name:"Mafia",
                nameZh:"黑手党",
                color:"red",
            },
            {
                name:"Random",
                nameZh:"随机",
                color:"#00ccff",
            },
        ],
        selectedAffiliation:undefined,
        selectAffiliation(affiliation){
            this.selectedAffiliation = affiliation
        },
        getAffiliationByName(affiliationName){
            return this.affiliationSet.find( a => a.name === affiliationName )
        },

        roleSet:[
            {
                name:"Citizen",
                nameZh:"市民",
                affiliationName:"Town",
            },
            {
                name:"Sheriff",
                nameZh:"警长",
                affiliationName:"Town",
            },
            {
                name:"Doctor",
                nameZh:"医生",
                affiliationName:"Town",
            },
            {
                name:"Mafioso",
                nameZh:"党徒",
                affiliationName:"Mafia",
            },
        ],
        getRoleSetByAffiliationName(affiliationName){
            return  this.roleSet.filter(r => r.affiliationName === affiliationName)
                                .map(r => {
                                    r.affiliation = this.affiliationSet.find(a => a.name === r.affiliationName)
                                    return r
                                })
        },
        selectedRole:undefined,
        selectRole(role){
            this.selectedRole = role
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
        }

    }))

    function cloneDeep(o){
        return JSON.parse(JSON.stringify(o))
    }

    function onMessage(e){
        const event = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent(event.type, { detail:event.data }))
        console.log(e)
    }

    function sendEvent(type, data){
        const event = {type,data}
        console.log(event)
        socket?.send(JSON.stringify(event))
    }
})

class MessagePart{
    constructor(text, style, cssClass){
        this.text  = text
        this.style = style
        this.class = cssClass
    }

    toString(){
        return this.text
    }
}

class Player{
    constructor(playerData, color){
        this.data   = playerData
        this.color  = html5ColorHexMap[color]??color
    }

    get name(){
        return this.data.name
    }

    get index(){
        return this.data.index
    }

    getNameMessagePart(additionalString){
        return {text:this.name+(additionalString??''), style:`font-weight:bold;color:${this.color}`}
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
