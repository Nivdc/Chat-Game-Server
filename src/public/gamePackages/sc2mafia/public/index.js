let socket = undefined

document.addEventListener('alpine:init', () => {
    Alpine.data('gameSetting', () => ({
        setting:{},
        async init() {
            this.defaultSetting = await (await fetch("./gameData/defaultSetting.json")).json()
            this.setting = this.defaultSetting
            console.log(this.setting)
        },
        gameSettingChanged(){
            console.log(this.setting)
        },
    }))
    init()
})

function init(){
    socket = window.top.socket

    try{
        window.top.game_onmessage = game_onmessage
    }catch(e){
        if(e.name === 'ReferenceError'){
            console.log("调试模式，事件将不会被发送到服务器。")
            socket = {}
            socket.send = console.log
        }
    }

    document.getElementById('loading').style.display = 'none'
}