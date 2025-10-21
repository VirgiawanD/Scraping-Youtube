import {chromium} from 'playwright';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { parse } from 'json2csv';
import { error } from 'console';

(async () => {
    const spinner = ora('').start();
    const browser = await chromium.launch({
        headless: false,
        slowMo: 100,
    });
    const page = await browser.newPage();

    // spinner.text = 'loading...';
    await page.goto(
        'https://www.youtube.com/watch?v=B2nY9RKXMUY', {
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
    console.log(chalk.gray('🌀 Scrolling comments...'));
    let prevCommentCount = 0;
    let prevLoaded = 0;
    let stableRounds = 0;
    let totalComment = 0;
    const startTime = Date.now();

    try {
        await page.waitForSelector('ytd-comments-header-renderer #count .count-text span', { timeout: 5000 });
        totalComment = await page.evaluate(() => {
            const el = document.querySelector('ytd-comments-header-renderer #count .count-text');
            if (!el) return 0;
            const match = el.textContent.match(/[\d,.]+/);
            return match ? parseInt(match[0].replace(/[,.]/g, '')) : 0;
        });
    } catch {
        totalComment = 0;
    }

    console.log(chalk.gray(`💬 Estimated total comments: ${totalComment || 'Unknown'}`));
    
    while (true) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(2500);

        const currentLoaded = await page.$$eval('#content #content-text', els => els.length);

        if (currentLoaded > prevLoaded) {
            const progress = totalComment ? ((currentLoaded / totalComment) * 100).toFixed(1) : '...';
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            spinner.text = chalk.cyan(`🔽 Loaded ${currentLoaded} comments (${progress}% | ${elapsed}s elapsed)`);
            prevLoaded = currentLoaded;
        }

        if (currentLoaded === prevCommentCount) {
            stableRounds++;
            if (stableRounds >= 5) break;
        } else {
            stableRounds = 0;
            prevCommentCount = currentLoaded;
        }
    }

    console.log(chalk.gray('\t✅ All Comments loaded.'));
    
    await page.waitForSelector('ytd-comments-header-renderer #count .count-text span');

    // Path Comment
    const saveTitle = title.replace(/[<>:"/\\|?*]+/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').trim();
    const outputDir = path.join(process.cwd(), 'scrapes', saveTitle);
    fs.mkdirSync(outputDir, {recursive: true});

    // Replies Comment
    console.log(chalk.gray('\t🧩 Expanding all replies...'));
    let expandedCount = 0;
    let prevReplyCount = 0;

    for (let i = 0; i < 20; i++) {
        const buttons = await page.$$('ytd-button-renderer#more-replies');
        if (buttons.length === 0) {
            stableRounds++;
            if (stableRounds >= 3) break;
        } else {
            for (const btn of buttons) {
                try {
                    await btn.click();
                    expandedCount++;
                    await page.waitForTimeout(1000);
                } catch {}
            }
        }
        await page.waitForTimeout(2000);

        const currentReplies = await page.$$eval('ytd-comment-renderer #content #content-text', els => els.length);
        if (currentReplies === prevReplyCount) {
            stableRounds++;
            if (stableRounds >= 3) break;
        } else {
            stableRounds = 0;
            prevReplyCount = currentReplies;
        }
    }
    
    console.log(chalk.gray(`\t✅ Expanded ${expandedCount} reply sections.`));

    // Download Comment
    const comments = await page.$$eval('#content #content-text', els =>
        els.map(e => e.textContent.trim()).filter(Boolean)
    );

    if (comments.length) {
        const csv = parse(comments.map((comment, i) => ({ No: i + 1, Comment:comment})));
        const filePath = path.join(outputDir, 'youtube_comments.csv');
        fs.writeFileSync(filePath, csv, 'utf-8');

        console.log(chalk.greenBright(`\n💾 ${comments.length} comments saved to ${filePath}`));
    } else {
        console.log(chalk.red('⚠️ No comments found.'));
    }

    const stats = await page.evaluate(() => {
        const replies = document.querySelectorAll('ytd-button-renderer#more-replies').length;
        return {comments, replies};
    });
    console.log(chalk.cyan(`🧮 Main comments: ${stats.totalComment}, Replies: ${stats.replies}\n`));

    spinner.succeed(`Success\n`);

    console.log(`${chalk.cyan.bold("📹 Title       :")} ${chalk.cyan(title)}`);
    console.log(`${chalk.yellow.bold("📺 Channel     :")} ${chalk.yellow(channel)}`);
    console.log(`${chalk.magenta.bold("👥 Subscriber  :")} ${chalk.magenta(subs)}`);
    console.log(`${chalk.blue.bold("⏳ Duration    :")} ${chalk.blue(times)}`);
    console.log(`${chalk.redBright.bold("👁️  Views       :")} ${chalk.redBright(views)}`);
    console.log(`${chalk.green.bold("👍 Likes       :")} ${chalk.green(likeCount)}`);
    console.log(`${chalk.gray.bold("💬 Comments    :")} ${chalk.gray(totalComment)}\n`);

    console.log(`${chalk.white.bold("📃 Description :")}`);
    console.log(chalk.white(description));
        
    await browser.close();
})();