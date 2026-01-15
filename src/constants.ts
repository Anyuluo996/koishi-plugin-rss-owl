export const usage = `
<details>
<summary>RSS-OWL 订阅器使用说明</summary>

## 基本命令:
  rsso &lt;url&gt;              - 订阅RSS链接
  rsso -l                 - 查看订阅列表
  rsso -l [id]            - 查看订阅详情
  rsso -r &lt;content&gt;       - 删除订阅(需要权限)
  rsso -T &lt;url&gt;           - 测试订阅
  rsso.ask &lt;url&gt; &lt;需求&gt;  - AI 智能订阅网页 (需要 AI 配置)
  rsso.watch &lt;url&gt; [关键词] - 简单网页监控 (关键词/整页)

## 常用选项:
  -i &lt;template&gt;          - 设置消息模板
      可选值: content(文字) | default(图片) | custom(自定义) | only text | only media 等
  -t &lt;title&gt;             - 自定义订阅标题
  -a &lt;arg&gt;               - 自定义配置 (格式: key:value,key2:value2)
      例如: -a timeout:30,merge:true

## 高级选项:
  -f &lt;content&gt;           - 关注订阅，更新时提醒
  -fAll &lt;content&gt;        - 全体关注(需要高级权限)
  -target &lt;groupId&gt;      - 跨群订阅(需要高级权限)
  -d &lt;time&gt;              - 定时推送 (格式: "HH:mm/数量" 或 "HH:mm")
      例如: -d "08:00/5" 表示每天8点推送5条
  -p &lt;id&gt;                - 手动拉取最新内容

## 快速订阅:
  rsso -q                - 查看快速订阅列表
  rsso -q [编号]         - 查看快速订阅详情
  rsso -T tg:channel_name  - 快速订阅Telegram频道

## Assets 图片/视频服务配置 (推荐):
  使用 assets 服务可以避免 Base64 超长问题
  1. 在插件市场安装 assets-xxx 插件 (如 assets-local, assets-s3, assets-smms 等)
  2. 在对应插件中配置存储信息 (AccessKey, Secret, Bucket 等)
  3. 在 RSS-Owl 基础设置中将 imageMode/videoMode 设置为 'assets'
  4. 插件会自动上传图片/视频到你的图床服务

## 配置示例:
  rsso -T -i content "https://example.com/rss"
  rsso "https://example.com/rss" -t "我的订阅" -a "timeout:60,merge:true"
  rsso -d "09:00/3" "https://example.com/rss"

</details>

<details>
<summary>网页监控 (rsso.html) - 监控任意网页元素变化</summary>

使用 CSS 选择器监控网页元素变化，支持静态网页和 SPA 动态页面。

## 基本用法:
  rsso.html &lt;url&gt; -s &lt;selector&gt;      - 监控符合选择器的元素

## 常用选项:
  -s, --selector &lt;选择器&gt;    CSS 选择器 (必填)，例如: .news-item、#price、div.list > li
  -t, --title &lt;标题&gt;         自定义订阅标题
  -i, --template &lt;模板&gt;      消息模板 (推荐 content)
  --text                     只提取纯文本 (默认提取 HTML)
  -T, --test                 测试模式，查看抓取预览

## Puppeteer 动态渲染 (解决 SPA/JS 动态内容):
  -P, --puppeteer            使用 Puppeteer 渲染页面 (需要安装 koishi-plugin-puppeteer)
  -w, --wait &lt;毫秒&gt;          渲染后等待时间
  -W, --waitSelector &lt;选择器&gt;  等待特定元素出现

</details>

<details>
<summary>AI 摘要 (ai) - 智能生成内容摘要</summary>

使用 OpenAI 兼容 API 为订阅内容生成 AI 摘要。

## 启用方法:
  1. 在插件配置中开启 AI 功能
  2. 填写 API Base URL、API Key 和模型名称

## 配置项:
  - placement           摘要位置: top (顶部) / bottom (底部)
  - separator          分割线样式
  - prompt             提示词模板 ({{title}} 标题, {{content}} 内容)
  - maxInputLength     最大输入长度 (默认 2000 字)
  - timeout            请求超时 (默认 30000 毫秒)


</details>
`

export const quickList = [
  {prefix:"rss",name:"rsshub通用订阅",detail:"rsshub通用快速订阅\nhttps://docs.rsshub.app/zh/routes/new-media#%E6%97%A9%E6%8A%A5%E7%BD%91",example:"rss:qqorw",replace:"{{rsshub}}/{{route}}"},
  {prefix:"tg",name:"rsshub电报频道订阅",detail:"输入电报频道信息中的链接地址最后部分，需要该频道启用网页预览\nhttps://docs.rsshub.app/zh/routes/social-media#telegram",example:"tg:woshadiao",replace:"{{rsshub}}/telegram/channel/{{route}}"},
  {prefix:"mp-tag",name:"rsshub微信公众平台话题TAG",detail:"一些公众号（如看理想）会在微信文章里添加 Tag，浏览器打开Tag文章列表，如 https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzA3MDM3NjE5NQ==&action=getalbum&album_id=1375870284640911361，输入其中biz和album_id\nhttps://docs.rsshub.app/zh/routes/new-media#%E5%85%AC%E4%BC%97%E5%8F%B7%E6%96%87%E7%AB%A0%E8%AF%9D%E9%A2%98-tag",example:"mp-tag:MzA3MDM3NjE5NQ==/1375870284640911361",replace:"{{rsshub}}/wechat/mp/msgalbum/{{route}}"},
  {prefix:"gh",name:"rsshub-github订阅",detail:"Repo Issue: gh:issue/[:user]/[:repo]/[:state?(open|closed|all)]/[:labels?(open|bug|...)]\nUser Activities: gh:activity/[:user]\nhttps://docs.rsshub.app/zh/routes/popular#github",example:"gh:issue/koishijs/koishi/open",replace:"{{rsshub}}/github/{{route}}"},
  {prefix:"github",name:"原生github订阅(含releases,commits,activity)",detail:"Repo Releases: github::[:owner]/[:repo]/releases\nRepo commits: github:[:owner]/[:repo]/commits\nUser activities:github:[:user]\n",example:"github:facebook/react/releases",replace:"https://github.com/{{route}}.atom"},
  // {prefix:"weibo",name:"微博博主",detail:"输入博主用户id\n公开订阅源对微博支持欠佳，建议自己部署并配置Cookie",example:"weibo:1195230310",replace:"{{rsshub}}/weibo/user/{{route}}"},
  {prefix:"koishi",name:"koishi论坛相关",detail:"最新话题: koishi:latest\n类别: koishi:c/plugin-publish (插件发布)\n话题 koishi:u/shigma/activity\n基于discourse论坛的feed订阅，更多见: https://meta.discourse.org/t/finding-discourse-rss-feeds/264134 或可尝试在网址后面加上 .rss ",example:"koishi:latest",replace:"https://forum.koishi.xyz/{{route}}.rss"},
]
