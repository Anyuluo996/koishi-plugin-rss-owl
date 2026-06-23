export const usage = `
<details>
<summary>RSS-OWL 命令导航（发送 rsso 查看本帮助）</summary>

## 新建 / 测试订阅:
  rsso &lt;url&gt;                              - 创建 RSS / Atom / JSON Feed 订阅
  rsso -T &lt;url&gt;                           - 测试抓取，不写入订阅
  rsso &lt;url&gt; -t &lt;标题&gt;                    - 自定义订阅标题
  rsso &lt;url&gt; -i &lt;模板&gt;                    - 指定消息模板
  rsso &lt;url&gt; -a &lt;key:value,...&gt;          - 覆盖订阅参数
  rsso &lt;url&gt; -d &lt;HH:mm[/数量]&gt;           - 每日定时推送
  rsso &lt;url&gt; --target &lt;平台:频道&gt;         - 跨群 / 跨频道订阅（高级权限）
  rsso -q [编号]                          - 查看快速订阅列表 / 详情

## 管理订阅（使用列表序号）:
  rsso.list [id]                          - 查看订阅列表 / 详情
  rsso.remove &lt;id&gt; [--all]               - 删除订阅 / 删除全部
  rsso.pull &lt;id&gt;                         - 拉取订阅最新内容
  rsso.follow &lt;id&gt; [--all]               - 关注订阅更新 / 全员提醒
  rsso.edit &lt;id&gt; [选项]                  - 修改标题、URL、模板、选择器、目标
  rsso.cache                             - 消息缓存管理（list/search/stats/pull/clear/cleanup）
  rsso.queue                             - 发送队列管理（stats/retry/cleanup）

## 网页监控相关:
  rsso.html &lt;url&gt; -s &lt;selector&gt;          - 使用 CSS 选择器监控网页
  rsso.ask &lt;url&gt; &lt;需求&gt;                  - AI 生成选择器后创建网页订阅
  rsso.watch &lt;url&gt; [关键词]              - 简单网页 / 关键词监控

## 常用模板:
  content        - 纯文字正文
  default        - 默认图片模板
  custom         - 自定义模板
  only text      - 仅文本
  only image     - 仅图片
  only media     - 图片 + 视频
  link           - 跟随正文中的第一个链接

## 常用示例:
  rsso https://example.com/rss
  rsso -T tg:woshadiao
  rsso https://example.com/rss -i content -t "示例订阅"
  rsso.list
  rsso.edit 1 -t "新标题"
  rsso.html https://example.com -s ".news-item"

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
