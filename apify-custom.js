import {chromium} from 'playwright';
import ora from 'ora';
import chalk from 'chalk';
import { error } from 'console';

(async () => {
    const spinner = ora('loading...').start();
    const browser = await chromium.launch({
        headless: false,
        slowMo: 100,
    });
    const page = await browser.newPage();

    spinner.text = 'loading...';
    await page.goto(
        'https://www.youtube.com/watch?v=aYCCt83fv74', {
            waitUntil: 'networkidle'
    });

    try {
        await page.click('button:has-text("Terima semua")', { timeout: 5000 });
    } catch {}

    await page.waitForSelector('h1 > yt-formatted-string');
    await page.waitForTimeout(2000);

    const title     = await page.locator('h1 > yt-formatted-string').first().innerText();
    const channel   = await page.locator('#channel-name').first().innerText();
    const subs      = await page.locator('#owner-sub-count').innerText();
    const times     = await page.locator('span.ytp-time-duration').innerText();
    const views     = await page.locator('span.view-count').first().innerText().catch(() => 'Not Avaible');
    
    // Like
    const likeCount = await page.evaluate(() => {
        const el = document.querySelector('div.ytwFactoidRendererFactoid[aria-label*="like"]');
        if (!el) return null;

        const label = el.getAttribute('aria-label');
        const match = label.match(/([\d,.]+)\s*like/i);
        return match ? match[1].replace(/,/g, '') : null;
    });

    // Description
    try {
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(1000);

        const expandButton = page.locator('tp-yt-paper-button#expand:not([hidden])');
        if (await expandButton.count() > 0) {
            await expandButton.first().click();
            await page.waitForTimeout(1500);
        } else {
            await page.click(
                'tp-yt-paper-button:has-text("more"), tp-yt-paper-button:has-text("Lainnya")', 
                { timeout: 5000});
        }
    } catch (error) {
        console.log('Cant click description button: ', error.message);
    }

    await page.waitForSelector('#expanded', {timeout: 8000 }).catch(() => null);

    const description = await page.evaluate(() => {
        const el = document.querySelector('#expanded yt-attributed-string') || document.querySelector('#description-inline-expander yt-attributed-string');
        return el ? el.innerText.trim() : null;
    });

    // Comment
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
    }
    
    await page.waitForSelector('ytd-comments-header-renderer #count .count-text span');

    const comment   = await page.evaluate(() => {
        const el = document.querySelector('ytd-comments-header-renderer #count .count-text');
        if (!el) return null;

        const text = el.textContent.trim();
        return text.match(/[\d,.]+/) ? text.replace(/,/g, '') : null;
    });

    spinner.succeed('Success');

    console.log(`${chalk.cyan.bold("📹 Title       :")} ${chalk.cyan(title)}`);
    console.log(`${chalk.yellow.bold("📺 Channel     :")} ${chalk.yellow(channel)}`);
    console.log(`${chalk.magenta.bold("👥 Subscriber  :")} ${chalk.magenta(subs)}`);
    console.log(`${chalk.blue.bold("⏳ Duration     :")} ${chalk.blue(times)}`);
    console.log(`${chalk.redBright.bold("👁️  Views       :")} ${chalk.redBright(views)}`);
    console.log(`${chalk.green.bold("👍 Likes       :")} ${chalk.green(likeCount)}`);
    console.log(`${chalk.gray.bold("💬 Comments    :")} ${chalk.gray(comment)}\n`);

    console.log(`${chalk.white.bold("📃 Description :")}`);
    console.log(chalk.white(description));


    // console.log(`
    //     📹 Judul       : ${title}
    //     📺 Channel     : ${channel}
    //     👥 Subscriber  : ${subs}
    //     ⏳ Times       : ${times}
    //     👁️  Views       : ${views}
    //     👍 Like        : ${likeCount}
    //     💬 Comment     : ${comment}
    //     📃 Description : ${description ? description : 'Not Found'} 
    // `);
    // panjang desc dibatas : ${description ? description.slice(0, 200) + '...' : 'Not Found'}
        
    await browser.close();
})();