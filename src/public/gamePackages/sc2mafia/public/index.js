let socket = undefined

document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        loading:true,
        watchIgnore:false,
        setting:{},

        async init() {
            this.setting = await (await fetch("./gameData/defaultSetting.json")).json()
            this.socketInit()
            this.loading = false

            this.$watch('setting', (value, oldValue)=>{
                if(this.watchIgnore === false){
                    const event = {type:"HostChangesGameSetting",data:value}
                    socket?.send(JSON.stringify(event))
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
        },
    }))

    function onMessage(e){
        const event = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent(event.type, { detail:event.data }))
    }
})