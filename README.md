# 简介/Introduction
这个项目的目标是创建一个简单、易于使用的网页在线游戏平台，目前主要用于托管[网页版SC2Mafia](https://github.com/Nivdc/lobby/tree/master/src/public/gamePackages/sc2mafia)。  
The goal of this project is to create a simple, easy-to-use web-based online gaming platform, currently used primarily for hosting the [web version of SC2Mafia](https://github.com/Nivdc/lobby/tree/master/src/public/gamePackages/sc2mafia).  

## 如何帮助本项目/How to help this project
请随意以任何方式询问任何问题，只有当你提出了一个问题之后文档里才会多一个答案。  
Please feel free to ask any questions in any way, only when you ask a question there will be one more answer in the document.

## 如何部署/How to deploy
对于一般的应用场景，只需要下载后解压缩然后在文件所在目录运行```bun run start```即可。  
如果要部署到服务器上，则推荐使用[Nginx](https://nginx.org/en/)分发静态文件，可用的配置文件[在此](https://gist.github.com/Nivdc/dfec8029a85000231700b56bb76e33b5)。(我还没来得及删掉一些注释...就暂时先留着吧)  

For general usage scenarios, you only need to download, decompress and run ```bun run start``` in the directory where the files is located.    
If you want to deploy on a server, it is recommended to use [Nginx](https://nginx.org/en/) to distribute static files, and the available configuration file are [here](https://gist.github.com/Nivdc/dfec8029a85000231700b56bb76e33b5). (I haven't had time to delete some comments yet...just keep it for now)

## 使用技术/Built With
* [Bun](https://bun.sh/) - fast JavaScript all-in-one toolkit.  
* [Alpine.js](https://alpinejs.dev/) - What you should learn after learning Jquery.  

## 已知问题
* 用户退出游戏不视为退出房间。不好说这是不是bug，但是确实和星际争霸2的逻辑不一样。 
* 由于目前（且长期都可能）只有一个游戏，前端页面选择游戏的选项暂时被锁死了...因为懒得弄... 

### 前端问题
* 使用Safari浏览器时滚动条的样式不正确。（这是由于Safari浏览器没有实现[滚动条的样式属性](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_scrollbars_styling)）  