在之前的Node.js版本的lobby中，底层的通讯机制使用的是SSE(Server-Sent-Event)。
在这个Deno版本中我试着使用WebSocket协议(简称ws协议)。  

ws协议本身[没有类似SSE协议的自定义事件类型系统](https://stackoverflow.com/questions/41982982/how-to-create-custom-events-for-ws-web-socket-module)，因此这就需要我们在ws协议的message事件基础上自己加上一个事件类型系统。  

当前采用的结构是这样的  
```
message = {
    ...//其他属性
    data:{
        type:"someString",//表示事件的类型
        data:someJSONData//该事件传输的其他数据，可选参数
    },
}
```

前后端的ws链接都使用这个结构。