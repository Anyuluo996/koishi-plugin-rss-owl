import { Config } from '../types'

export const getDefaultTemplate = (config: Config, bodyWidth: number | undefined, bodyPadding: number | undefined, bodyFontSize: number | undefined) =>
  `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>{{title}}</title>
<!-- 引入 Tailwind CSS 和 Typography 插件 -->
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet"/>
<script>
    tailwind.config = {
    theme: {
        extend: {
        colors: {
            primary: "#3B82F6",
            "background-light": "#F8FAFC",
        },
        fontFamily: {
            display: ["Inter", "sans-serif"],
            mono: ["JetBrains Mono", "monospace"],
        },
        },
    },
    };
</script>
<style>
    body {
        margin: 0;
        /* 根据配置设置宽度和内边距 */
        width: ${bodyWidth || config.template.bodyWidth}px;
        padding: ${bodyPadding || config.template.bodyPadding}px;
        box-sizing: border-box;
        font-family: 'Inter', sans-serif;
        background-color: #F8FAFC;
    }

    /* 针对 RSS 内容 (HTML) 的样式修正 */
    .prose {
        max-width: none;
        color: #475569; /* slate-600 */
        ${bodyFontSize ? `font-size: ${bodyFontSize}px;` : ''}
    }
    .prose img {
        border-radius: 8px;
        margin-top: 1rem;
        margin-bottom: 1rem;
        max-width: 100%;
        height: auto;
    }
    .prose a {
        color: #3B82F6;
        text-decoration: none;
    }
    .prose p {
        margin-top: 0.5em;
        margin-bottom: 0.5em;
        line-height: 1.6;
    }
</style>
</head>
<body>
    <!-- 外部容器 -->
    <div class="relative group w-full">
        <!-- 背景光晕效果 -->
        <div class="absolute -inset-1 bg-gradient-to-r from-primary to-cyan-400 rounded-2xl blur opacity-10"></div>

        <!-- 卡片主体 -->
        <div class="relative bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
            <!-- 左侧装饰条 -->
            <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>

            <!-- 右上角标签 (可选) -->
            <div class="absolute top-4 right-4 flex gap-2">
                <span class="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-slate-100 text-slate-500 border border-slate-200 rounded">
                    {{rss.channel.title}}
                </span>
            </div>

            <div class="p-8">
                <!-- 头部信息 -->
                <div class="mb-6">
                    <div class="flex items-start gap-3 mb-2">
                        <div class="mt-1 w-8 h-8 rounded-lg bg-primary/10 flex flex-shrink-0 items-center justify-center overflow-hidden">
                            <!-- RSS Feed Icon -->
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-primary">
                                <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9zM4 18c0 1.1.9 2 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z"/>
                            </svg>
                        </div>
                        <h2 class="text-xl font-bold text-slate-800 leading-tight">{{title}}</h2>
                    </div>
                    <div class="flex items-center text-slate-400 text-xs font-medium pl-11">
                        <!-- Calendar SVG Icon -->
                        <svg class="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="#94A3B8" stroke-width="2"/>
                            <path d="M16 2v4M8 2v4" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/>
                            <path d="M3 10h18" stroke="#94A3B8" stroke-width="2"/>
                        </svg>
                        {{pubDate}}
                    </div>
                </div>

                <!-- 内容区域 (使用 prose 类处理 HTML 内容) -->
                <div class="pl-11 prose prose-slate">
                    {{description}}
                </div>

                <!-- 底部信息 -->
                <div class="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="flex items-center text-xs text-slate-400 pl-11">
                        <!-- Link SVG Icon -->
                        <svg class="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        From: <span class="ml-1 text-primary font-mono">{{rss.channel.description}}</span>
                    </div>
                </div>
            </div>

            <!-- 角落装饰 -->
            <div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary/20 rounded-tl-lg"></div>
            <div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary/20 rounded-br-lg"></div>
        </div>
    </div>
</body>
</html>`

export const getDescriptionTemplate = (config: Config, bodyWidth: number | undefined, bodyPadding: number | undefined, bodyFontSize: number | undefined) =>
  `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;display=swap" rel="stylesheet"/>
<style>
body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    padding: 20px;
}
.card {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    max-width: ${bodyWidth || config.template.bodyWidth}px;
    width: 100%;
    overflow: hidden;
}
.card-content {
    padding: ${bodyPadding || config.template.bodyPadding}px;
    color: #2d3748;
    line-height: 1.7;
    ${bodyFontSize ? `font-size: ${bodyFontSize}px;` : ''}
}
.card-content img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 12px 0;
}
</style>
</head>
<body>
<div class="card">
    <div class="card-content">{{description}}</div>
</div>
</body>
</html>`
