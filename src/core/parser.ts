import * as cheerio from 'cheerio'
import { Context } from 'koishi'
import { Config, rssArg } from '../types'
import { debug } from '../utils/logger'
import { parseContent } from '../utils/common'

const X2JS = require("x2js")
const x2js = new X2JS()

export async function getRssData(
  ctx: Context,
  config: Config,
  $http: any,
  url: string,
  arg: rssArg
): Promise<any[]> {
  try {
    // --- HTML 抓取预处理 START ---
    let rssData: any
    let contentType = ''

    if (arg.type === 'html' && arg.mode === 'puppeteer') {
      // Puppeteer 动态渲染模式
      if (!ctx.puppeteer) throw new Error('未安装 puppeteer 插件，无法使用动态渲染模式')

      const page = await ctx.puppeteer.page()
      try {
        debug(config, `Puppeteer抓取: ${url}`, 'html-scraping', 'info')

        // 设置 User-Agent (使用默认 UA)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        // 隐藏 webdriver
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false })
        })

        await page.setViewport({ width: 1920, height: 1080 })
        await page.goto(url, { waitUntil: 'networkidle2', timeout: (arg.timeout || 30) * 1000 })

        // 等待特定元素或时间
        if (arg.waitSelector) {
          try { await page.waitForSelector(arg.waitSelector, { timeout: 5000 }) } catch (e) {}
        } else if (arg.waitFor) {
          await new Promise(r => setTimeout(r, arg.waitFor))
        }

        // 模拟滚动触发懒加载
        await page.evaluate(async () => {
          window.scrollBy(0, window.innerHeight)
        })
        await new Promise(r => setTimeout(r, 1000))

        rssData = await page.content()
        contentType = 'text/html'
      } finally {
        try { await page.close() } catch (e) { /* 忽略页面已关闭的错误 */ }
      }
    } else {
      // 静态模式：使用 axios
      const res = await $http(url, arg)
      rssData = res.data
      contentType = res.headers['content-type'] || ''
    }
    // --- HTML 抓取预处理 END ---

    // --- 新增：JSON 格式处理逻辑 (支持 ?format=json 等) ---
    let isJson = false;
    if (typeof rssData === 'object' && rssData !== null) {
      isJson = true;
    } else if (typeof rssData === 'string' && (rssData.trim().startsWith('{') || contentType.includes('json'))) {
      try {
        rssData = JSON.parse(rssData);
        isJson = true;
      } catch (e) { /* ignore */ }
    }

    if (isJson) {
      debug(config, rssData, 'JSON Feed Response', 'details');

      // 构造兼容 XML 结构的父级对象，以便模板使用 {{rss.channel.title}}
      const rssMock = {
        channel: {
          title: rssData.title || 'Unknown Title',
          description: rssData.description || rssData.home_page_url || '',
          link: rssData.home_page_url || url,
          image: { url: rssData.icon || rssData.favicon || '' }
        }
      };

      let items = [];
      // 标准 JSON Feed (v1/v1.1) 使用 'items'
      if (Array.isArray(rssData.items)) {
        items = rssData.items.map(item => ({
          title: item.title || '',
          // JSON Feed 优先使用 content_html，其次 content_text
          description: item.content_html || item.content_text || item.summary || '',
          link: item.url || item.id,
          guid: item.id || item.url,
          pubDate: item.date_published || item.date_modified,
          author: item.author?.name || rssData.author?.name || '',
          rss: rssMock // 注入父级引用
        }));
      }
      // 兼容 RSSHub ?format=debug.json 或其他类 JSON 结构
      else if (rssData.objects && Array.isArray(rssData.objects)) {
        // 针对 RSS3 UMS 或部分特定结构尝试解析
        items = rssData.objects.map(item => ({
           title: item.title || item.type || 'No Title',
           description: item.content || item.summary || JSON.stringify(item),
           link: item.link || item.url || url,
           guid: item.id || item.hash,
           pubDate: item.date_published || item.created_at || item.timestamp,
           rss: rssMock
        }));
      }

      debug(config, items[0], 'Parsed JSON Item', 'details');
      return items;
    }
    // --- JSON 处理结束 ---

    // --- HTML 抓取逻辑 START ---
    if (arg.type === 'html' && arg.selector) {
      debug(config, `HTML抓取: ${url} selector: ${arg.selector}`, 'html-scraping', 'info');
      const $ = cheerio.load(rssData);
      const selected = $(arg.selector);

      if (selected.length === 0) {
        debug(config, '未找到符合 selector 的元素', 'html-scraping', 'info');
        return [];
      }

      // 构造伪 RSS Items
      const items = selected.map((i, el) => {
        const $el = $(el);

        // 1. 尝试提取标题
        let title = $el.attr('title') || $el.text().trim().replace(/\s+/g, ' ');
        if (title.length > 50) title = title.substring(0, 50) + '...';

        // 2. 尝试提取链接
        let link = $el.attr('href') || $el.find('a').attr('href') || url;
        if (link && !link.startsWith('http')) {
           try {
             link = new URL(link, url).href;
           } catch (e) {}
        }

        // 3. 提取内容
        const description = arg.textOnly ? $el.text().trim() : ($el.html() || '').trim();

        // 4. 生成唯一标识
        const guid = link !== url ? link : description;

        // 5. 构造父级引用
        const rssMock = {
          channel: {
            title: $('title').text() || 'Web Monitor',
            description: url,
            link: url,
            image: { url: '' }
          }
        };

        return {
          title: title || 'No Title',
          description: description,
          link: link,
          guid: guid,
          pubDate: new Date(0), // 静态网页无时间戳，强制走内容对比
          author: 'Web Monitor',
          rss: rssMock
        };
      }).get();

      debug(config, items[0], 'Parsed HTML Item', 'details');
      return items;
    }
    // --- HTML 抓取逻辑 END ---

    // --- 原有 XML 处理逻辑 ---
    const rssJson = x2js.xml2js(rssData)

    if (rssJson.rss) {
      // RSS 2.0
      rssJson.rss.channel.item = [rssJson.rss.channel.item].flat(Infinity)
      const rssItemList = rssJson.rss.channel.item.map(i => ({ ...i, guid: parseContent(i?.guid), rss: rssJson.rss }))
      return rssItemList
    } else if (rssJson.feed) {
      // Atom
      let rss = { channel: {} }
      let item = rssJson.feed.entry.map(i => ({
        ...i,
        title: parseContent(i.title),
        description: parseContent(i.content),
        link: parseContent(i.link, '_href'),
        guid: parseContent(i.id),
        pubDate: parseContent(i.updated),
        author: parseContent(i.author, 'name'),
      }))
      rss.channel = {
        title: rssJson.feed.title,
        link: rssJson.feed.link?.[0]?.href || rssJson.feed.link?.href,
        description: rssJson.feed.summary,
        generator: rssJson.feed.generator,
        language: rssJson.feed['@xml:lang'],
        item
      }
      item = item.map(i => ({ rss, ...i }))
      debug(config, item, 'atom item', 'details')
      return item
    } else {
      debug(config, rssJson, '未知rss格式，请提交issue', 'error')
      // 如果解析失败返回空数组，避免 crash
      return []
    }
  } catch (error) {
    debug(config, `Failed to fetch RSS from ${url}`, '', 'error')
    throw error
  }
}
